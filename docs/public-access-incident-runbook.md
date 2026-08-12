# Public-access incident runbook

Use this runbook when a Niki public URL fails in a browser, Feishu, or another embedded web client. It covers transport and client-path incidents; it does not authorize deleting application data or changing product code.

Chinese version: [公网访问故障处理规范](public-access-incident-runbook.zh-CN.md).

## Safety invariants

- Preserve evidence before changing state: active URL, time, client error, runtime namespace, source worktree, branch, `HEAD`, process status, DNS answers, proxy mode, and relevant logs.
- Never treat a transport error as a storage problem. Do not delete worktrees, repositories, `.od/`, databases, caches, credentials, or user files while repairing public connectivity.
- Never expose proxy credentials, cookies, OAuth codes or state, session tokens, or application secrets in commands, logs, tickets, or chat.
- Back up every edited configuration with a timestamp. Keep changes hostname-scoped, syntax-check them, reload rather than reinstall when possible, and record the rollback command.
- Do not route a hostname through `DIRECT`, a proxy, or an address override until a read-only probe proves that exact path works.

## Establish the delivery target

Before diagnosis, identify what the user is actually opening:

1. Entry surface: public URL, desktop app, browser, or embedded client.
2. Runtime namespace, daemon and web ports, source worktree, branch, and `HEAD`.
3. Public hostname and expected ingress mechanism.
4. System proxy mode, matching proxy rule, and DNS resolver in use.

For a development runtime, start with:

```sh
pnpm tools-dev status --json
git worktree list
git branch --show-current
git rev-parse HEAD
```

Do not assume that the current shell worktree backs the instance visible to the user.

## Diagnose one layer at a time

Use fresh connections and record timestamps. Replace placeholders locally; never paste secrets into them.

| Layer | Read-only check | What success proves |
| --- | --- | --- |
| Local application | `curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:<web-port>/` | The web process can serve the entry document locally. |
| Private ingress | `curl --noproxy '*' --resolve <host>:443:<private-ip> -I https://<host>/` | Private routing, SNI, certificate, and ingress reach the app. |
| Public direct path | Resolve with the configured and an independent DNS resolver, then run `curl --noproxy '*' -Iv --max-time 15 https://<host>/` | The current network can establish public TLS without a proxy. |
| Configured proxy path | `curl -x http://127.0.0.1:<proxy-port> -Iv --max-time 30 https://<host>/` | The selected proxy route can establish TLS and receive HTTP. |
| Reported client | Open a new browser tab or the official embedded-client entry point with a forced reload. | The actual client, proxy ownership, page assets, and rendering path work together. |

Interpret the first failing boundary:

- Local fails: inspect the managed runtime and application logs. Do not change public routing yet.
- Local succeeds but private ingress fails: inspect the private tunnel, serve mapping, SNI, and certificate.
- Private ingress succeeds but public direct TLS closes while the proxy succeeds: classify this as a direct-route/edge interaction. The public service is not globally down.
- Transport probes succeed but the reported client fails: inspect client proxy ownership, DNS/cache state, embedded-client policy, and the exact launch URL.
- Every route fails: collect server/edge telemetry before assigning an external provider as root cause.

`ERR_CONNECTION_CLOSED` only says that the connection closed before the page loaded. It does not distinguish a stopped application from DNS, TLS, ingress, routing, proxy, or client-container failure.

## Make the smallest reversible change

Apply remediation from the failing boundary outward:

1. Create a timestamped backup of the exact configuration file.
2. Change only the affected hostname or service mapping.
3. Validate configuration syntax and reload the owning process.
4. Force a new TCP/TLS connection; an old persistent connection is not verification.
5. Repeat the layer that failed, then all downstream layers.
6. If the real client still fails, roll back before trying a different hypothesis.

Avoid broad proxy-mode changes, global DNS overrides, certificate exceptions, `/etc/hosts` entries, browser flags, reinstallation, or cache deletion unless narrower evidence shows they are necessary. Cache clearing is a client-state experiment, not a substitute for transport diagnosis; back up recoverable client state first.

## Accept the repair in the real client

Command-line checks are diagnostic evidence, not final acceptance.

For a browser, capture the current-time URL and title or an equivalent screenshot, and confirm that the browser process owns a connection through the intended route. For Feishu, use the official AppLink entry with `reload=true`:

```text
https://applink.feishu.cn/client/web_app/open?appId=<app-id>&mode=appCenter&reload=true
```

Feishu acceptance requires the main HTML and required CSS/JavaScript resources to return successfully, plus first paint or an equivalent ready signal. See the [official Feishu AppLink documentation](https://open.feishu.cn/document/common-capabilities/applink-protocol/supported-protocol/open-an-h5-app?lang=zh-CN).

## Incident record

Record the following in the task or incident note:

- User-visible symptom, client, URL, and first observed time.
- Active runtime namespace, worktree, branch, `HEAD`, and ports.
- Results for local, private, public-direct, proxy, and real-client layers.
- Evidence-backed initiating fault and any local amplification.
- Files changed, timestamped backups, reload action, and rollback result.
- Final real-client evidence and any remaining uncertainty.

Use precise language. For example: “public direct TLS closed from this network while the configured proxy succeeded” is evidence; “the external provider was down” requires provider or edge telemetry.
