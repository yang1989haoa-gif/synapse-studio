import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../database.js'
import { sseManager } from '../sse.js'

let executor = null
export function setExecutionExecutor(exec) {
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

// GET /api/executions - List all executions (optionally filtered by flow_id)
router.get('/', (req, res) => {
  const { flow_id } = req.query
  let executions
  if (flow_id) {
    executions = db
      .prepare('SELECT * FROM executions WHERE flow_id = ? ORDER BY started_at DESC')
      .all(flow_id)
  } else {
    executions = db.prepare('SELECT * FROM executions ORDER BY started_at DESC').all()
  }
  const result = executions.map((e) => ({
    ...e,
    input: e.input ? safeParse(e.input) : null,
    output: e.output ? safeParse(e.output) : null,
  }))
  res.json(result)
})

// DELETE /api/executions - Clear finished execution records and their events
router.delete('/', (req, res) => {
  const finished = db.prepare("SELECT id FROM executions WHERE status != 'running'").all()
  for (const execution of finished) {
    db.prepare('DELETE FROM execution_events WHERE execution_id = ?').run(execution.id)
  }
  db.prepare("DELETE FROM executions WHERE status != 'running'").run()
  res.json({ deleted: finished.length })
})

// GET /api/executions/:id - Get a single execution
router.get('/:id', (req, res) => {
  const execution = db.prepare('SELECT * FROM executions WHERE id = ?').get(req.params.id)
  if (!execution) return res.status(404).json({ error: 'Execution not found' })
  execution.input = execution.input ? safeParse(execution.input) : null
  execution.output = execution.output ? safeParse(execution.output) : null
  res.json(execution)
})

// GET /api/executions/:id/event-log - Get persisted execution events for inspection
router.get('/:id/event-log', (req, res) => {
  const execution = db.prepare('SELECT * FROM executions WHERE id = ?').get(req.params.id)
  if (!execution) return res.status(404).json({ error: 'Execution not found' })

  const events = db
    .prepare(
      'SELECT id, execution_id, event_type, node_id, data, created_at FROM execution_events WHERE execution_id = ? ORDER BY id ASC',
    )
    .all(req.params.id)

  res.json(events.map((event) => ({ ...event, data: event.data ? safeParse(event.data) : null })))
})

// GET /api/executions/:id/events - SSE stream for execution events
router.get('/:id/events', (req, res) => {
  const execution = db.prepare('SELECT * FROM executions WHERE id = ?').get(req.params.id)
  if (!execution) return res.status(404).json({ error: 'Execution not found' })

  sseManager.subscribe(req.params.id, res)
})

// POST /api/executions - Start a new execution
router.post('/', (req, res) => {
  const { flow_id, input } = req.body
  if (!flow_id) {
    return res.status(400).json({ error: 'flow_id is required' })
  }

  const flow = db.prepare('SELECT * FROM flows WHERE id = ?').get(flow_id)
  if (!flow) return res.status(404).json({ error: 'Flow not found' })

  const id = uuidv4()
  const inputStr = input ? JSON.stringify(input) : null
  db.prepare('INSERT INTO executions (id, flow_id, status, input) VALUES (?, ?, ?, ?)').run(
    id,
    flow_id,
    'running',
    inputStr,
  )

  const execution = db.prepare('SELECT * FROM executions WHERE id = ?').get(id)
  execution.input = execution.input ? safeParse(execution.input) : null
  execution.output = execution.output ? safeParse(execution.output) : null

  // Broadcast execution started
  sseManager.send(id, 'started', { executionId: id, status: 'running' })
  sseManager.broadcast('execution:started', { executionId: id, flowId: flow_id })

  res.status(201).json(execution)
})

// POST /api/executions/:id/cancel - Cancel a running execution
router.post('/:id/cancel', (req, res) => {
  const execution = db.prepare('SELECT * FROM executions WHERE id = ?').get(req.params.id)
  if (!execution) return res.status(404).json({ error: 'Execution not found' })

  if (execution.status !== 'running') {
    return res
      .status(400)
      .json({ error: `Cannot cancel execution with status: ${execution.status}` })
  }

  if (executor) executor.cancel(req.params.id)

  db.prepare(
    "UPDATE executions SET status = 'cancelled', finished_at = datetime('now') WHERE id = ?",
  ).run(req.params.id)

  // Record cancel event
  db.prepare('INSERT INTO execution_events (execution_id, event_type, data) VALUES (?, ?, ?)').run(
    req.params.id,
    'cancelled',
    JSON.stringify({ reason: 'user_cancelled' }),
  )

  sseManager.send(req.params.id, 'cancelled', { executionId: req.params.id })
  sseManager.send(req.params.id, 'flow-cancelled', { executionId: req.params.id })
  sseManager.broadcast('execution:cancelled', { executionId: req.params.id })

  const updated = db.prepare('SELECT * FROM executions WHERE id = ?').get(req.params.id)
  updated.input = updated.input ? safeParse(updated.input) : null
  updated.output = updated.output ? safeParse(updated.output) : null
  res.json(updated)
})

export default router
