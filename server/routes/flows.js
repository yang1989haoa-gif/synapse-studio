import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../database.js'

let executor = null
export function setExecutor(exec) {
  executor = exec
}

function safeParse(json, fallback = null) {
  try {
    return JSON.parse(json)
  } catch {
    return fallback
  }
}

const router = Router()

// GET /api/flows - List all flows
router.get('/', (req, res) => {
  const flows = db.prepare('SELECT * FROM flows ORDER BY updated_at DESC').all()
  // Parse config JSON for each flow
  const result = flows.map((f) => ({ ...f, config: safeParse(f.config, {}) }))
  res.json(result)
})

// GET /api/flows/:id - Get a single flow
router.get('/:id', (req, res) => {
  const flow = db.prepare('SELECT * FROM flows WHERE id = ?').get(req.params.id)
  if (!flow) return res.status(404).json({ error: 'Flow not found' })
  flow.config = safeParse(flow.config, {})
  res.json(flow)
})

// POST /api/flows - Create a new flow
router.post('/', (req, res) => {
  const { name, description, config, status } = req.body
  if (!name || !config) {
    return res.status(400).json({ error: 'name and config are required' })
  }
  const id = uuidv4()
  const configStr = typeof config === 'string' ? config : JSON.stringify(config)
  db.prepare(
    'INSERT INTO flows (id, name, description, config, status) VALUES (?, ?, ?, ?, ?)',
  ).run(id, name, description || null, configStr, status || 'draft')

  const flow = db.prepare('SELECT * FROM flows WHERE id = ?').get(id)
  flow.config = safeParse(flow.config, {})
  res.status(201).json(flow)
})

// PUT /api/flows/:id - Update a flow
router.put('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM flows WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Flow not found' })

  const { name, description, config, status } = req.body
  const updatedName = name ?? existing.name
  const updatedDesc = description ?? existing.description
  const updatedConfig = config
    ? typeof config === 'string'
      ? config
      : JSON.stringify(config)
    : existing.config
  const updatedStatus = status ?? existing.status

  db.prepare(
    "UPDATE flows SET name = ?, description = ?, config = ?, status = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(updatedName, updatedDesc, updatedConfig, updatedStatus, req.params.id)

  const flow = db.prepare('SELECT * FROM flows WHERE id = ?').get(req.params.id)
  flow.config = safeParse(flow.config, {})
  res.json(flow)
})

// POST /api/flows/:id/run - Execute a flow
router.post('/:id/run', async (req, res) => {
  if (!executor) return res.status(500).json({ error: 'Executor not initialized' })
  try {
    const executionId = await executor.execute(req.params.id)
    res.json({ executionId, status: 'running' })
  } catch (err) {
    res.status(400).json({ error: err.message, details: err.details || [] })
  }
})

// DELETE /api/flows/:id - Delete a flow
router.delete('/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM flows WHERE id = ?').get(req.params.id)
  if (!existing) return res.status(404).json({ error: 'Flow not found' })

  db.prepare('DELETE FROM flows WHERE id = ?').run(req.params.id)
  res.status(204).end()
})

export default router
