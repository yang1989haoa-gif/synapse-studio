import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import WebSocket from 'ws'
import db from '../database.js'
import { sseManager } from '../sse.js'
import { buildOpenClawConnectParams, isOpenClawHelloOk } from '../openclaw-connect.js'
import { FlowValidationError, validateFlowConfig } from './flow-validator.js'

export class FlowExecutor extends EventEmitter {
  constructor(openclawGateway, hermesApiUrl) {
    super()
    this.openclaw = openclawGateway
    this.hermesApiUrl = hermesApiUrl
    this.running = new Map()
  }

  _openAiChatUrl(baseUrl) {
    const clean = String(baseUrl || '').replace(/\/+$/, '')
    if (!clean) return ''
    return clean.endsWith('/v1') ? `${clean}/chat/completions` : `${clean}/v1/chat/completions`
  }

  _callOpenClawRpc({ endpoint, token, password, method, params, timeoutMs = 120000 }) {
    const url = String(endpoint || '').trim()
    if (!url) throw new Error('OpenClaw WebSocket URL is required')

    return new Promise((resolve, reject) => {
      let settled = false
      let connected = false
      const connectId = `connect-${Date.now()}`
      const rpcId = `rpc-${Date.now()}`
      const ws = new WebSocket(url)

      const finish = (err, result) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        try {
          ws.close()
        } catch {}
        err ? reject(err) : resolve(result)
      }

      const timer = setTimeout(() => {
        finish(new Error(`OpenClaw RPC timeout: ${method}`))
      }, timeoutMs)

      ws.on('message', (data) => {
        try {
          const frame = JSON.parse(data.toString())
          if (frame.type === 'event' && frame.event === 'connect.challenge') {
            ws.send(
              JSON.stringify({
                type: 'req',
                id: connectId,
                method: 'connect',
                params: buildOpenClawConnectParams({
                  token,
                  password,
                  nonce: frame.payload?.nonce,
                }),
              }),
            )
            return
          }

          if (frame.type === 'res' && frame.id === connectId) {
            if (!isOpenClawHelloOk(frame)) {
              finish(new Error(frame.error?.message || 'OpenClaw handshake failed'))
              return
            }
            connected = true
            ws.send(JSON.stringify({ type: 'req', id: rpcId, method, params }))
            return
          }

          if (connected && frame.type === 'res' && frame.id === rpcId) {
            if (frame.ok) {
              finish(null, frame.payload)
            } else {
              finish(new Error(frame.error?.message || frame.error?.code || 'OpenClaw RPC failed'))
            }
          }
        } catch (err) {
          finish(err)
        }
      })
      ws.on('error', (err) => finish(err))
    })
  }

  async _callOpenClawChat(data, input) {
    const sessionKey = String(data.agentId || '').trim() || 'agent:main:main'
    const idempotencyKey = `synapse-flow-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const payload = await this._callOpenClawRpc({
      endpoint: data.endpoint,
      token: data.token,
      password: data.password,
      method: 'chat.send',
      params: { sessionKey, message: input, idempotencyKey },
    })

    return payload?.content || payload?.message || payload?.text || payload?.runId
      ? `OpenClaw 已接收流程消息，运行状态：${payload.status || 'started'}${payload.runId ? `（${payload.runId}）` : ''}`
      : JSON.stringify(payload)
  }

  async execute(flowId) {
    const flow = db.prepare('SELECT * FROM flows WHERE id = ?').get(flowId)
    if (!flow) throw new Error('Flow not found')

    const config = JSON.parse(flow.config)
    const validation = validateFlowConfig(config, { hermesApiUrl: this.hermesApiUrl })
    if (!validation.valid) {
      throw new FlowValidationError(validation.errors)
    }

    const executionId = uuidv4()

    db.prepare(
      "INSERT INTO executions (id, flow_id, status, started_at) VALUES (?, ?, 'running', datetime('now'))",
    ).run(executionId, flowId)
    db.prepare("UPDATE flows SET status = 'running' WHERE id = ?").run(flowId)

    this.running.set(executionId, { cancelled: false })

    this._runAsync(executionId, flowId, config).catch((err) => {
      this._logEvent(executionId, null, 'error', { message: err.message })
      db.prepare(
        "UPDATE executions SET status = 'failed', finished_at = datetime('now'), output = ? WHERE id = ?",
      ).run(JSON.stringify({ error: err.message }), executionId)
      db.prepare("UPDATE flows SET status = 'error' WHERE id = ?").run(flowId)
      sseManager.send(executionId, 'flow-error', { executionId, error: err.message })
      this.running.delete(executionId)
    })

    return executionId
  }

  async _runAsync(executionId, flowId, config) {
    const startTime = Date.now()
    const { nodes, edges, groups } = config
    const results = new Map()

    // Build adjacency and in-degree for topological sort
    const adjacency = new Map()
    const inDegree = new Map()
    for (const node of nodes) {
      adjacency.set(node.id, [])
      inDegree.set(node.id, 0)
    }
    for (const edge of edges) {
      adjacency.get(edge.source)?.push(edge.target)
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1)
    }

    // Group lookup
    const groupMap = new Map()
    if (groups) {
      for (const group of groups) groupMap.set(group.id, group)
    }

    // Kahn's algorithm for topological sort
    const queue = []
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id)
    }

    const layers = []
    while (queue.length > 0) {
      const layer = [...queue]
      layers.push(layer)
      queue.length = 0
      for (const nodeId of layer) {
        for (const neighbor of adjacency.get(nodeId) || []) {
          inDegree.set(neighbor, inDegree.get(neighbor) - 1)
          if (inDegree.get(neighbor) === 0) queue.push(neighbor)
        }
      }
    }

    // Execute layer by layer
    for (const layer of layers) {
      if (this.running.get(executionId)?.cancelled) break

      const agentNodes = layer.filter((id) => {
        const n = nodes.find((nd) => nd.id === id)
        return n && n.type === 'agent'
      })
      const controlNodes = layer.filter((id) => {
        const n = nodes.find((nd) => nd.id === id)
        return n && n.type !== 'agent'
      })

      // Control nodes execute immediately and produce visible runtime output.
      for (const nodeId of controlNodes) {
        const node = nodes.find((n) => n.id === nodeId)
        const result = this._executeControlNode(node, edges, results)
        results.set(nodeId, result)
        this._sendStatus(executionId, nodeId, 'done', 0)
        this._logEvent(executionId, nodeId, 'control-output', {
          message: result.message,
          output: result.output.substring(0, 500),
        })
      }

      // Group agent nodes by their group
      const grouped = new Map()
      const ungrouped = []

      for (const nodeId of agentNodes) {
        const node = nodes.find((n) => n.id === nodeId)
        const nodeGroup = node.data?.group || node.group
        if (nodeGroup && groupMap.has(nodeGroup)) {
          if (!grouped.has(nodeGroup)) grouped.set(nodeGroup, [])
          grouped.get(nodeGroup).push(nodeId)
        } else {
          ungrouped.push(nodeId)
        }
      }

      // Execute ungrouped agents in parallel
      await Promise.all(
        ungrouped.map((nodeId) => this._executeAgent(executionId, nodeId, nodes, edges, results)),
      )

      // Execute groups based on collaboration pattern
      for (const [groupId, groupNodeIds] of grouped) {
        const group = groupMap.get(groupId)
        if (group.pattern === 'pipeline') {
          for (const nodeId of groupNodeIds) {
            if (this.running.get(executionId)?.cancelled) break
            await this._executeAgent(executionId, nodeId, nodes, edges, results)
          }
        } else {
          // hierarchy and mesh: parallel execution
          await Promise.all(
            groupNodeIds.map((nodeId) =>
              this._executeAgent(executionId, nodeId, nodes, edges, results),
            ),
          )
        }
      }
    }

    if (this.running.get(executionId)?.cancelled) {
      db.prepare(
        "UPDATE executions SET status = 'cancelled', finished_at = datetime('now') WHERE id = ?",
      ).run(executionId)
      db.prepare("UPDATE flows SET status = 'draft' WHERE id = ?").run(flowId)
      this._logEvent(executionId, null, 'cancelled', { reason: 'user_cancelled' })
      sseManager.send(executionId, 'flow-cancelled', { executionId })
      sseManager.broadcast('execution:cancelled', { executionId, flowId })
      this.running.delete(executionId)
      return
    }

    const duration = Date.now() - startTime
    let totalTokens = 0
    for (const [, r] of results) totalTokens += r.tokens || 0

    const outputObj = Object.fromEntries(results)
    db.prepare(
      "UPDATE executions SET status = 'completed', finished_at = datetime('now'), output = ? WHERE id = ?",
    ).run(JSON.stringify(outputObj), executionId)
    db.prepare("UPDATE flows SET status = 'completed' WHERE id = ?").run(flowId)

    sseManager.send(executionId, 'flow-complete', { executionId, duration, totalTokens })
    sseManager.broadcast('execution:complete', { executionId, flowId })
    this.running.delete(executionId)
  }

  async _executeAgent(executionId, nodeId, nodes, edges, results) {
    const node = nodes.find((n) => n.id === nodeId)
    if (!node) return

    const startTime = Date.now()
    this._sendStatus(executionId, nodeId, 'working', 0)
    this._logEvent(executionId, nodeId, 'status', { status: 'working' })

    // Gather input from upstream edges
    const inputEdges = edges.filter((e) => e.target === nodeId)
    const input = inputEdges
      .map((e) => results.get(e.source)?.output || '')
      .filter(Boolean)
      .join('\n\n')

    try {
      const output = await this._callAgent(node, input)
      const elapsed = (Date.now() - startTime) / 1000

      const estimatedTokens = Math.ceil(output.length / 4)
      results.set(nodeId, { output, tokens: estimatedTokens, elapsed })
      this._sendStatus(executionId, nodeId, 'done', elapsed)
      this._logEvent(executionId, nodeId, 'output', {
        output: output.substring(0, 200),
        tokens: estimatedTokens,
        elapsed,
      })
    } catch (err) {
      const elapsed = (Date.now() - startTime) / 1000
      this._sendStatus(executionId, nodeId, 'error', elapsed)
      this._logEvent(executionId, nodeId, 'error', { message: err.message, elapsed })

      // Mark downstream nodes as blocked
      for (const edge of edges.filter((e) => e.source === nodeId)) {
        this._sendStatus(executionId, edge.target, 'blocked', 0)
      }
      throw err
    }
  }

  _executeControlNode(node, edges, results) {
    const data = node?.data || {}
    const inputEdges = edges.filter((e) => e.target === node?.id)
    const upstream = inputEdges.map((e) => results.get(e.source)?.output || '').filter(Boolean)

    if (data.controlType === 'input') {
      const output = data.value?.trim() || data.label || 'Input'
      return { output, message: `Input emitted ${output.length} chars` }
    }

    if (data.controlType === 'merge') {
      const output =
        upstream.length > 0
          ? upstream.map((value, index) => `#${index + 1}\n${value}`).join('\n\n---\n\n')
          : data.label || 'Merge'
      return {
        output,
        message: `Merge combined ${upstream.length} upstream output${upstream.length === 1 ? '' : 's'}`,
      }
    }

    if (data.controlType === 'trigger') {
      const output =
        upstream.length > 0
          ? upstream.join('\n\n')
          : `[trigger:${node?.id}] ${data.label || 'Trigger'}`
      return {
        output,
        message:
          upstream.length > 0 ? 'Trigger forwarded upstream payload' : 'Trigger started a branch',
      }
    }

    const output = upstream.join('\n\n') || data.label || ''
    return { output, message: 'Control node processed' }
  }

  async _callAgent(node, input) {
    const data = node.data || node

    // Try OpenClaw Gateway through the node's own endpoint/token.
    if (data.gateway === 'openclaw') {
      return this._callOpenClawChat(data, input)
    }

    // Try Hermes API
    const hermesApiUrl = data.endpoint || this.hermesApiUrl
    if (data.gateway === 'hermes' && hermesApiUrl) {
      const headers = { 'Content-Type': 'application/json' }
      if (data.apiKey) headers.Authorization = `Bearer ${data.apiKey}`
      const resp = await fetch(this._openAiChatUrl(hermesApiUrl), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: data.model || 'hermes-agent',
          messages: [{ role: 'user', content: input }],
          stream: false,
        }),
      })
      const result = await resp.json().catch(() => null)
      if (!resp.ok) {
        throw new Error(result?.error?.message || result?.message || `Hermes HTTP ${resp.status}`)
      }
      return result?.choices?.[0]?.message?.content || ''
    }

    // Fallback: simulate agent execution
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 2000))
    return `[${data.label}] Processed: ${input.substring(0, 100)}${input.length > 100 ? '...' : ''}`
  }

  _sendStatus(executionId, nodeId, status, elapsed) {
    sseManager.send(executionId, 'node-status', { nodeId, status, elapsed })
  }

  _logEvent(executionId, nodeId, eventType, payload) {
    db.prepare(
      'INSERT INTO execution_events (execution_id, event_type, node_id, data) VALUES (?, ?, ?, ?)',
    ).run(executionId, eventType, nodeId, JSON.stringify(payload))
    sseManager.send(executionId, eventType, { nodeId, ...payload })
  }

  cancel(executionId) {
    const state = this.running.get(executionId)
    if (state) {
      state.cancelled = true
      db.prepare(
        "UPDATE executions SET status = 'cancelled', finished_at = datetime('now') WHERE id = ?",
      ).run(executionId)
      sseManager.send(executionId, 'flow-cancelled', { executionId })
    }
  }
}
