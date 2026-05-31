import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import WebSocket from 'ws'
import db from '../database.js'
import { buildOpenClawConnectParams, isOpenClawHelloOk } from '../openclaw-connect.js'

const router = Router()

function toAgentDto(agent) {
  return {
    id: agent.id,
    name: agent.name,
    gateway: agent.gateway,
    gatewayAgentId: agent.gateway_agent_id,
    gateway_agent_id: agent.gateway_agent_id,
    model: agent.model,
    status: agent.status,
    config: agent.config ? JSON.parse(agent.config) : null,
    created_at: agent.created_at,
    updated_at: agent.updated_at,
  }
}

function withTimeout(ms) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, clear: () => clearTimeout(timeout) }
}

async function testHermesAgent({ endpoint, apiKey }) {
  const rawUrl = String(endpoint || '').replace(/\/+$/, '')
  const baseUrl = rawUrl.endsWith('/v1') ? rawUrl.slice(0, -3) : rawUrl
  if (!baseUrl) return { connected: false, error: 'API URL is required' }

  const headers = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  const candidates = [
    { path: '/health', parse: 'text' },
    { path: '/v1/models', parse: 'json' },
  ]

  let lastError = ''
  for (const candidate of candidates) {
    const timer = withTimeout(5000)
    try {
      const response = await fetch(`${baseUrl}${candidate.path}`, { headers, signal: timer.signal })
      timer.clear()
      if (response.ok) {
        const detail =
          candidate.parse === 'json'
            ? await response.json().catch(() => null)
            : await response.text().catch(() => '')
        return { connected: true, url: `${baseUrl}${candidate.path}`, detail }
      }
      lastError = `${candidate.path}: HTTP ${response.status}`
    } catch (err) {
      lastError = `${candidate.path}: ${err.name === 'AbortError' ? 'timeout' : err.message}`
    } finally {
      timer.clear()
    }
  }

  return { connected: false, url: baseUrl, error: lastError || 'Hermes API unreachable' }
}

async function testOpenClawAdminHttp({ endpoint, token }) {
  const baseUrl = String(endpoint || '').replace(/\/+$/, '')
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`

  const healthTimer = withTimeout(5000)
  try {
    const response = await fetch(`${baseUrl}/api/health`, { headers, signal: healthTimer.signal })
    if (response.ok) {
      const detail = await response.json().catch(() => null)
      return { connected: true, mode: 'openclaw-admin-http', url: `${baseUrl}/api/health`, detail }
    }
  } catch {
    // Fall through to RPC. Some deployments expose RPC but not health.
  } finally {
    healthTimer.clear()
  }

  const rpcTimer = withTimeout(5000)
  try {
    const response = await fetch(`${baseUrl}/api/rpc`, {
      method: 'POST',
      headers,
      signal: rpcTimer.signal,
      body: JSON.stringify({ method: 'health', params: {} }),
    })
    const data = await response.json().catch(() => null)
    if (response.ok && data?.ok !== false) {
      return {
        connected: true,
        mode: 'openclaw-admin-rpc',
        url: `${baseUrl}/api/rpc`,
        detail: data?.payload ?? data,
      }
    }
    return {
      connected: false,
      mode: 'openclaw-admin-rpc',
      url: `${baseUrl}/api/rpc`,
      error: data?.error?.message || `HTTP ${response.status}`,
    }
  } catch (err) {
    return {
      connected: false,
      mode: 'openclaw-admin-http',
      url: baseUrl,
      error: err.name === 'AbortError' ? 'timeout' : err.message,
    }
  } finally {
    rpcTimer.clear()
  }
}

async function testOpenClawWebSocket({ endpoint, token, password }) {
  const url = String(endpoint || '').trim()
  if (!url) return { connected: false, error: 'WebSocket URL is required' }

  return new Promise((resolve) => {
    let settled = false
    let connectId = `connect-${Date.now()}`
    let connectSent = false
    const ws = new WebSocket(url)

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      try {
        ws.close()
      } catch {}
      resolve(result)
    }

    const timeout = setTimeout(() => {
      finish({ connected: false, url, error: 'Connection timeout' })
    }, 20000)

    const sendConnect = (nonce = '') => {
      if (connectSent || ws.readyState !== WebSocket.OPEN) return
      connectSent = true
      ws.send(
        JSON.stringify({
          type: 'req',
          id: connectId,
          method: 'connect',
          params: buildOpenClawConnectParams({ token, password, nonce }),
        }),
      )
    }

    ws.on('open', () => {})
    ws.on('message', (data) => {
      try {
        const frame = JSON.parse(data.toString())
        if (frame.type === 'event' && frame.event === 'connect.challenge') {
          sendConnect(frame.payload?.nonce)
          return
        }
        if (frame.type === 'res' && frame.id === connectId) {
          if (isOpenClawHelloOk(frame)) {
            finish({ connected: true, mode: 'openclaw-ws', url, detail: frame.payload })
          } else {
            finish({
              connected: false,
              mode: 'openclaw-ws',
              url,
              error: frame.error?.message || 'Connection failed',
            })
          }
        }
      } catch (err) {
        finish({ connected: false, mode: 'openclaw-ws', url, error: err.message })
      }
    })
    ws.on('error', (err) => {
      finish({ connected: false, url, error: err.message })
    })
  })
}

async function testOpenClawAgent({ endpoint, token, password }) {
  const url = String(endpoint || '').trim()
  if (!url) return { connected: false, error: 'OpenClaw URL is required' }
  if (/^https?:\/\//i.test(url)) return testOpenClawAdminHttp({ endpoint: url, token })
  return testOpenClawWebSocket({ endpoint: url, token, password })
}

function openAiChatUrl(endpoint) {
  const baseUrl = String(endpoint || '').replace(/\/+$/, '')
  if (!baseUrl) return ''
  return baseUrl.endsWith('/v1') ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`
}

async function chatWithHermesAgent({ endpoint, apiKey, model, message }) {
  const url = openAiChatUrl(endpoint)
  if (!url) throw new Error('Hermes API URL is required')

  const headers = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: model || 'hermes-agent',
      messages: [{ role: 'user', content: message }],
      stream: false,
    }),
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(data?.error?.message || data?.message || `Hermes HTTP ${response.status}`)
  }
  return {
    response: data?.choices?.[0]?.message?.content || '',
    raw: data,
    usage: data?.usage,
  }
}

async function callOpenClawRpc({ endpoint, token, password, method, params }) {
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
      clearTimeout(timeout)
      try {
        ws.close()
      } catch {}
      err ? reject(err) : resolve(result)
    }

    const timeout = setTimeout(() => {
      finish(new Error('OpenClaw RPC timeout'))
    }, 60000)

    const sendRpc = () => {
      ws.send(JSON.stringify({ type: 'req', id: rpcId, method, params }))
    }

    ws.on('message', (data) => {
      try {
        const frame = JSON.parse(data.toString())
        if (frame.type === 'event' && frame.event === 'connect.challenge') {
          ws.send(
            JSON.stringify({
              type: 'req',
              id: connectId,
              method: 'connect',
              params: buildOpenClawConnectParams({ token, password, nonce: frame.payload?.nonce }),
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
          sendRpc()
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

async function chatWithOpenClawAgent({ endpoint, token, password, sessionKey, message }) {
  const key = String(sessionKey || '').trim() || 'agent:main:main'
  const idempotencyKey = `synapse-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const payload = await callOpenClawRpc({
    endpoint,
    token,
    password,
    method: 'chat.send',
    params: { sessionKey: key, message, idempotencyKey },
  })
  return {
    response:
      payload?.content || payload?.message || payload?.text || payload?.runId
        ? `OpenClaw 已接收消息，运行状态：${payload.status || 'started'}${payload.runId ? `（${payload.runId}）` : ''}`
        : '',
    raw: payload,
  }
}

// GET /api/agents - List all agents
router.get('/', (req, res) => {
  const agents = db.prepare('SELECT * FROM agents ORDER BY created_at DESC').all()
  const result = agents.map(toAgentDto)
  res.json(result)
})

// POST /api/agents/test - Test an unsaved or saved agent connection
router.post('/test', async (req, res) => {
  const { gateway, config = {} } = req.body
  if (!gateway) return res.status(400).json({ connected: false, error: 'gateway is required' })

  try {
    const result =
      gateway === 'openclaw'
        ? await testOpenClawAgent({
            endpoint: config.endpoint,
            token: config.token,
            password: config.password,
          })
        : gateway === 'hermes'
          ? await testHermesAgent({ endpoint: config.endpoint, apiKey: config.apiKey })
          : { connected: false, error: `Unknown gateway: ${gateway}` }

    res.status(result.connected ? 200 : 200).json({ gateway, ...result })
  } catch (err) {
    res.status(500).json({ gateway, connected: false, error: err.message })
  }
})

// POST /api/agents/chat - Send a chat message through the selected agent's native protocol
router.post('/chat', async (req, res) => {
  const { gateway, message, agentId, model, config = {} } = req.body
  if (!gateway) return res.status(400).json({ error: 'gateway is required' })
  if (!String(message || '').trim()) return res.status(400).json({ error: 'message is required' })

  try {
    const result =
      gateway === 'openclaw'
        ? await chatWithOpenClawAgent({
            endpoint: config.endpoint,
            token: config.token,
            password: config.password,
            sessionKey: agentId,
            message,
          })
        : gateway === 'hermes'
          ? await chatWithHermesAgent({
              endpoint: config.endpoint,
              apiKey: config.apiKey,
              model,
              message,
            })
          : null

    if (!result) return res.status(400).json({ error: `Unknown gateway: ${gateway}` })
    res.json({ gateway, ...result })
  } catch (err) {
    res.status(502).json({ gateway, error: err.message })
  }
})

// GET /api/agents/:id - Get a single agent
router.get('/:id', (req, res) => {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })
  res.json(toAgentDto(agent))
})

// POST /api/agents - Register a new agent
router.post('/', (req, res) => {
  const { name, gateway, gateway_agent_id, model, config, status } = req.body
  if (!name || !gateway || !gateway_agent_id) {
    return res.status(400).json({ error: 'name, gateway, and gateway_agent_id are required' })
  }
  const id = uuidv4()
  const configStr = config ? JSON.stringify(config) : null
  db.prepare(
    'INSERT INTO agents (id, name, gateway, gateway_agent_id, model, status, config) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, name, gateway, gateway_agent_id, model || null, status || 'idle', configStr)

  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id)
  res.status(201).json(toAgentDto(agent))
})

// PUT /api/agents/:id - Update an agent
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Agent not found' })

  const { name, gateway, gateway_agent_id, model, config, status } = req.body
  const updatedName = name ?? existing.name
  const updatedGateway = gateway ?? existing.gateway
  const updatedGatewayAgentId = gateway_agent_id ?? existing.gateway_agent_id
  const updatedModel = model ?? existing.model
  const updatedStatus = status ?? existing.status
  const updatedConfig = config ? JSON.stringify(config) : existing.config

  db.prepare(
    "UPDATE agents SET name = ?, gateway = ?, gateway_agent_id = ?, model = ?, status = ?, config = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(
    updatedName,
    updatedGateway,
    updatedGatewayAgentId,
    updatedModel,
    updatedStatus,
    updatedConfig,
    req.params.id,
  )

  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id)
  res.json(toAgentDto(agent))
})

// DELETE /api/agents/:id - Delete an agent
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Agent not found' })

  db.prepare('DELETE FROM agents WHERE id = ?').run(req.params.id)
  res.status(204).end()
})

// GET /api/agents/:id/history - Get execution history for an agent's flows
router.get('/:id/history', (req, res) => {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })

  // Return executions where the flow config references this agent
  const executions = db
    .prepare(
      'SELECT e.* FROM executions e JOIN flows f ON e.flow_id = f.id WHERE f.config LIKE ? ORDER BY e.started_at DESC',
    )
    .all(`%${agent.id}%`)

  // Fallback: if no matches via config search, return empty
  const result = executions.map((e) => ({
    ...e,
    input: e.input ? JSON.parse(e.input) : null,
    output: e.output ? JSON.parse(e.output) : null,
  }))
  res.json(result)
})

// GET /api/agents/:id/interactions - Get agent interaction events
router.get('/:id/interactions', (req, res) => {
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id)
  if (!agent) return res.status(404).json({ error: 'Agent not found' })

  // Return execution events from executions that involve this agent
  const events = db
    .prepare(
      'SELECT ee.* FROM execution_events ee JOIN executions e ON ee.execution_id = e.id JOIN flows f ON e.flow_id = f.id WHERE f.config LIKE ? ORDER BY ee.created_at DESC',
    )
    .all(`%${agent.id}%`)

  const result = events.map((ev) => ({
    ...ev,
    data: ev.data ? JSON.parse(ev.data) : null,
  }))
  res.json(result)
})

export default router
