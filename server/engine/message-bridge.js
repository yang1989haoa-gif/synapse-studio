import { EventEmitter } from 'events'
import db from '../database.js'
import { sseManager } from '../sse.js'

export class MessageBridge extends EventEmitter {
  constructor() {
    super()
    this.sessionMap = new Map()
    this.openclaw = null
    this.hermesApiUrl = null
  }

  setUp(openclaw, hermesApiUrl) {
    this.openclaw = openclaw
    this.hermesApiUrl = hermesApiUrl
  }

  mapSession(openclawKey, hermesUuid) {
    this.sessionMap.set(openclawKey, hermesUuid)
    this.sessionMap.set(hermesUuid, openclawKey)
  }

  getMappedSession(sessionId) {
    return this.sessionMap.get(sessionId)
  }

  async sendMessage(fromGateway, fromSession, toGateway, toSession, content) {
    const event = {
      from: { gateway: fromGateway, session: fromSession },
      to: { gateway: toGateway, session: toSession },
      content,
      timestamp: new Date().toISOString(),
    }

    // Persist to database
    try {
      db.prepare(
        'INSERT INTO execution_events (execution_id, event_type, node_id, data) VALUES (?, ?, ?, ?)',
      ).run(fromSession, 'cross-message', fromSession, JSON.stringify(event))
    } catch {
      // DB may not have the execution row yet
    }

    // Forward the message to the target gateway
    try {
      if (toGateway === 'openclaw' && this.openclaw?.connected) {
        await this.openclaw.call('sessions.send', {
          sessionKey: toSession,
          message: content,
        })
      } else if (toGateway === 'hermes' && this.hermesApiUrl) {
        await fetch(`${this.hermesApiUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [{ role: 'user', content }],
            stream: false,
          }),
        })
      }
    } catch (e) {
      event.error = e.message
    }

    // Notify SSE listeners
    sseManager.send(fromSession, 'cross-message', event)
    this.emit('cross-message', event)
    return event
  }
}

export const messageBridge = new MessageBridge()
