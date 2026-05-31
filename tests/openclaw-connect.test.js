import { describe, expect, it } from 'vitest'
import { buildOpenClawConnectParams, isOpenClawHelloOk } from '../server/openclaw-connect.js'

describe('OpenClaw connect params', () => {
  it('builds operator auth with device signature and nonce', () => {
    const params = buildOpenClawConnectParams({
      token: 'test-token',
      password: 'test-password',
      nonce: 'challenge-nonce',
    })

    expect(params.minProtocol).toBe(3)
    expect(params.maxProtocol).toBe(3)
    expect(params.role).toBe('operator')
    expect(params.scopes).toEqual(['operator.read', 'operator.write', 'operator.admin'])
    expect(params.caps).toContain('tool-events')
    expect(params.auth).toEqual({ token: 'test-token', password: 'test-password' })
    expect(params.device).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^[a-f0-9]{64}$/),
        publicKey: expect.any(String),
        signature: expect.any(String),
        signedAt: expect.any(Number),
        nonce: 'challenge-nonce',
      }),
    )
  })

  it('detects successful OpenClaw hello responses', () => {
    expect(isOpenClawHelloOk({ type: 'res', ok: true, payload: { type: 'hello-ok' } })).toBe(true)
    expect(isOpenClawHelloOk({ type: 'res', ok: false, payload: { type: 'hello-ok' } })).toBe(false)
    expect(isOpenClawHelloOk({ type: 'event', ok: true, payload: { type: 'hello-ok' } })).toBe(
      false,
    )
  })
})
