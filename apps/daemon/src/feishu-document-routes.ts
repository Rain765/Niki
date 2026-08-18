import type { Express } from 'express';
import type Database from 'better-sqlite3';
import type {
  FeishuDocumentSearchErrorResponse,
  FeishuDocumentSearchRequest,
  FeishuDocumentSearchResponse,
  FeishuDocumentSearchResult,
} from '@open-design/contracts';
import { currentNikiUser } from './niki-auth-context.js';
import {
  getFeishuOAuthCredential,
  saveFeishuOAuthCredential,
  type FeishuOAuthCredential,
} from './niki-auth.js';
import { readNikiAuthRuntimeConfig } from './niki-auth-routes.js';

type SqliteDb = Database.Database;
type FetchLike = typeof fetch;

interface RegisterFeishuDocumentRoutesOptions {
  db: SqliteDb;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
}

const TOKEN_REFRESH_SKEW_MS = 60_000;

function errorBody(
  code: FeishuDocumentSearchErrorResponse['code'],
  error: string,
  reconnect = false,
): FeishuDocumentSearchErrorResponse {
  return {
    code,
    error,
    ...(reconnect
      ? { reconnectUrl: '/api/auth/feishu/start?returnTo=%2F%3Fmode%3Ddocuments' }
      : {}),
  };
}

function seconds(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : fallback;
}

async function refreshCredential(
  fetchImpl: FetchLike,
  credential: FeishuOAuthCredential,
  config: ReturnType<typeof readNikiAuthRuntimeConfig>,
): Promise<FeishuOAuthCredential | null> {
  if (!credential.refreshToken || !config.appId || !config.appSecret) return null;
  if (
    credential.refreshTokenExpiresAt
    && credential.refreshTokenExpiresAt <= Date.now() + TOKEN_REFRESH_SKEW_MS
  ) {
    return null;
  }
  const response = await fetchImpl('https://open.feishu.cn/open-apis/authen/v2/oauth/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: config.appId,
      client_secret: config.appSecret,
      refresh_token: credential.refreshToken,
    }),
  });
  const payload = await response.json() as Record<string, unknown>;
  const data = payload.data && typeof payload.data === 'object'
    ? payload.data as Record<string, unknown>
    : payload;
  if (!response.ok || typeof data.access_token !== 'string') return null;
  const now = Date.now();
  const refreshToken = typeof data.refresh_token === 'string' && data.refresh_token
    ? data.refresh_token
    : credential.refreshToken;
  return {
    accessToken: data.access_token,
    accessTokenExpiresAt: now + seconds(data.expires_in, 7_200) * 1_000,
    refreshToken,
    refreshTokenExpiresAt: now + seconds(
      data.refresh_token_expires_in,
      credential.refreshTokenExpiresAt
        ? Math.max(0, (credential.refreshTokenExpiresAt - now) / 1_000)
        : 604_800,
    ) * 1_000,
    scope: typeof data.scope === 'string' ? data.scope : credential.scope,
  };
}

async function userAccessToken(
  options: RegisterFeishuDocumentRoutesOptions,
): Promise<string | null> {
  const user = currentNikiUser();
  if (!user) return null;
  const credential = getFeishuOAuthCredential(options.db, user.id);
  if (!credential) return null;
  if (credential.accessTokenExpiresAt > Date.now() + TOKEN_REFRESH_SKEW_MS) {
    return credential.accessToken;
  }
  const refreshed = await refreshCredential(
    options.fetchImpl ?? fetch,
    credential,
    readNikiAuthRuntimeConfig(options.env),
  );
  if (!refreshed) return null;
  saveFeishuOAuthCredential(options.db, user.id, refreshed);
  return refreshed.accessToken;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isSafeFeishuUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && /(^|\.)feishu\.cn$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function parseResult(value: unknown): FeishuDocumentSearchResult | null {
  if (!value || typeof value !== 'object') return null;
  const unit = value as Record<string, unknown>;
  const meta = unit.result_meta && typeof unit.result_meta === 'object'
    ? unit.result_meta as Record<string, unknown>
    : {};
  const url = text(meta.url) ?? text(unit.url);
  const title = text(unit.title_highlighted) ?? text(unit.title);
  if (!url || !title || !isSafeFeishuUrl(url)) return null;
  const summary = text(unit.summary_highlighted) ?? text(unit.summary);
  const ownerName = text(meta.owner_name) ?? text(unit.owner_name);
  const updatedAt = number(meta.update_time) ?? number(unit.update_time);
  const entityType = text(unit.entity_type);
  return {
    title,
    url,
    ...(summary ? { summary } : {}),
    ...(ownerName ? { ownerName } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    ...(entityType ? { entityType } : {}),
  };
}

export function registerFeishuDocumentRoutes(
  app: Express,
  options: RegisterFeishuDocumentRoutesOptions,
): void {
  app.post('/api/feishu/documents/search', async (req, res, next) => {
    const body = req.body as Partial<FeishuDocumentSearchRequest> | undefined;
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    if (!query || query.length > 200) {
      return res.status(400).json(errorBody(
        'INVALID_QUERY',
        'Enter a search query between 1 and 200 characters.',
      ));
    }
    const requestedPageSize = typeof body?.pageSize === 'number'
      && Number.isFinite(body.pageSize)
      ? body.pageSize
      : 12;
    const pageSize = Math.min(20, Math.max(1, Math.round(requestedPageSize)));
    try {
      const accessToken = await userAccessToken(options);
      if (!accessToken) {
        return res.status(409).json(errorBody(
          'FEISHU_AUTH_REQUIRED',
          'Reconnect Feishu to search your documents.',
          true,
        ));
      }
      const response = await (options.fetchImpl ?? fetch)(
        'https://open.feishu.cn/open-apis/search/v2/doc_wiki/search',
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json; charset=utf-8',
          },
          body: JSON.stringify({
            query,
            doc_filter: {},
            wiki_filter: {},
            page_size: pageSize,
          }),
        },
      );
      const payload = await response.json() as {
        code?: number;
        msg?: string;
        data?: Record<string, unknown>;
      };
      if (!response.ok || payload.code !== 0) {
        const needsAuth = response.status === 401 || response.status === 403;
        return res.status(needsAuth ? 409 : 502).json(errorBody(
          needsAuth ? 'FEISHU_AUTH_REQUIRED' : 'FEISHU_SEARCH_FAILED',
          needsAuth
            ? 'Feishu permission changed. Reconnect to continue searching.'
            : 'Feishu search is temporarily unavailable.',
          needsAuth,
        ));
      }
      const data = payload.data ?? {};
      const units = Array.isArray(data.res_units) ? data.res_units : [];
      const results = units
        .map(parseResult)
        .filter((item): item is FeishuDocumentSearchResult => item !== null);
      const body: FeishuDocumentSearchResponse = {
        query,
        results,
        total: number(data.total) ?? results.length,
        hasMore: data.has_more === true,
      };
      res.setHeader('cache-control', 'no-store');
      return res.json(body);
    } catch (error) {
      next(error);
    }
  });
}
