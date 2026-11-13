// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { nativePresentationWorkspaceUrl } from '@open-design/contracts';
import { navigate, useRoute } from '../../src/router';

afterEach(() => { cleanup(); window.history.replaceState(null, '', '/'); });
it('retains conversation and file deep links on the statically exportable PPT workspace', () => {
  window.history.replaceState(null, '', nativePresentationWorkspaceUrl('deck-1'));
  const { result } = renderHook(() => useRoute());
  expect(result.current).toMatchObject({ kind: 'project', projectId: 'deck-1' });
  act(() => navigate({ kind: 'project', projectId: 'deck-1', conversationId: 'c1', fileName: 'slides/架构.html' }, { replace: true }));
  expect(window.location.pathname).toBe('/ppt-workspace');
  expect(result.current).toEqual({ kind: 'project', projectId: 'deck-1', conversationId: 'c1', fileName: 'slides/架构.html' });
  const restored = renderHook(() => useRoute());
  expect(restored.result.current).toEqual(result.current);
});
it('does not rewrite other project routes', () => {
  window.history.replaceState(null, '', '/projects/other');
  act(() => navigate({ kind: 'project', projectId: 'other', fileName: 'index.html' }));
  expect(window.location.pathname).toBe('/projects/other/files/index.html');
});
