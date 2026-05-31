export class SSEManager {
  constructor() {
    this.clients = new Map() // executionId -> Set<res>
  }

  subscribe(executionId, res) {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    })

    if (!this.clients.has(executionId)) {
      this.clients.set(executionId, new Set())
    }
    this.clients.get(executionId).add(res)

    // Remove client on close
    res.on('close', () => {
      const set = this.clients.get(executionId)
      if (set) {
        set.delete(res)
        if (set.size === 0) this.clients.delete(executionId)
      }
    })

    // Send initial connection event
    res.write(`event: connected\ndata: ${JSON.stringify({ executionId })}\n\n`)
  }

  send(executionId, eventType, data) {
    const clients = this.clients.get(executionId)
    if (!clients || clients.size === 0) return

    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`
    for (const res of clients) {
      res.write(payload)
    }
  }

  broadcast(eventType, data) {
    const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`
    for (const [, clients] of this.clients) {
      for (const res of clients) {
        res.write(payload)
      }
    }
  }
}

export const sseManager = new SSEManager()
