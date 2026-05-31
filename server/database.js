import initSqlJs from 'sql.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', 'data', 'synapse.db')

// Initialize sql.js
const SQL = await initSqlJs()
let db

if (existsSync(DB_PATH)) {
  const buffer = readFileSync(DB_PATH)
  db = new SQL.Database(buffer)
} else {
  mkdirSync(path.dirname(DB_PATH), { recursive: true })
  db = new SQL.Database()
}

// Create tables
db.run(`
  CREATE TABLE IF NOT EXISTS flows (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    config TEXT NOT NULL,
    status TEXT DEFAULT 'draft',
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`)

db.run(`
  CREATE TABLE IF NOT EXISTS executions (
    id TEXT PRIMARY KEY,
    flow_id TEXT NOT NULL,
    status TEXT DEFAULT 'running',
    input TEXT,
    output TEXT,
    started_at TEXT DEFAULT (datetime('now')),
    finished_at TEXT,
    FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE
  )
`)

db.run(`
  CREATE TABLE IF NOT EXISTS execution_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    node_id TEXT,
    data TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (execution_id) REFERENCES executions(id) ON DELETE CASCADE
  )
`)

db.run(`
  CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    gateway TEXT NOT NULL,
    gateway_agent_id TEXT NOT NULL,
    model TEXT,
    status TEXT DEFAULT 'idle',
    config TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  )
`)

// Save database to disk
function saveDB() {
  const data = db.export()
  writeFileSync(DB_PATH, Buffer.from(data))
}

// Wrapper that mimics better-sqlite3 API
const dbWrapper = {
  prepare(sql) {
    return {
      run(...params) {
        db.run(sql, params)
        saveDB()
      },
      get(...params) {
        const stmt = db.prepare(sql)
        stmt.bind(params)
        if (stmt.step()) {
          const row = stmt.getAsObject()
          stmt.free()
          return row
        }
        stmt.free()
        return undefined
      },
      all(...params) {
        const results = []
        const stmt = db.prepare(sql)
        stmt.bind(params)
        while (stmt.step()) {
          results.push(stmt.getAsObject())
        }
        stmt.free()
        return results
      },
    }
  },
  exec(sql) {
    db.run(sql)
    saveDB()
  },
  pragma() {},
}

export default dbWrapper
