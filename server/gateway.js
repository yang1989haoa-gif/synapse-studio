import WebSocket from 'ws'
import { EventEmitter } from 'events'
import { buildOpenClawConnectParams, isOpenClawHelloOk } from './openclaw-connect.js'

export class OpenClawGateway extends EventEmitter {
  constructor(url, authToken, authPassword = '') {
    super()
    this.url = url
    this.authToken = authToken || ''
    this.authPassword = authPassword || ''
    this.ws = null
    this.requestId = 0
    this.pendingRequests = new Map()
    this.connected = false
    this.reconnectTimer = null
    this.heartbeatTimer = null
    this.connectId = null
    this.connectSent = false
  }

  connect() {
    if (this.ws) return
    this.ws = new WebSocket(this.url)

    this.ws.on('open', () => {
      this.connected = false
      this.connectId = `connect-${Date.now()}`
      this.connectSent = false
      this.emit('stateChange', 'connecting')
    })

    this.ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        this._handleMessage(msg)
      } catch (e) {
        this.emit('error', e)
      }
    })

    this.ws.on('close', () => {
      this.connected = false
      this.connectSent = false
      this.connectId = null
      this._clearHeartbeat()
      this.ws = null
      this.emit('stateChange', 'disconnected')
      this.emit('disconnected')
      this._scheduleReconnect()
    })

    this.ws.on('error', (err) => {
      this.emit('error', err)
    })
  }

  _sendConnect(nonce = '') {
    if (this.connectSent || this.ws?.readyState !== WebSocket.OPEN) return
    this.connectSent = true
    this._send({
      type: 'req',
      id: this.connectId,
      method: 'connect',
      params: buildOpenClawConnectParams({
        token: this.authToken,
        password: this.authPassword,
        nonce,
      }),
    })
  }

  _handleMessage(msg) {
    if (msg.type === 'event') {
      if (msg.event === 'connect.challenge') {
        this._sendConnect(msg.payload?.nonce)
        return
      }
      this.emit('event', msg.event, msg.payload)
      return
    }

    if (msg.type !== 'res') return

    if (msg.id === this.connectId) {
      this.connectId = null
      if (isOpenClawHelloOk(msg)) {
        this.connected = true
        this.emit('stateChange', 'connected')
        this.emit('connected', msg.payload)
        this._startHeartbeat()
      } else {
        this.emit('stateChange', 'failed')
        this.emit('error', new Error(msg.error?.message || 'Connection failed'))
        this.ws?.close()
      }
      return
    }

    if (this.pendingRequests.has(msg.id)) {
      const { resolve, reject, timer } = this.pendingRequests.get(msg.id)
      this.pendingRequests.delete(msg.id)
      clearTimeout(timer)
      msg.ok ? resolve(msg.payload) : reject(new Error(msg.error?.message || 'RPC error'))
    }
  }

  call(method, params = {}, timeout = 30000) {
    return new Promise((resolve, reject) => {
      if (!this.connected || this.ws?.readyState !== WebSocket.OPEN)
        return reject(new Error('Not connected'))
      const id = String(++this.requestId)
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error(`RPC timeout: ${method}`))
        }
      }, timeout)
      this.pendingRequests.set(id, { resolve, reject, timer })
      this._send({ type: 'req', id, method, params })
    })
  }

  _send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg))
    }
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, 5000)
  }

  _startHeartbeat() {
    this._clearHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.connected) this.call('health', {}, 10000).catch(() => {})
    }, 30000)
  }

  _clearHeartbeat() {
    clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = null
  }

  disconnect() {
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
    this._clearHeartbeat()
    this.ws?.close()
    this.ws = null
    this.connected = false
  }
}
