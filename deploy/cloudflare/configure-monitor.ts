/** Scoped migration of the existing host monitor; preserves shared Funnel routes. */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, chmodSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const home = homedir();
const file = join(home, '.local/share/niki-auth/monitor.zsh');
const original = readFileSync(file, 'utf8');
if (original.includes('# Niki Cloudflare ingress v4')) {
  console.log('Cloudflare monitor already configured');
  process.exit(0);
}
function replaceOnce(source: string, from: string, to: string): string {
  if (source.split(from).length !== 2) throw new Error('Monitor layout changed; inspect before migration');
  return source.replace(from, to);
}
// Keep public_url/public_host for existing Funnel + ONCA monitoring. Only the
// Niki public probe block below uses Cloudflare, independent of Tailscale health.
let updated = original;
if (!original.includes('# Niki Cloudflare ingress v3')) {
  if (!original.includes('# Niki Cloudflare ingress v2')) {
    if (!original.includes('# Niki Cloudflare ingress v1')) {
      updated = replaceOnce(original, 'public_probe_ip=""', `# Niki Cloudflare ingress v1
      niki_public_url="https://niki.1045423197.workers.dev"
      niki_public_host="niki.1045423197.workers.dev"
      cloudflare_ok=0
      if /usr/bin/curl --fail --silent --max-time 5 --noproxy '*' http://127.0.0.1:20291/ready >/dev/null; then
        cloudflare_ok=1
        record_success cloudflare-tunnel "Niki Cloudflare tunnel is connected; service scope 127.0.0.1:17573"
      else
        record_failure cloudflare-tunnel critical "Niki Cloudflare connector is not ready" "\${remote_failure_threshold}"
      fi
      public_probe_ip=""`);
      const start = updated.indexOf('public_recursive_ips() {');
      const end = updated.indexOf('\ncheck_onca_ingress', start);
      if (start < 0 || end < 0) throw new Error('Cannot locate scoped public ingress probes');
      let probes = updated.slice(start, end)
        .replaceAll('${public_host}', '${niki_public_host}')
        .replaceAll('${public_url}', '${niki_public_url}')
        .replaceAll('${public_url%/}', '${niki_public_url%/}');
      probes = replaceOnce(probes,
        '  /usr/bin/dig +short @ns1.dnsimple.com "${niki_public_host}" A 2>/dev/null \\\n',
        '  local authority\n  authority="$(/usr/bin/dig +short @1.1.1.1 workers.dev NS 2>/dev/null | /usr/bin/head -n 1)"\n  [[ -n "${authority}" ]] || return 1\n  /usr/bin/dig +short "@${authority}" "${niki_public_host}" A 2>/dev/null \\\n');
      probes = replaceOnce(probes, 'elif (( tailscale_ok == 0 || funnel_ok == 0 )); then', 'elif (( cloudflare_ok == 0 )); then');
      probes = probes.replace('public probe is blocked by Tailscale or Funnel failure', 'public probe is blocked by Cloudflare tunnel failure')
        .replace('all failed through Funnel ingress', 'all failed through Cloudflare ingress');
      updated = updated.slice(0, start) + probes + updated.slice(end);
    }
    updated = replaceOnce(updated, '# Niki Cloudflare ingress v1', '# Niki Cloudflare ingress v2');
    // Report service health through the existing proxy separately. A successful
    // proxy check must never mark the direct-network probe healthy.
    updated = replaceOnce(updated, 'public_probe_ip=""', `cloudflare_proxy_page="$(/usr/bin/curl --silent --show-error --proxy "http://127.0.0.1:\${proxy_port}" --noproxy '' --connect-timeout 5 --max-time 15 --output /dev/null --write-out '%{http_code}' "\${niki_public_url}" 2>/dev/null || true)"
    cloudflare_proxy_health="$(/usr/bin/curl --fail --silent --proxy "http://127.0.0.1:\${proxy_port}" --noproxy '' --connect-timeout 5 --max-time 15 "\${niki_public_url}/api/health" 2>/dev/null || true)"
    if [[ "\${cloudflare_proxy_page}" == 200 ]] && print -r -- "\${cloudflare_proxy_health}" | /usr/bin/jq -e '.ok == true' >/dev/null 2>&1; then
      record_success cloudflare-public-proxy "Cloudflare web/API healthy via existing host proxy; direct network checked separately"
    else
      record_failure cloudflare-public-proxy warning "Cloudflare web/API check through existing host proxy failed" "\${public_failure_threshold}"
    fi
    public_probe_ip=""`);
  }
  updated = updated.replace('# Niki Cloudflare ingress v2', '# Niki Cloudflare ingress v3')
    .replaceAll('https://niki.1045423197.workers.dev', 'https://niki-work-app.pages.dev')
    .replaceAll('niki_public_host="niki.1045423197.workers.dev"', 'niki_public_host="niki-work-app.pages.dev"')
    .replace('@1.1.1.1 workers.dev NS', '@1.1.1.1 pages.dev NS');
}
updated = replaceOnce(updated, '# Niki Cloudflare ingress v3', '# Niki Cloudflare ingress v4');
updated = updated.replaceAll('for component_key in runtime tailscale funnel remote-ssh public-ingress ',
  'for component_key in runtime tailscale funnel remote-ssh cloudflare-tunnel cloudflare-public-proxy public-ingress ');
for (const component of ['cloudflare-tunnel', 'cloudflare-public-proxy']) {
  const key = component.replaceAll('-', '_');
  const args = [
    `  --arg ${key}_status "\${component_status[${component}]:-unknown}"`,
    `  --arg ${key}_detail "\${component_detail[${component}]:-not checked}"`,
    `  --argjson ${key}_failures "\${component_failures[${component}]:-0}"`,
  ].join(' \\\n') + ' \\\n';
  updated = replaceOnce(updated, '  --arg public_status ', args + '  --arg public_status ');
  updated = replaceOnce(updated, '      "public-ingress":',
    `      "${component}":{status:$${key}_status,detail:$${key}_detail,consecutiveFailures:$${key}_failures},\n      "public-ingress":`);
}
// Check shell syntax before replacing the live monitor.
const checkFile = `/tmp/niki-monitor-cloudflare-${process.pid}.zsh`;
writeFileSync(checkFile, updated, { mode: 0o600 });
execFileSync('/bin/zsh', ['-n', checkFile]);
const backup = join(home, 'Backups/Niki/cloudflare-migration', `monitor-${Date.now()}`);
mkdirSync(backup, { recursive: true, mode: 0o700 });
copyFileSync(file, join(backup, 'monitor.zsh'));
chmodSync(join(backup, 'monitor.zsh'), 0o600);
writeFileSync(join(backup, 'manifest.json'), JSON.stringify({ source: file,
  restore: 'Compare subsequent edits, restore monitor.zsh and run zsh -n. Existing launch agent runs it every minute.',
  changes: 'Only Niki public probes and dedicated connector readiness; shared Funnel and ONCA retained.' }, null, 2));
writeFileSync(file, updated);
console.log(`Configured Niki Cloudflare monitor; backup: ${backup}`);
