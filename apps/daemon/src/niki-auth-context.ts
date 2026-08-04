import { AsyncLocalStorage } from 'node:async_hooks';

export type NikiUserRole = 'admin' | 'member';

export interface NikiAuthUser {
  id: string;
  name: string;
  avatarUrl?: string;
  role: NikiUserRole;
  createdAt: number;
  updatedAt: number;
}

interface NikiAuthContext {
  user: NikiAuthUser;
  sessionToken?: string;
}

const nikiUserStorage = new AsyncLocalStorage<NikiAuthContext>();

export function currentNikiUser(): NikiAuthUser | null {
  return nikiUserStorage.getStore()?.user ?? null;
}

export function currentNikiSessionToken(): string | null {
  return nikiUserStorage.getStore()?.sessionToken ?? null;
}

export function runAsNikiUser<T>(
  user: NikiAuthUser,
  fn: () => T,
  sessionToken?: string,
): T {
  return nikiUserStorage.run(
    sessionToken ? { user, sessionToken } : { user },
    fn,
  );
}
