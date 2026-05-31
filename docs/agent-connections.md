# Agent Connections

This document records the connection fields Synapse Studio expects for supported agent gateways.

## Hermes

Hermes uses an OpenAI-compatible HTTP API.

### Required Fields

| Field    | Example                 | Notes                                  |
| -------- | ----------------------- | -------------------------------------- |
| Gateway  | `hermes`                | Select Hermes in the agent form.       |
| Endpoint | `http://localhost:8642` | `http://localhost:8642/v1` also works. |
| API key  | local secret            | Sent as `Authorization: Bearer <key>`. |
| Model    | `hermes-agent`          | Used in `/v1/chat/completions`.        |

### Health Check

```bash
curl http://localhost:8642/health
```

Expected shape:

```json
{ "status": "ok", "platform": "hermes-agent" }
```

### Chat Request Shape

```json
{
  "model": "hermes-agent",
  "messages": [{ "role": "user", "content": "你好" }],
  "stream": false
}
```

## OpenClaw Gateway

OpenClaw uses a WebSocket gateway with protocol v3 operator authentication.

### Required Fields

| Field             | Example                | Notes                                 |
| ----------------- | ---------------------- | ------------------------------------- |
| Gateway           | `openclaw`             | Select OpenClaw in the agent form.    |
| Endpoint          | `ws://127.0.0.1:18789` | Gateway WebSocket URL.                |
| Token             | local secret           | Sent in the `connect` request.        |
| Password          | optional local secret  | Included only when configured.        |
| Agent/session key | `agent:main:main`      | Used as `sessionKey` for `chat.send`. |
| Model             | `mimo`                 | Display/config metadata for the node. |

### Protocol Flow

1. Open WebSocket connection.
2. Receive `connect.challenge`.
3. Send `connect` request with:
   - `minProtocol: 3`
   - `maxProtocol: 3`
   - `role: "operator"`
   - scopes `operator.read`, `operator.write`, `operator.admin`
   - token auth
   - device signature and challenge nonce
4. Wait for `hello-ok`.
5. Send agent messages with `chat.send`.

### Runtime Chat Shape

```json
{
  "type": "req",
  "id": "rpc-...",
  "method": "chat.send",
  "params": {
    "sessionKey": "agent:main:main",
    "message": "你好",
    "idempotencyKey": "synapse-flow-..."
  }
}
```

## Troubleshooting

- `Hermes HTTP 401`: check the API key.
- `Hermes HTTP 404`: check whether the endpoint includes the correct host and port; both base URL and `/v1` URL are accepted.
- `OpenClaw handshake failed`: check the token, gateway version, and challenge response.
- `OpenClaw RPC timeout`: check that the selected session key exists and the gateway can route `chat.send`.
- `fetch failed`: verify the target service is running on the configured host and port.
