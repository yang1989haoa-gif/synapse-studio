import { Router } from 'express'

export function createHermesProxy(hermesWebUrl, hermesApiUrl, hermesApiKey) {
  const router = Router()

  router.use('/web/{*splat}', async (req, res) => {
    const targetPath = req.params.splat
    const url = `${hermesWebUrl}/api/${targetPath}`
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (hermesApiKey) headers['Authorization'] = `Bearer ${hermesApiKey}`
      const resp = await fetch(url, {
        method: req.method,
        headers,
        body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
      })
      const data = await resp.json()
      res.status(resp.status).json(data)
    } catch (err) {
      res.status(502).json({ error: 'Hermes Web UI unreachable', detail: err.message })
    }
  })

  router.use('/v1/{*splat}', async (req, res) => {
    const targetPath = req.params.splat
    const url = `${hermesApiUrl}/v1/${targetPath}`
    try {
      const headers = { 'Content-Type': 'application/json' }
      if (hermesApiKey) headers['Authorization'] = `Bearer ${hermesApiKey}`

      if (targetPath === 'chat/completions' && req.body?.stream) {
        const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(req.body) })
        res.writeHead(resp.status, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        })
        const reader = resp.body.getReader()
        const pump = async () => {
          const { done, value } = await reader.read()
          if (done) return res.end()
          res.write(value)
          return pump()
        }
        return pump()
      }

      const resp = await fetch(url, {
        method: req.method,
        headers,
        body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
      })
      const data = await resp.json()
      res.status(resp.status).json(data)
    } catch (err) {
      res.status(502).json({ error: 'Hermes API Server unreachable', detail: err.message })
    }
  })

  return router
}
