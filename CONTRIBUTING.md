# Contributing to Synapse Studio

Thanks for helping improve Synapse Studio.

## Development Setup

1. Install Node.js 22 or newer.
2. Install dependencies:

```bash
npm ci
```

3. Copy `.env.example` to `.env` and fill local credentials if you need real agent connections.
4. Start the app:

```bash
npm run dev:all
```

## Quality Checks

Run these before opening a pull request:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

## Pull Requests

- Keep changes focused on one feature or fix.
- Include tests for new logic when practical.
- Do not commit `.env`, local databases, logs, or real agent tokens.
- Update documentation when setup, configuration, or public behavior changes.

## Issues

For bugs, include:

- What you expected to happen.
- What actually happened.
- Browser console or server error output if available.
- Whether Hermes or OpenClaw was running locally.
