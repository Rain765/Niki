# Niki Device Relay

The relay lets a browser pair with a local Niki daemon through outbound
WebSocket connections. Protocol version 1 only exposes device presence and
Ping/Pong. It does not relay commands, prompts, files, or generated artifacts.

## Production environment

- `NIKI_RELAY_ALLOWED_ORIGINS`: comma-separated browser origins. Required when
  `NODE_ENV=production`.
- `NIKI_RELAY_PUBLIC_URL`: public `https://` base URL used to produce `wss://`
  connection URLs.
- `NIKI_RELAY_DATA_FILE`: state file on a persistent volume. Device and browser
  tokens are stored only as SHA-256 hashes.
- `PORT`: HTTP and WebSocket listener port.

The repository-level `render.yaml` provisions the relay with a persistent disk
and allows the Niki production origin. After deployment, the health endpoint is
available at `/health`.

## Local production check

```bash
pnpm --filter @open-design/contracts build
pnpm --filter @open-design/relay build
NODE_ENV=production \
NIKI_RELAY_ALLOWED_ORIGINS=http://127.0.0.1:3000 \
NIKI_RELAY_DATA_FILE=/tmp/niki-relay-state.json \
node apps/relay/dist/cli.js
```
