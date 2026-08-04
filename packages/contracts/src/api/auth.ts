export interface NikiAuthUser {
  id: string;
  name: string;
  avatarUrl?: string;
  role: 'admin' | 'member';
  provider?: NikiAuthProvider;
}

export type NikiAuthMode = 'disabled' | 'password' | 'feishu' | 'hybrid';
export type NikiAuthProvider = 'password' | 'feishu';

export interface NikiAuthConfigResponse {
  enabled: boolean;
  mode: NikiAuthMode;
  /** Primary provider retained for clients that predate multi-provider auth. */
  provider: NikiAuthProvider | null;
  providers: NikiAuthProvider[];
  ready: boolean;
  passwordLogin: boolean;
  feishuLogin: boolean;
  bootstrapRequired: boolean;
}

export interface NikiAuthMeResponse {
  user: NikiAuthUser;
}

export interface NikiUserQuota {
  storageBytes: number;
  dailyGenerations: number;
}

export interface NikiUserQuotaUsage {
  storageBytes: number;
  dailyGenerations: number;
  windowStartedAt: number;
}

export interface NikiUserQuotaStatus {
  userId: string;
  quota: NikiUserQuota;
  usage: NikiUserQuotaUsage;
  allowed: {
    storage: boolean;
    generation: boolean;
  };
}

export interface NikiManagedUser {
  user: NikiAuthUser;
  provider: 'feishu' | 'password';
  username?: string;
  isActive: boolean;
  createdAt: number;
  quota: NikiUserQuota;
  usage: NikiUserQuotaUsage;
}

export interface NikiManagedUserListResponse {
  users: NikiManagedUser[];
}

export interface NikiUserQuotaUpdateRequest {
  storageBytes: number;
  dailyGenerations: number;
}

export interface NikiPasswordAccount {
  username: string;
  user: NikiAuthUser;
  isActive: boolean;
  createdAt: number;
}

export interface NikiPasswordAccountListResponse {
  accounts: NikiPasswordAccount[];
}

export interface NikiPasswordAccountCreateRequest {
  username: string;
  name: string;
  password: string;
}

export interface NikiPasswordAccountCreateResponse {
  account: NikiPasswordAccount;
}

export interface NikiPasswordAccountPasswordUpdateRequest {
  password: string;
}

export interface NikiPasswordAccountPasswordUpdateResponse {
  ok: true;
}

export interface NikiPasswordLoginRequest {
  username: string;
  password: string;
}

export interface NikiPasswordLoginResponse extends NikiAuthMeResponse {
  /** Returned only when the client explicitly requests bearer transport. */
  sessionToken?: string;
  expiresAt?: number;
}

export type NikiPasswordAdminBootstrapRequest = NikiPasswordAccountCreateRequest;
export type NikiPasswordAdminBootstrapResponse = NikiPasswordAccountCreateResponse;

export interface NikiPasswordChangeRequest {
  currentPassword: string;
  newPassword: string;
}

export interface NikiPasswordChangeResponse extends NikiPasswordLoginResponse {
  ok: true;
}
