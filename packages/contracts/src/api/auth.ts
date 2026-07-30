export interface NikiAuthUser {
  id: string;
  name: string;
  avatarUrl?: string;
  role: 'admin' | 'member';
}

export interface NikiAuthConfigResponse {
  enabled: boolean;
  provider: 'feishu' | null;
  ready: boolean;
  passwordLogin: boolean;
}

export interface NikiAuthMeResponse {
  user: NikiAuthUser;
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
