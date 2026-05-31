import WebSocket from 'ws'
import { buildOpenClawConnectParams, isOpenClawHelloOk } from '../openclaw-connect.js'

function clean(value) {
  return String(value || '').trim()
}

function parseConfig(value) {
  if (!value) return {}
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

function firstAgent(rows, gateway) {
  return rows.find((row) => row.gateway === gateway && clean(parseConfig(row.config).endpoint))
}

export function hermesHealthUrl(endpoint) {
  const raw = clean(endpoint).replace(/\/+$/, '')
  const base = raw.endsWith('/v1') ? raw.slice(0, -3) : raw
  return base ? `${base}/health` : ''
}

export function resolveGatewayTargets(agentRows = [], env = process.env) {
  const openclawAgent = firstAgent(agentRows, 'openclaw')
  const hermesAgent = firstAgent(agentRows, 'hermes')
  const openclawConfig = parseConfig(openclawAgent?.config)
  const hermesConfig = parseConfig(hermesAgent?.config)

  return {
    openclaw: openclawAgent
      ? {
          endpoint: clean(openclawConfig.endpoint),
          token: clean(openclawConfig.token),
          password: clean(openclawConfig.password),
          source: 'agent',
          agentId: openclawAgent.id,
          agentName: openclawAgent.name,
        }
      : {
          endpoint: clean(env.OPENCLAW_WS_URL) || 'ws://localhost:18789',
          token: clean(env.OPENCLAW_AUTH_TOKEN),
          password: '',
          source: 'env',
        },
    hermes: hermesAgent
      ? {
          endpoint: clean(hermesConfig.endpoint),
          apiKey: clean(hermesConfig.apiKey),
          source: 'agent',
          agentId: hermesAgent.id,
          agentName: hermesAgent.name,
        }
      : {
          endpoint: clean(env.HERMES_API_URL) || 'http://localhost:8642',
          apiKey: clean(env.HERMES_API_KEY),
          source: 'env',
        },
  }
}

function withTimeout(ms) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), ms)
  return { signal: controller.signal, clear: () => clearTimeout(timeout) }
}

export async function testHermesGateway(target, timeoutMs = 5000) {
  const url = hermesHealthUrl(target.endpoint)
  if (!url)
    return { type: 'hermes', connected: false, url: '', error: 'Hermes API URL is required' }

  const headers = {}
  if (target.apiKey) headers.Authorization = `Bearer ${target.apiKey}`
  const timer = withTimeout(timeoutMs)
  try {
    const response = await fetch(url, { headers, signal: timer.signal })
    const detail = await response.text().catch(() => '')
    return {
      type: 'hermes',
      connected: response.ok,
      url,
      source: target.source,
      agentId: target.agentId,
      agentName: target.agentName,
      detail,
      ...(response.ok ? {} : { error: `HTTP ${response.status}` }),
    }
  } catch (err) {
    return {
      type: 'hermes',
      connected: false,
      url,
      source: target.source,
      agentId: target.agentId,
      agentName: target.agentName,
      error: err.name === 'AbortError' ? 'timeout' : err.message,
    }
  } finally {
    timer.clear()
  }
}

export async function testOpenClawGateway(target, timeoutMs = 12000) {
  const url = clean(target.endpoint)
  if (!url) {
    return { type: 'openclaw', connected: false, url: '', error: 'OpenClaw URL is required' }
  }

  if (!/^wss?:\/\//i.test(url)) {
    return {
      type: 'openclaw',
      connected: false,
      url,
      source: target.source,
      agentId: target.agentId,
      agentName: target.agentName,
      error: 'OpenClaw status currently expects a WebSocket URL.',
    }
  }

  return new Promise((resolve) => {
    let settled = false
    let connectSent = false
    const connectId = `connect-${Date.now()}`
    const ws = new WebSocket(url)

    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        ws.close()
      } catch {}
      resolve({
        type: 'openclaw',
        url,
        source: target.source,
        agentId: target.agentId,
        agentName: target.agentName,
        ...result,
      })
    }

    const timer = setTimeout(() => {
      finish({ connected: false, error: 'timeout' })
    }, timeoutMs)

    const sendConnect = (nonce = '') => {
      if (connectSent || ws.readyState !== WebSocket.OPEN) return
      connectSent = true
      ws.send(
        JSON.stringify({
          type: 'req',
          id: connectId,
          method: 'connect',
          params: buildOpenClawConnectParams({
            token: target.token,
            password: target.password,
            nonce,
          }),
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
            finish({
              connected: true,
              detail: {
                protocol: frame.payload?.protocol,
                serverVersion: frame.payload?.server?.version,
                scopes: frame.payload?.auth?.scopes || [],
              },
            })
          } else {
            finish({
              connected: false,
              error: frame.error?.message || frame.error?.code || 'OpenClaw handshake failed',
            })
          }
        }
      } catch (err) {
        finish({ connected: false, error: err.message })
      }
    })
    ws.on('error', (err) => {
      finish({ connected: false, error: err.message })
    })
  })
}

export async function testGateway(type, targets) {
  if (type === 'openclaw') return testOpenClawGateway(targets.openclaw)
  if (type === 'hermes') return testHermesGateway(targets.hermes)
  return { type, connected: false, url: '', error: `Unknown gateway type: ${type}` }
}
