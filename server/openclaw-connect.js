import { readFileSync } from 'fs'
import { createHash, generateKeyPairSync, sign } from 'crypto'

const APP_VERSION =
  JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')).version || '1.0.0'

let deviceIdentity = null

function base64UrlEncode(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function generateEd25519KeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const publicKeyRaw = publicKey.export({ type: 'spki', format: 'der' }).slice(-32)
  const privateKeyRaw = privateKey.export({ type: 'pkcs8', format: 'der' }).slice(-32)

  return {
    publicKey: base64UrlEncode(publicKeyRaw),
    privateKey: base64UrlEncode(privateKeyRaw),
  }
}

function getDeviceIdentity() {
  if (deviceIdentity) return deviceIdentity
  const { publicKey, privateKey } = generateEd25519KeyPair()
  const publicKeyRaw = Buffer.from(publicKey.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
  deviceIdentity = {
    deviceId: bytesToHex(createHash('sha256').update(publicKeyRaw).digest()),
    publicKey,
    privateKey,
  }
  return deviceIdentity
}

function buildDeviceAuthPayload({
  deviceId,
  clientId,
  clientMode,
  role,
  scopes,
  signedAtMs,
  token,
  nonce,
}) {
  const version = nonce ? 'v2' : 'v1'
  const parts = [
    version,
    deviceId,
    clientId,
    clientMode,
    role,
    scopes.join(','),
    String(signedAtMs),
    token ?? '',
  ]
  if (nonce) parts.push(nonce)
  return parts.join('|')
}

function signDevicePayload(privateKeyBase64Url, payload) {
  const privateKeyRaw = Buffer.from(
    privateKeyBase64Url.replace(/-/g, '+').replace(/_/g, '/'),
    'base64',
  )
  const signature = sign(null, Buffer.from(payload, 'utf-8'), {
    key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), privateKeyRaw]),
    format: 'der',
    type: 'pkcs8',
  })
  return base64UrlEncode(signature.slice(-64))
}

export function buildOpenClawConnectParams({ token = '', password = '', nonce = '' } = {}) {
  const scopes = ['operator.read', 'operator.write', 'operator.admin']
  const params = {
    minProtocol: 3,
    maxProtocol: 3,
    client: {
      id: 'cli',
      displayName: 'Synapse Studio',
      version: APP_VERSION,
      platform: process.platform,
      mode: 'cli',
    },
    role: 'operator',
    scopes,
    caps: ['tool-events'],
    commands: [],
    permissions: {},
    auth: {
      token: token || '',
      ...(password ? { password } : {}),
    },
    locale: 'zh-CN',
    userAgent: `synapse-studio/${APP_VERSION}`,
  }

  const identity = getDeviceIdentity()
  const signedAtMs = Date.now()
  const payload = buildDeviceAuthPayload({
    deviceId: identity.deviceId,
    clientId: params.client.id,
    clientMode: params.client.mode,
    role: params.role,
    scopes,
    signedAtMs,
    token: params.auth.token,
    nonce,
  })
  params.device = {
    id: identity.deviceId,
    publicKey: identity.publicKey,
    signature: signDevicePayload(identity.privateKey, payload),
    signedAt: signedAtMs,
    ...(nonce ? { nonce } : {}),
  }

  return params
}

export function isOpenClawHelloOk(frame) {
  return Boolean(frame?.type === 'res' && frame.ok && frame.payload?.type === 'hello-ok')
}
