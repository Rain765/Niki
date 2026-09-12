/** Frozen resources used by the native entry; no renderer or model policy lives here. */
export const NATIVE_PRESENTATION_RESOURCES = {
  'html-ppt': 'sha256:4c6c510e6c28f0962416689c2b91b24539a65685563c9843bcd5f9c3a5af780f',
  'guizang-ppt-skill': 'zip-sha256:386e091390b83d2d8abf737e80540eb1b767c0a70e86bd92aa88d7f6d29c451b',
} as const;

export type NativePresentationWorkflow = keyof typeof NATIVE_PRESENTATION_RESOURCES;
export interface NativePresentationMetadata {
  version: 1;
  workflow: NativePresentationWorkflow;
  resourceVersion: string;
  brief: string;
  sourceFileName?: string;
}

export function nativePresentationWorkspaceUrl(projectId: string): string {
  return `/ppt-workspace?path=${encodeURIComponent(`/projects/${encodeURIComponent(projectId)}`)}`;
}
