export interface AppVersionInfo {
  version: string;
  /** Immutable runtime identifier used to detect a newly deployed web bundle. */
  release?: string;
  channel: string;
  packaged: boolean;
  platform: string;
  arch: string;
}

export interface AppVersionResponse {
  version: AppVersionInfo;
}
