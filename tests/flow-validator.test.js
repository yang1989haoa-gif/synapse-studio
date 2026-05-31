import { describe, expect, it } from 'vitest'
import { validateFlowConfig } from '../server/engine/flow-validator.js'

describe('validateFlowConfig', () => {
  it('rejects empty flows before execution', () => {
    const result = validateFlowConfig({ nodes: [], edges: [] })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      expect.objectContaining({
        code: 'empty-flow',
        message: 'Flow must contain at least one node before it can run.',
      }),
    ])
  })

  it('rejects edges that reference missing nodes', () => {
    const result = validateFlowConfig({
      nodes: [{ id: 'input-1', type: 'control', data: { controlType: 'input' } }],
      edges: [{ id: 'edge-1', source: 'input-1', target: 'missing-agent' }],
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'edge-target-missing',
        edgeId: 'edge-1',
        nodeId: 'missing-agent',
      }),
    )
  })

  it('rejects cyclic flows', () => {
    const result = validateFlowConfig({
      nodes: [
        { id: 'a', type: 'control', data: { label: 'A' } },
        { id: 'b', type: 'control', data: { label: 'B' } },
      ],
      edges: [
        { id: 'a-b', source: 'a', target: 'b' },
        { id: 'b-a', source: 'b', target: 'a' },
      ],
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        code: 'cycle-detected',
        message: 'Flow contains a cycle. Remove the loop before running.',
      }),
    )
  })

  it('rejects missing required agent connection fields', () => {
    const result = validateFlowConfig({
      nodes: [
        {
          id: 'openclaw-1',
          type: 'agent',
          data: { label: 'OpenClaw', gateway: 'openclaw', token: '' },
        },
        {
          id: 'hermes-1',
          type: 'agent',
          data: { label: 'Hermes', gateway: 'hermes', endpoint: '' },
        },
      ],
      edges: [],
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'openclaw-endpoint-required', nodeId: 'openclaw-1' }),
        expect.objectContaining({ code: 'openclaw-token-required', nodeId: 'openclaw-1' }),
        expect.objectContaining({ code: 'hermes-endpoint-required', nodeId: 'hermes-1' }),
      ]),
    )
  })

  it('accepts a runnable OpenClaw to Hermes flow when config is complete', () => {
    const result = validateFlowConfig({
      nodes: [
        { id: 'input-1', type: 'control', data: { controlType: 'input', value: 'hi' } },
        {
          id: 'openclaw-1',
          type: 'agent',
          data: {
            label: 'OpenClaw',
            gateway: 'openclaw',
            endpoint: 'ws://127.0.0.1:18789',
            token: 'token',
            agentId: 'agent:main:main',
          },
        },
        {
          id: 'hermes-1',
          type: 'agent',
          data: {
            label: 'Hermes',
            gateway: 'hermes',
            endpoint: 'http://localhost:8642',
            model: 'hermes-agent',
          },
        },
      ],
      edges: [
        { id: 'e1', source: 'input-1', target: 'openclaw-1' },
        { id: 'e2', source: 'openclaw-1', target: 'hermes-1' },
      ],
    })

    expect(result).toEqual({ valid: true, errors: [] })
  })
})
