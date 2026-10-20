# Niki Cloudflare ingress

Production address: `https://niki-work-app.pages.dev/`.
Feishu app `cli_aaefc4d12138dbb6` version **1.0.8** publishes this address for
both desktop and mobile. Its redirect allowlist includes
`https://niki-work-app.pages.dev/api/auth/feishu/callback`.

## Routing and credentials

Pages project `niki-work-app` uses an advanced-mode `_worker.js` compiled from
`pages.ts`. Its production service binding `NIKI_PROXY` calls Worker `niki`.
That Worker's `NIKI_WEB` binding targets VPC Service `niki-web`
(`01a15706-086b-7901-8ce9-ad878456fdc0`), an HTTP service fixed to
**127.0.0.1:17573** through tunnel `niki-mac-mini`
(`4d220136-0114-4fe1-93a0-3019aa0a1f4d`). There is no VPC Network binding,
subnet route, or extra service port. Niki's application and data stay on the Mac.
Pages is configured to **fail closed** when its Functions allowance is exhausted.

`com.rain.niki-cloudflared` runs the Homebrew cloudflared binary with HTTP/2,
KeepAlive and `--token-file ~/.config/niki/cloudflare/tunnel.token`.
The token file is mode 0600, its directory is mode 0700, and the credential
must never be embedded in Git, process arguments, screenshots or logs.
Readiness is available only on `127.0.0.1:20291/ready`.

The Worker uses a distinct upstream Host (`niki-origin.internal`) and supplies
the canonical public Origin, including for requests without an Origin header.
This prevents the existing web sidecar from normalizing a same-host Origin to
loopback and the daemon from treating Internet traffic as local operator
traffic. The VPC Service, not this Host, determines the target. Foreign origins
are rejected, proxy identity headers are replaced, redirects are not followed,
and bodies/cookies/SSE responses pass through without buffering. Preview hosts
are rejected. The previous `niki.1045423197.workers.dev` address redirects to Pages.

## Runtime and deployment

The application remains the immutable release
`ff484eb4b394edfdbd0c156c422defadb49de8ba`, build ID `7ywWqO10bYrY26zPBzimi`.
This ingress change does not rebuild or replace that application release.
`~/.config/niki/auth.env` sets the new `NIKI_PUBLIC_URL` and includes the new
HTTPS origin in `OD_ALLOWED_ORIGINS`; the existing runtime launch agent was
restarted to load those values. Backups and restoration manifests are under
`~/Backups/Niki/cloudflare-migration/`.

The two Wrangler configs record the Worker and Pages deployment settings.
The initial deployment used Cloudflare's authenticated dashboard: compiled
`worker.ts` was pasted into Quick Edit; compiled `pages.ts` was uploaded as
`_worker.js` alongside `_routes.json` (`{"version":1,"include":["/*"],"exclude":[]}`)
and an empty `index.html`. After saving Pages' production service binding,
redeploy the package so that binding becomes active. Do not upload repository
files, local data or credentials. Dashboard settings, including Pages' fail-closed
quota policy, must be retained for future deployments.

Accepted Worker version: `9e4b3222` (100% traffic).
Accepted Pages deployment: `6cb7195d-0a9d-4560-bbe6-06b343fa7e7e`.

```sh
node --experimental-strip-types --test deploy/tests/niki-cloudflare.test.ts
corepack pnpm exec tsc deploy/cloudflare/worker.ts deploy/cloudflare/pages.ts --target es2022 --module es2022 --lib es2022,dom,dom.iterable --skipLibCheck --outDir /tmp/niki-cloudflare-build
corepack pnpm exec tsc deploy/cloudflare/configure-monitor.ts --noEmit --target es2022 --module nodenext --skipLibCheck
```

`configure-monitor.ts` backs up and migrates the existing monitor's Niki public
probes, adding connector readiness, a separately labelled proxy probe, and
status serialization. Shared Tailscale/Funnel/ONCA checks and routes remain
intact. It rejects unexpected migration anchors. Run it on the Niki host with
`node deploy/cloudflare/configure-monitor.ts`; a second run is a no-op.

## Acceptance (2026-10-20)

- Opened Niki freshly from the actual Feishu desktop workbench. Feishu login
  completed at the Pages address with release `ff484eb4b394`, the existing
  account, 173 historical generations, and a rendered poster visible.
- Direct network requests (explicitly bypassing the host proxy) succeeded.
  All 18 loaded JS/CSS assets matched local production byte for byte.
  Health/auth bootstrap returned 200; unauthenticated project and local
  operator database endpoints returned 401; a spoofed localhost Origin returned 403.
- Feishu console shows version 1.0.8 published, no permission changes, and the
  same availability scope. Desktop and mobile entries both use Pages;
  an actual mobile device was not available for acceptance.
- Existing monitor reports runtime, direct public ingress, Cloudflare connector,
  proxy probe, and the unchanged ONCA checks healthy. Its overall status remains
  degraded because of the pre-existing disk-space warning (about 14.8 GiB free).
- `pnpm typecheck` passed. The four ingress tests and targeted TypeScript checks
  passed. `pnpm guard` passed in a tracked-source validation snapshot; the working
  directory's guard encounters unrelated pre-existing JavaScript under `output/`.

The old Tailscale public hostname returned NXDOMAIN. The first Cloudflare
workers.dev endpoint also failed on this host's direct network (DNS answers
were inconsistent and direct TLS reset), while proxy access worked. Pages was
selected after direct-network and real Feishu client verification. This verifies
the current environment, not all networks. No domain was purchased.
Cloudflare service quotas and VPC beta availability still apply.

For rollback, first verify the replacement entry is reachable. Restore only
the corresponding backed-up auth/monitor changes after comparing later edits,
restart the existing Niki runtime, and publish a Feishu version with the
verified entry/callback. Keep the immutable application release and rollback
release intact. Do not reset the shared Funnel or remove its ONCA/finberry routes.
