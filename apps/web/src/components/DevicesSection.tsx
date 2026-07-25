import {
  DEVICE_BRIDGE_PROTOCOL_VERSION,
  type DeviceBridgeDevice,
  type DeviceBridgeRelayMessage,
  type DeviceBridgeStatusResponse,
  type RelayClaimPairingResponse,
  type StartDevicePairingResponse,
} from '@open-design/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '../i18n';
import { Icon } from './Icon';

const RELAY_URL_KEY = 'niki:device-relay-url';
const BROWSER_SESSION_KEY = 'niki:device-browser-session';
const DEFAULT_RELAY_URL =
  process.env.NEXT_PUBLIC_NIKI_RELAY_URL ??
  (process.env.NODE_ENV === 'production'
    ? 'https://niki-device-relay.onrender.com'
    : 'http://127.0.0.1:18765');

interface BrowserSession {
  relayUrl: string;
  browserToken: string;
  websocketUrl: string;
}

const COPY = {
  en: {
    localTitle: 'This Mac',
    localHint: 'Connects outward to the relay. Codex credentials and project files stay local.',
    remoteTitle: 'Paired device',
    remoteHint: 'Enter the one-time code shown on your Mac to view presence and test latency.',
    relayUrl: 'Relay URL',
    deviceName: 'Device name',
    generate: 'Generate pairing code',
    disconnect: 'Disconnect device',
    pairCode: 'Pairing code',
    expires: 'Expires',
    code: '6-digit code',
    claim: 'Pair device',
    forget: 'Forget browser pairing',
    ping: 'Test connection',
    online: 'Online',
    offline: 'Offline',
    unavailable: 'Local daemon unavailable. You can still pair with a remote Mac below.',
    latency: 'Round trip',
    restricted: 'MVP permissions: device presence and Ping/Pong only. No command or file access.',
  },
  zh: {
    localTitle: '这台 Mac',
    localHint: '由本机主动连接中继。Codex 凭据与项目文件始终留在本机。',
    remoteTitle: '已配对设备',
    remoteHint: '输入 Mac 上显示的一次性配对码，查看在线状态并测试延迟。',
    relayUrl: '中继地址',
    deviceName: '设备名称',
    generate: '生成配对码',
    disconnect: '断开设备',
    pairCode: '配对码',
    expires: '有效期至',
    code: '6 位配对码',
    claim: '配对设备',
    forget: '取消浏览器配对',
    ping: '测试连接',
    online: '在线',
    offline: '离线',
    unavailable: '本地 daemon 不可用。你仍可在下方配对另一台 Mac。',
    latency: '往返延迟',
    restricted: 'MVP 权限仅包含设备在线状态与 Ping/Pong，不允许执行命令或访问文件。',
  },
} as const;

function loadBrowserSession(): BrowserSession | null {
  try {
    const raw = localStorage.getItem(BROWSER_SESSION_KEY);
    return raw ? (JSON.parse(raw) as BrowserSession) : null;
  } catch {
    return null;
  }
}

function saveBrowserSession(session: BrowserSession | null): void {
  try {
    if (session) localStorage.setItem(BROWSER_SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(BROWSER_SESSION_KEY);
  } catch {
    // Browser storage is optional; the active tab can still use the session.
  }
}

export function DevicesSection(): JSX.Element {
  const { locale } = useI18n();
  const copy = locale === 'zh-CN' || locale === 'zh-TW' ? COPY.zh : COPY.en;
  const [relayUrl, setRelayUrl] = useState(() => {
    try {
      return localStorage.getItem(RELAY_URL_KEY) || DEFAULT_RELAY_URL;
    } catch {
      return DEFAULT_RELAY_URL;
    }
  });
  const [deviceName, setDeviceName] = useState('');
  const [localStatus, setLocalStatus] = useState<DeviceBridgeStatusResponse | null>(null);
  const [localUnavailable, setLocalUnavailable] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [pairCode, setPairCode] = useState('');
  const [session, setSession] = useState<BrowserSession | null>(() => loadBrowserSession());
  const [remoteDevice, setRemoteDevice] = useState<DeviceBridgeDevice | null>(null);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const pendingPingRef = useRef<{ requestId: string; startedAt: number } | null>(null);

  const localCode = localStatus?.pairCode;
  const formattedLocalCode = useMemo(
    () => (localCode ? `${localCode.slice(0, 3)} ${localCode.slice(3)}` : ''),
    [localCode],
  );

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await fetch('/api/device-bridge/status', { cache: 'no-store' });
        if (!response.ok) throw new Error('daemon unavailable');
        const status = (await response.json()) as DeviceBridgeStatusResponse;
        if (!cancelled) {
          setLocalStatus(status);
          setDeviceName((current) => current || status.device?.name || '');
          setLocalUnavailable(false);
        }
      } catch {
        if (!cancelled) setLocalUnavailable(true);
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!session) {
      socketRef.current?.close();
      socketRef.current = null;
      setRemoteDevice(null);
      return;
    }
    let cancelled = false;
    let reconnectTimer: number | null = null;
    const connect = () => {
      if (cancelled) return;
      const socket = new WebSocket(session.websocketUrl);
      socketRef.current = socket;
      socket.addEventListener('open', () => {
        socket.send(
          JSON.stringify({
            type: 'browser.hello',
            protocolVersion: DEVICE_BRIDGE_PROTOCOL_VERSION,
          }),
        );
      });
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(String(event.data)) as DeviceBridgeRelayMessage;
        if (message.type === 'relay.status') setRemoteDevice(message.device);
        if (message.type === 'relay.pong') {
          const pending = pendingPingRef.current;
          if (pending?.requestId === message.requestId) {
            setLatency(Date.now() - pending.startedAt);
            pendingPingRef.current = null;
            setRemoteBusy(false);
          }
        }
        if (message.type === 'relay.error') {
          setError(message.message);
          setRemoteBusy(false);
        }
      });
      socket.addEventListener('close', () => {
        if (!cancelled) reconnectTimer = window.setTimeout(connect, 3_000);
      });
    };
    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [session]);

  const generatePairCode = async () => {
    setLocalBusy(true);
    setError(null);
    try {
      const normalizedRelayUrl = relayUrl.trim().replace(/\/+$/, '');
      const response = await fetch('/api/device-bridge/pair', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          relayUrl: normalizedRelayUrl,
          ...(deviceName.trim() ? { deviceName: deviceName.trim() } : {}),
        }),
      });
      const body = (await response.json()) as StartDevicePairingResponse & { error?: string };
      if (!response.ok) throw new Error(body.error || `Pairing failed (${response.status}).`);
      setLocalStatus(body);
      setRelayUrl(normalizedRelayUrl);
      localStorage.setItem(RELAY_URL_KEY, normalizedRelayUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLocalBusy(false);
    }
  };

  const disconnectLocal = async () => {
    setLocalBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/device-bridge/pair', { method: 'DELETE' });
      if (!response.ok) throw new Error(`Disconnect failed (${response.status}).`);
      setLocalStatus((await response.json()) as DeviceBridgeStatusResponse);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLocalBusy(false);
    }
  };

  const claimPairingCode = async () => {
    const code = pairCode.replace(/\D/g, '');
    if (code.length !== 6) return;
    setRemoteBusy(true);
    setError(null);
    try {
      const normalizedRelayUrl = relayUrl.trim().replace(/\/+$/, '');
      const response = await fetch(`${normalizedRelayUrl}/v1/pair/claim`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const body = (await response.json()) as RelayClaimPairingResponse & { error?: string };
      if (!response.ok) throw new Error(body.error || `Pairing failed (${response.status}).`);
      const nextSession: BrowserSession = {
        relayUrl: normalizedRelayUrl,
        browserToken: body.browserToken,
        websocketUrl: body.websocketUrl,
      };
      setSession(nextSession);
      saveBrowserSession(nextSession);
      setRemoteDevice(body.device);
      setPairCode('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setRemoteBusy(false);
    }
  };

  const forgetBrowserPairing = () => {
    saveBrowserSession(null);
    setSession(null);
    setLatency(null);
    setError(null);
  };

  const ping = () => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError('Device session is reconnecting.');
      return;
    }
    const requestId = crypto.randomUUID();
    const startedAt = Date.now();
    pendingPingRef.current = { requestId, startedAt };
    setRemoteBusy(true);
    setLatency(null);
    setError(null);
    socket.send(JSON.stringify({ type: 'browser.ping', requestId, sentAt: startedAt }));
  };

  return (
    <section className="settings-section device-bridge-section">
      <div className="device-bridge-notice">
        <Icon name="info" size={16} />
        <span>{copy.restricted}</span>
      </div>

      <div className="device-bridge-block">
        <div className="device-bridge-heading">
          <div>
            <h3>{copy.localTitle}</h3>
            <p>{copy.localHint}</p>
          </div>
          {localStatus && !localUnavailable ? (
            <span className={`device-status is-${localStatus.state}`}>
              <span />
              {localStatus.state === 'online' ? copy.online : copy.offline}
            </span>
          ) : null}
        </div>
        {localUnavailable ? (
          <p className="device-bridge-muted">{copy.unavailable}</p>
        ) : (
          <>
            <div className="device-bridge-grid">
              <label className="field">
                <span className="field-label">{copy.relayUrl}</span>
                <input
                  value={relayUrl}
                  onChange={(event) => setRelayUrl(event.target.value)}
                  placeholder={DEFAULT_RELAY_URL}
                />
              </label>
              <label className="field">
                <span className="field-label">{copy.deviceName}</span>
                <input
                  value={deviceName}
                  onChange={(event) => setDeviceName(event.target.value)}
                />
              </label>
            </div>
            {formattedLocalCode ? (
              <div className="device-pair-code">
                <span>{copy.pairCode}</span>
                <strong>{formattedLocalCode}</strong>
                <small>
                  {copy.expires}{' '}
                  {new Date(localStatus?.pairCodeExpiresAt ?? 0).toLocaleTimeString()}
                </small>
              </div>
            ) : null}
            <div className="device-bridge-actions">
              <button
                type="button"
                className="primary"
                disabled={localBusy}
                onClick={() => void generatePairCode()}
              >
                {localBusy ? <Icon name="spinner" className="icon-spin" /> : <Icon name="link" />}
                {copy.generate}
              </button>
              {localStatus?.state !== 'unpaired' ? (
                <button type="button" disabled={localBusy} onClick={() => void disconnectLocal()}>
                  {copy.disconnect}
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>

      <div className="device-bridge-block">
        <div className="device-bridge-heading">
          <div>
            <h3>{copy.remoteTitle}</h3>
            <p>{copy.remoteHint}</p>
          </div>
          {remoteDevice ? (
            <span className={`device-status is-${remoteDevice.state}`}>
              <span />
              {remoteDevice.state === 'online' ? copy.online : copy.offline}
            </span>
          ) : null}
        </div>
        {session && remoteDevice ? (
          <>
            <div className="device-card">
              <Icon name="present" size={22} />
              <div>
                <strong>{remoteDevice.name}</strong>
                <span>{remoteDevice.platform}</span>
              </div>
              {latency !== null ? (
                <output>
                  {copy.latency} <strong>{latency} ms</strong>
                </output>
              ) : null}
            </div>
            <div className="device-bridge-actions">
              <button
                type="button"
                className="primary"
                disabled={remoteBusy || remoteDevice.state !== 'online'}
                onClick={ping}
              >
                {remoteBusy ? <Icon name="spinner" className="icon-spin" /> : <Icon name="play" />}
                {copy.ping}
              </button>
              <button type="button" onClick={forgetBrowserPairing}>
                {copy.forget}
              </button>
            </div>
          </>
        ) : (
          <div className="device-claim-row">
            <input
              inputMode="numeric"
              maxLength={7}
              value={pairCode}
              onChange={(event) => setPairCode(event.target.value.replace(/[^\d ]/g, ''))}
              placeholder={copy.code}
              aria-label={copy.code}
            />
            <button
              type="button"
              className="primary"
              disabled={remoteBusy || pairCode.replace(/\D/g, '').length !== 6}
              onClick={() => void claimPairingCode()}
            >
              {remoteBusy ? <Icon name="spinner" className="icon-spin" /> : <Icon name="link" />}
              {copy.claim}
            </button>
          </div>
        )}
      </div>
      {error ? <p className="device-bridge-error">{error}</p> : null}
    </section>
  );
}
