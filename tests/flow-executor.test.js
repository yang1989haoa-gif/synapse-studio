import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const dbRuns = []
  const dbGets = []
  const dbAlls = []
  const mockDb = {
    prepare: vi.fn((sql) => ({
      run: vi.fn((...params) => dbRuns.push({ sql, params })),
      get: vi.fn((...params) => {
        dbGets.push({ sql, params })
        return undefined
      }),
      all: vi.fn((...params) => {
        dbAlls.push({ sql, params })
        return []
      }),
    })),
  }
  const mockSseManager = {
    send: vi.fn(),
    broadcast: vi.fn(),
    subscribe: vi.fn(),
  }

  return { dbRuns, dbGets, dbAlls, mockDb, mockSseManager }
})

vi.mock('../server/database.js', () => ({ default: mocks.mockDb }))
vi.mock('../server/sse.js', () => ({ sseManager: mocks.mockSseManager }))

const { FlowExecutor } = await import('../server/engine/flow-executor.js')

const originalFetch = globalThis.fetch

function testFlowConfig() {
  return {
    nodes: [
      {
        id: 'input-1',
        type: 'control',
        position: { x: 0, y: 0 },
        data: { controlType: 'input', label: 'Input', value: 'hi' },
      },
      {
        id: 'openclaw-1',
        type: 'agent',
        position: { x: 200, y: 0 },
        data: {
          label: 'OpenClaw',
          gateway: 'openclaw',
          endpoint: 'ws://127.0.0.1:18789',
          token: 'test-token',
          agentId: 'agent:main:main',
          model: 'mimo',
        },
      },
      {
        id: 'trigger-1',
        type: 'control',
        position: { x: 400, y: 0 },
        data: { controlType: 'trigger', label: 'Trigger' },
      },
      {
        id: 'hermes-1',
        type: 'agent',
        position: { x: 600, y: 0 },
        data: {
          label: 'Hermes',
          gateway: 'hermes',
          endpoint: 'http://hermes.local',
          apiKey: 'test-api-key',
          model: 'hermes-agent',
        },
      },
      {
        id: 'merge-1',
        type: 'control',
        position: { x: 800, y: 0 },
        data: { controlType: 'merge', label: 'Merge' },
      },
    ],
    edges: [
      { id: 'e1', source: 'input-1', target: 'openclaw-1' },
      { id: 'e2', source: 'openclaw-1', target: 'trigger-1' },
      { id: 'e3', source: 'trigger-1', target: 'hermes-1' },
      { id: 'e4', source: 'hermes-1', target: 'merge-1' },
    ],
    groups: [],
  }
}

describe('FlowExecutor', () => {
  beforeEach(() => {
    mocks.dbRuns.length = 0
    mocks.dbGets.length = 0
    mocks.dbAlls.length = 0
    mocks.mockDb.prepare.mockClear()
    mocks.mockSseManager.send.mockClear()
    mocks.mockSseManager.broadcast.mockClear()
    mocks.mockSseManager.subscribe.mockClear()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('builds Hermes chat completion URLs from base and /v1 URLs', () => {
    const executor = new FlowExecutor(null, '')

    expect(executor._openAiChatUrl('http://localhost:8642')).toBe(
      'http://localhost:8642/v1/chat/completions',
    )
    expect(executor._openAiChatUrl('http://localhost:8642/v1')).toBe(
      'http://localhost:8642/v1/chat/completions',
    )
    expect(executor._openAiChatUrl('http://localhost:8642/v1/')).toBe(
      'http://localhost:8642/v1/chat/completions',
    )
    expect(executor._openAiChatUrl('')).toBe('')
  })

  it('runs input, OpenClaw, trigger, Hermes, and merge nodes to completion with mocks', async () => {
    const executor = new FlowExecutor(null, '')
    executor.running.set('exec-1', { cancelled: false })
    executor._callOpenClawChat = vi.fn(async (_data, input) => {
      expect(input).toBe('hi')
      return 'openclaw-started'
    })
    globalThis.fetch = vi.fn(async (url, init) => {
      expect(url).toBe('http://hermes.local/v1/chat/completions')
      expect(init.headers.Authorization).toBe('Bearer test-api-key')
      const body = JSON.parse(init.body)
      expect(body.model).toBe('hermes-agent')
      expect(body.messages).toEqual([{ role: 'user', content: 'openclaw-started' }])
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'hermes-ok' } }],
        }),
      }
    })

    await executor._runAsync('exec-1', 'flow-1', testFlowConfig())

    expect(executor._callOpenClawChat).toHaveBeenCalledOnce()
    expect(globalThis.fetch).toHaveBeenCalledOnce()
    expect(mocks.mockSseManager.send).toHaveBeenCalledWith(
      'exec-1',
      'flow-complete',
      expect.objectContaining({ executionId: 'exec-1', totalTokens: expect.any(Number) }),
    )

    const completedRun = mocks.dbRuns.find((run) =>
      run.sql.includes("UPDATE executions SET status = 'completed'"),
    )
    expect(completedRun).toBeTruthy()
    const output = JSON.parse(completedRun.params[0])
    expect(output['input-1'].output).toBe('hi')
    expect(output['openclaw-1'].output).toBe('openclaw-started')
    expect(output['trigger-1'].output).toBe('openclaw-started')
    expect(output['hermes-1'].output).toBe('hermes-ok')
    expect(output['merge-1'].output).toBe('#1\nhermes-ok')
  })
})
