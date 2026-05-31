import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

import flowsRouter, { setExecutor } from './routes/flows.js'
import executionsRouter, { setExecutionExecutor } from './routes/executions.js'
import agentsRouter from './routes/agents.js'
import gatewaysRouter from './routes/gateways.js'
import { OpenClawGateway } from './gateway.js'
import { createHermesProxy } from './hermes-proxy.js'
import { FlowExecutor } from './engine/flow-executor.js'
import { messageBridge } from './engine/message-bridge.js'

dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())

// Gateway connections
const openclaw = new OpenClawGateway(
  process.env.OPENCLAW_WS_URL || 'ws://localhost:18789',
  process.env.OPENCLAW_AUTH_TOKEN,
  process.env.OPENCLAW_AUTH_PASSWORD,
)
openclaw.on('connected', () => console.log('OpenClaw gateway connected'))
openclaw.on('error', (e) => console.error('OpenClaw error:', e.message))
openclaw.connect()

// Hermes proxy
const hermesApiUrl = process.env.HERMES_API_URL || 'http://localhost:8642'
app.use(
  '/api/hermes',
  createHermesProxy(
    process.env.HERMES_WEB_URL || 'http://localhost:9119',
    hermesApiUrl,
    process.env.HERMES_API_KEY,
  ),
)

// Flow executor
const executor = new FlowExecutor(openclaw, hermesApiUrl)
setExecutor(executor)
setExecutionExecutor(executor)

// Cross-gateway message bridge
messageBridge.setUp(openclaw, hermesApiUrl)

// API routes
app.use('/api/flows', flowsRouter)
app.use('/api/executions', executionsRouter)
app.use('/api/agents', agentsRouter)
app.use('/api/gateways', gatewaysRouter)

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// Serve static files in production
const distPath = path.join(__dirname, '..', 'dist')
app.use(express.static(distPath))
app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`Synapse Studio server running on http://localhost:${PORT}`)
})
