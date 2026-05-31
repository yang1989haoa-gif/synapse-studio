import { describe, expect, it } from 'vitest'
import { hermesHealthUrl, resolveGatewayTargets } from '../server/engine/gateway-health.js'

describe('gateway health helpers', () => {
  it('builds Hermes health URL from base and /v1 endpoints', () => {
    expect(hermesHealthUrl('http://localhost:8642')).toBe('http://localhost:8642/health')
    expect(hermesHealthUrl('http://localhost:8642/v1')).toBe('http://localhost:8642/health')
    expect(hermesHealthUrl('http://localhost:8642/v1/')).toBe('http://localhost:8642/health')
  })

  it('prefers saved agent configs over environment fallbacks', () => {
    const rows = [
      {
        id: 'openclaw-1',
        name: 'OpenClaw Main',
        gateway: 'openclaw',
        config: JSON.stringify({
          endpoint: 'ws://127.0.0.1:18789',
          token: 'saved-openclaw-token',
          password: 'saved-password',
        }),
      },
      {
        id: 'hermes-1',
        name: 'Hermes Search',
        gateway: 'hermes',
        config: JSON.stringify({
          endpoint: 'http://127.0.0.1:8642/v1',
          apiKey: 'saved-hermes-key',
        }),
      },
    ]

    expect(
      resolveGatewayTargets(rows, {
        OPENCLAW_WS_URL: 'ws://env-openclaw:18789',
        OPENCLAW_AUTH_TOKEN: 'env-openclaw-token',
        HERMES_API_URL: 'http://env-hermes:8642',
        HERMES_API_KEY: 'env-hermes-key',
      }),
    ).toEqual({
      openclaw: {
        endpoint: 'ws://127.0.0.1:18789',
        token: 'saved-openclaw-token',
        password: 'saved-password',
        source: 'agent',
        agentId: 'openclaw-1',
        agentName: 'OpenClaw Main',
      },
      hermes: {
        endpoint: 'http://127.0.0.1:8642/v1',
        apiKey: 'saved-hermes-key',
        source: 'agent',
        agentId: 'hermes-1',
        agentName: 'Hermes Search',
      },
    })
  })

  it('falls back to environment config when no saved agents exist', () => {
    expect(
      resolveGatewayTargets([], {
        OPENCLAW_WS_URL: 'ws://localhost:18789',
        OPENCLAW_AUTH_TOKEN: 'env-token',
        HERMES_API_URL: 'http://localhost:8642',
        HERMES_API_KEY: 'env-key',
      }),
    ).toEqual({
      openclaw: {
        endpoint: 'ws://localhost:18789',
        token: 'env-token',
        password: '',
        source: 'env',
      },
      hermes: {
        endpoint: 'http://localhost:8642',
        apiKey: 'env-key',
        source: 'env',
      },
    })
  })
})
