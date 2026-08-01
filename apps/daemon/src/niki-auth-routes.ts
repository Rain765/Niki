import type { Express, NextFunction, Request, Response } from 'express';
import type Database from 'better-sqlite3';
import type {
  NikiAuthConfigResponse,
  NikiAuthMeResponse,
  NikiManagedUserListResponse,
  NikiPasswordAccountCreateRequest,
  NikiPasswordAccountCreateResponse,
  NikiPasswordAccountListResponse,
  NikiPasswordAccountPasswordUpdateRequest,
  NikiPasswordAccountPasswordUpdateResponse,
  NikiPasswordLoginRequest,
  NikiUserQuotaStatus,
  NikiUserQuotaUpdateRequest,
} from '@open-design/contracts';
import {
  consumeNikiOAuthState,
  createPasswordUser,
  createNikiOAuthState,
  createNikiSession,
  deleteNikiSession,
  disablePasswordUser,
  listPasswordUsers,
  NikiPasswordAccountError,
  resolveNikiSession,
  updatePasswordUser,
  upsertFeishuUser,
  verifyPasswordUser,
  type FeishuUserProfile,
} from './niki-auth.js';
import {
  assertNikiStorageAllowed,
  getNikiQuotaStatus,
  listNikiManagedUsers,
  NikiQuotaExceededError,
  updateNikiUserQuota,
} from './niki-quota.js';
import { runAsNikiUser } from './niki-auth-context.js';
import {
  checkPasswordLoginSecurity,
  recordPasswordLoginFailure,
  recordPasswordLoginSuccess,
} from './niki-auth-security.js';

type SqliteDb = Database.Database;
type FetchLike = typeof fetch;

const SESSION_COOKIE = 'niki_session';
const OAUTH_STATE_COOKIE = 'niki_oauth_state';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface NikiAuthRuntimeConfig {
  enabled: boolean;
  ready: boolean;
  appId: string;
  appSecret: string;
  publicUrl: string;
  redirectUri: string;
}

interface RegisterNikiAuthRoutesOptions {
  db: SqliteDb;
  projectsRoot: string;
  fetchImpl?: FetchLike;
  env?: NodeJS.ProcessEnv;
  isLocalOperatorRequest?: (req: Request) => boolean;
  resolveClientIp?: (req: Request) => string;
  resolveRunProjectId?: (runId: string) => string | null | undefined;
}

const LOCAL_OPERATOR_API_PATHS = new Set([
  '/daemon/db',
  '/daemon/db/verify',
  '/daemon/db/vacuum',
  '/daemon/shutdown',
]);

export function readNikiAuthRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): NikiAuthRuntimeConfig {
  const enabled = env.NIKI_AUTH_MODE?.trim().toLowerCase() === 'feishu';
  const appId = env.FEISHU_APP_ID?.trim() ?? '';
  const appSecret = env.FEISHU_APP_SECRET?.trim() ?? '';
  const publicUrl = normalizePublicUrl(env.NIKI_PUBLIC_URL ?? '');
  return {
    enabled,
    ready: !enabled || Boolean(appId && appSecret && publicUrl),
    appId,
    appSecret,
    publicUrl,
    redirectUri: publicUrl ? `${publicUrl}/api/auth/feishu/callback` : '',
  };
}

export function registerNikiAuthRoutes(
  app: Express,
  options: RegisterNikiAuthRoutesOptions,
): void {
  const { db, fetchImpl = fetch, projectsRoot } = options;
  const config = readNikiAuthRuntimeConfig(options.env);

  app.get('/api/auth/config', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const body: NikiAuthConfigResponse = {
      enabled: config.enabled,
      provider: config.enabled ? 'feishu' : null,
      ready: config.ready,
      passwordLogin: config.enabled,
    };
    res.json(body);
  });

  app.get('/api/auth/me', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!config.enabled) {
      const body: NikiAuthMeResponse = {
        user: {
          id: 'local',
          name: 'niki',
          role: 'admin',
        },
      };
      return res.json(body);
    }
    const sessionToken = requestSessionToken(req);
    const user = resolveNikiSession(db, sessionToken);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    const body: NikiAuthMeResponse = {
      user: {
        id: user.id,
        name: user.name,
        ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
        role: user.role,
      },
    };
    return res.json(body);
  });

  app.get('/api/auth/feishu/start', (req, res) => {
    if (!config.enabled) return res.redirect('/');
    if (!config.ready) {
      return res.status(503).json({
        error: 'Feishu authentication is not configured on this server',
      });
    }

    const returnTo = safeReturnTo(
      typeof req.query.returnTo === 'string' ? req.query.returnTo : '/',
    );
    const state = createNikiOAuthState(db, returnTo);
    setCookie(res, OAUTH_STATE_COOKIE, state, {
      maxAgeSeconds: 10 * 60,
      secure: config.publicUrl.startsWith('https://'),
    });
    const authorizeUrl = new URL(
      'https://accounts.feishu.cn/open-apis/authen/v1/authorize',
    );
    authorizeUrl.searchParams.set('client_id', config.appId);
    authorizeUrl.searchParams.set('redirect_uri', config.redirectUri);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('scope', 'auth:user.id:read');
    authorizeUrl.searchParams.set('state', state);
    return res.redirect(authorizeUrl.toString());
  });

  app.get('/api/auth/feishu/callback', async (req, res) => {
    if (!config.enabled || !config.ready) {
      return res.redirect('/?authError=not_configured');
    }
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const cookieState = parseCookies(req.headers.cookie)[OAUTH_STATE_COOKIE] ?? '';
    if (!code || !state || !cookieState || !safeEqual(state, cookieState)) {
      clearCookie(res, OAUTH_STATE_COOKIE, config.publicUrl.startsWith('https://'));
      return res.redirect('/?authError=invalid_state');
    }
    const returnTo = consumeNikiOAuthState(db, state);
    clearCookie(res, OAUTH_STATE_COOKIE, config.publicUrl.startsWith('https://'));
    if (!returnTo) return res.redirect('/?authError=expired_state');

    try {
      const accessToken = await exchangeFeishuCode(fetchImpl, config, code);
      const profile = await fetchFeishuProfile(fetchImpl, accessToken);
      const user = upsertFeishuUser(db, profile);
      const session = createNikiSession(db, user.id);
      setCookie(res, SESSION_COOKIE, session.token, {
        maxAgeSeconds: SESSION_TTL_SECONDS,
        secure: config.publicUrl.startsWith('https://'),
      });
      return res.redirect(returnTo);
    } catch (error) {
      console.error('[niki-auth] Feishu callback failed:', error);
      return res.redirect('/?authError=feishu_failed');
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = requestSessionToken(req);
    if (token) deleteNikiSession(db, token);
    clearCookie(res, SESSION_COOKIE, config.publicUrl.startsWith('https://'));
    res.json({ ok: true });
  });

  app.post('/api/auth/password/login', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!config.enabled) {
      return res.status(404).json({ error: 'Password login is not enabled' });
    }
    const clientIp = options.resolveClientIp?.(req)
      || req.ip
      || req.socket.remoteAddress
      || 'unknown';
    const body = req.body as Partial<NikiPasswordLoginRequest> | undefined;
    const username = typeof body?.username === 'string' ? body.username : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    const security = checkPasswordLoginSecurity(db, {
      username,
      ip: clientIp,
    });
    if (security.blocked) {
      res.setHeader('Retry-After', security.retryAfterSeconds);
      return res.status(429).json({ error: '登录尝试过多，请稍后再试' });
    }

    const user = await verifyPasswordUser(db, username, password);
    if (!user) {
      const failure = recordPasswordLoginFailure(db, {
        username,
        ip: clientIp,
      });
      if (failure.blocked) {
        res.setHeader('Retry-After', failure.retryAfterSeconds);
        return res.status(429).json({ error: '登录尝试过多，请稍后再试' });
      }
      return res.status(401).json({ error: '用户名或密码不正确' });
    }
    recordPasswordLoginSuccess(db, {
      username,
      ip: clientIp,
      userId: user.id,
    });
    const session = createNikiSession(db, user.id);
    setCookie(res, SESSION_COOKIE, session.token, {
      maxAgeSeconds: SESSION_TTL_SECONDS,
      secure: config.publicUrl.startsWith('https://'),
    });
    const response: NikiAuthMeResponse = {
      user: publicAuthUser(user),
    };
    return res.json(response);
  });

  app.get('/api/auth/password-users', (req, res) => {
    const admin = requireAdmin(db, req, res);
    if (!admin) return;
    res.setHeader('Cache-Control', 'no-store');
    const body: NikiPasswordAccountListResponse = {
      accounts: listPasswordUsers(db),
    };
    res.json(body);
  });

  app.post('/api/auth/password-users', async (req, res) => {
    const admin = requireAdmin(db, req, res);
    if (!admin) return;
    const body = req.body as Partial<NikiPasswordAccountCreateRequest> | undefined;
    try {
      const account = await createPasswordUser(db, {
        username: typeof body?.username === 'string' ? body.username : '',
        name: typeof body?.name === 'string' ? body.name : '',
        password: typeof body?.password === 'string' ? body.password : '',
      });
      const response: NikiPasswordAccountCreateResponse = { account };
      res.status(201).json(response);
    } catch (error) {
      if (error instanceof NikiPasswordAccountError) {
        const status = error.code === 'username-taken' ? 409 : 400;
        return res.status(status).json({ error: error.message, code: error.code });
      }
      throw error;
    }
  });

  app.patch('/api/auth/password-users/:userId/password', async (req, res) => {
    const admin = requireAdmin(db, req, res);
    if (!admin) return;
    const body = req.body as Partial<NikiPasswordAccountPasswordUpdateRequest> | undefined;
    try {
      const updated = await updatePasswordUser(
        db,
        req.params.userId,
        typeof body?.password === 'string' ? body.password : '',
      );
      if (!updated) return res.status(404).json({ error: '账号不存在' });
      const response: NikiPasswordAccountPasswordUpdateResponse = { ok: true };
      return res.json(response);
    } catch (error) {
      if (error instanceof NikiPasswordAccountError) {
        return res.status(400).json({ error: error.message, code: error.code });
      }
      throw error;
    }
  });

  app.delete('/api/auth/password-users/:userId', (req, res) => {
    const admin = requireAdmin(db, req, res);
    if (!admin) return;
    const disabled = disablePasswordUser(db, req.params.userId);
    if (!disabled) return res.status(404).json({ error: '账号不存在' });
    return res.json({ ok: true });
  });

  app.get('/api/auth/quota', async (req, res, next) => {
    try {
      const user = requireSignedInUser(db, req, res);
      if (!user) return;
      res.setHeader('Cache-Control', 'no-store');
      const body: NikiUserQuotaStatus = await getNikiQuotaStatus(
        db,
        projectsRoot,
        user.id,
      );
      return res.json(body);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/auth/users', async (req, res, next) => {
    try {
      const admin = requireAdmin(db, req, res);
      if (!admin) return;
      res.setHeader('Cache-Control', 'no-store');
      const body: NikiManagedUserListResponse = {
        users: await listNikiManagedUsers(db, projectsRoot),
      };
      return res.json(body);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/auth/users/:userId/quota', async (req, res, next) => {
    try {
      const admin = requireAdmin(db, req, res);
      if (!admin) return;
      const body = req.body as Partial<NikiUserQuotaUpdateRequest> | undefined;
      const updated = updateNikiUserQuota(db, req.params.userId, {
        storageBytes: Number(body?.storageBytes),
        dailyGenerations: Number(body?.dailyGenerations),
      });
      if (!updated) return res.status(404).json({ error: '账号不存在' });
      const status = await getNikiQuotaStatus(
        db,
        projectsRoot,
        req.params.userId,
      );
      return res.json(status);
    } catch (error) {
      if (error instanceof RangeError) {
        return res.status(400).json({ error: error.message });
      }
      next(error);
    }
  });

  // Registered before the product routes. This keeps health/auth bootstrap
  // available while every business endpoint receives an authenticated user
  // through AsyncLocalStorage.
  app.use('/api', async (req, res, next) => {
    try {
      if (!config.enabled) return next();
      if (isPublicApiPath(req.path)) return next();
      if (
        LOCAL_OPERATOR_API_PATHS.has(req.path)
        && options.isLocalOperatorRequest?.(req) === true
      ) {
        return next();
      }
      if (!config.ready) {
        return res.status(503).json({
          error: 'Feishu authentication is not configured on this server',
        });
      }
      const sessionToken = requestSessionToken(req);
      const user = resolveNikiSession(db, sessionToken);
      if (!user) return res.status(401).json({ error: 'Authentication required' });
      if (!requestCanAccessProject(
        db,
        req,
        user.id,
        options.resolveRunProjectId,
      )) {
        return res.status(404).json({ error: 'Project not found' });
      }
      if (
        req.method === 'POST'
        && (req.path === '/runs' || req.path === '/chat')
      ) {
        await assertNikiStorageAllowed(db, projectsRoot, user.id);
      }
      return runAsNikiUser(user, () => next(), sessionToken);
    } catch (error) {
      if (error instanceof NikiQuotaExceededError) {
        return res.status(error.status).json({
          error: error.message,
          code: error.code,
          quota: error.statusBody,
        });
      }
      next(error);
    }
  });
}

function isPublicApiPath(pathname: string): boolean {
  return pathname === '/health'
    || pathname === '/version'
    || pathname === '/daemon/status'
    || pathname === '/auth/config'
    || pathname === '/auth/me'
    || pathname === '/auth/feishu/start'
    || pathname === '/auth/feishu/callback'
    || pathname === '/auth/password/login'
    || pathname === '/auth/logout';
}

function requireAdmin(
  db: SqliteDb,
  req: Request,
  res: Response,
) {
  const user = resolveNikiSession(db, requestSessionToken(req));
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  if (user.role !== 'admin') {
    res.status(403).json({ error: 'Administrator access required' });
    return null;
  }
  return user;
}

function requireSignedInUser(
  db: SqliteDb,
  req: Request,
  res: Response,
) {
  const user = resolveNikiSession(db, requestSessionToken(req));
  if (!user) {
    res.status(401).json({ error: 'Authentication required' });
    return null;
  }
  return user;
}

function publicAuthUser(
  user: ReturnType<typeof resolveNikiSession> extends infer U
    ? Exclude<U, null>
    : never,
) {
  return {
    id: user.id,
    name: user.name,
    ...(user.avatarUrl ? { avatarUrl: user.avatarUrl } : {}),
    role: user.role,
  };
}

function requestSessionToken(req: Request): string {
  const bearer = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer) return bearer;
  return parseCookies(req.headers.cookie)[SESSION_COOKIE] ?? '';
}

function requestCanAccessProject(
  db: SqliteDb,
  req: Request,
  userId: string,
  resolveRunProjectId?: (runId: string) => string | null | undefined,
): boolean {
  const pathMatch = req.path.match(/^\/projects\/([^/]+)/);
  const pathProjectId = pathMatch?.[1]
    ? decodeURIComponent(pathMatch[1])
    : undefined;
  const runMatch = req.path.match(/^\/runs\/([^/]+)/);
  const runProjectId = runMatch?.[1] && resolveRunProjectId
    ? resolveRunProjectId(decodeURIComponent(runMatch[1])) ?? undefined
    : undefined;
  const bodyProjectId = typeof req.body?.projectId === 'string'
    ? req.body.projectId
    : undefined;
  const queryProjectId = typeof req.query.projectId === 'string'
    ? req.query.projectId
    : undefined;
  const projectId = pathProjectId
    ?? runProjectId
    ?? bodyProjectId
    ?? queryProjectId;
  if (!projectId) return true;
  const row = db.prepare(
    'SELECT 1 FROM projects WHERE id = ? AND owner_user_id = ?',
  ).get(projectId, userId);
  return Boolean(row);
}

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
}

function setCookie(
  res: Response,
  name: string,
  value: string,
  options: { maxAgeSeconds: number; secure: boolean },
): void {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${options.maxAgeSeconds}`,
  ];
  if (options.secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function clearCookie(res: Response, name: string, secure: boolean): void {
  setCookie(res, name, '', { maxAgeSeconds: 0, secure });
}

function safeReturnTo(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//') || value.length > 2_048) {
    return '/';
  }
  return value;
}

function normalizePublicUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.origin;
  } catch {
    return '';
  }
}

function safeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

async function exchangeFeishuCode(
  fetchImpl: FetchLike,
  config: NikiAuthRuntimeConfig,
  code: string,
): Promise<string> {
  const response = await fetchImpl(
    'https://open.feishu.cn/open-apis/authen/v2/oauth/token',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        client_id: config.appId,
        client_secret: config.appSecret,
        code,
        redirect_uri: config.redirectUri,
      }),
    },
  );
  const payload = await response.json() as Record<string, unknown>;
  const data = payload.data && typeof payload.data === 'object'
    ? payload.data as Record<string, unknown>
    : payload;
  const accessToken = typeof data.access_token === 'string'
    ? data.access_token
    : '';
  if (!response.ok || !accessToken) {
    throw new Error(`Feishu token exchange failed (${response.status})`);
  }
  return accessToken;
}

async function fetchFeishuProfile(
  fetchImpl: FetchLike,
  accessToken: string,
): Promise<FeishuUserProfile> {
  const response = await fetchImpl(
    'https://open.feishu.cn/open-apis/authen/v1/user_info',
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  const payload = await response.json() as {
    code?: number;
    data?: Record<string, unknown>;
  };
  const data = payload.data ?? {};
  const tenantKey = typeof data.tenant_key === 'string' ? data.tenant_key : '';
  const openId = typeof data.open_id === 'string' ? data.open_id : '';
  const name = typeof data.name === 'string' ? data.name : '';
  if (!response.ok || payload.code !== 0 || !tenantKey || !openId || !name) {
    throw new Error(`Feishu user lookup failed (${response.status})`);
  }
  const unionId = typeof data.union_id === 'string' ? data.union_id : undefined;
  const avatarUrl = typeof data.avatar_url === 'string' ? data.avatar_url : undefined;
  return {
    tenantKey,
    openId,
    ...(unionId ? { unionId } : {}),
    name,
    ...(avatarUrl ? { avatarUrl } : {}),
  };
}

export function requireNikiWebSession(
  db: SqliteDb,
  env: NodeJS.ProcessEnv = process.env,
) {
  const config = readNikiAuthRuntimeConfig(env);
  return (req: Request, res: Response, next: NextFunction) => {
    if (!config.enabled) return next();
    const sessionToken = requestSessionToken(req);
    const user = resolveNikiSession(db, sessionToken);
    if (!user) return res.status(401).send('Authentication required');
    return runAsNikiUser(user, () => next(), sessionToken);
  };
}
