import { Router } from 'express'
import db from '../database.js'
import {
  resolveGatewayTargets,
  testGateway,
  testHermesGateway,
  testOpenClawGateway,
} from '../engine/gateway-health.js'

const router = Router()

function gatewayTargets() {
  const agents = db
    .prepare('SELECT id, name, gateway, config FROM agents ORDER BY created_at DESC')
    .all()
  return resolveGatewayTargets(agents, process.env)
}

// GET /api/gateways/status - Get status of all configured gateways
router.get('/status', async (_req, res) => {
  const targets = gatewayTargets()
  const [openclaw, hermes] = await Promise.all([
    testOpenClawGateway(targets.openclaw),
    testHermesGateway(targets.hermes),
  ])

  res.json({ openclaw, hermes })
})

// POST /api/gateways/test - Test connection to a specific gateway
router.post('/test', async (req, res) => {
  const { type } = req.body
  if (!type) {
    return res.status(400).json({ error: 'type is required (openclaw or hermes)' })
  }

  const result = await testGateway(type, gatewayTargets())
  res.status(result.error && !['openclaw', 'hermes'].includes(type) ? 400 : 200).json(result)
})

export default router
