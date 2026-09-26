// @vitest-environment jsdom

import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, expect, it, vi } from 'vitest';
import { useRoute } from '../../src/router';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

function RouteProbe() {
  const route = useRoute();
  const projectId = route.kind === 'project' ? route.projectId : '';
  return <span data-project-id={projectId}>{route.kind}</span>;
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
});

it('hydrates a project deep link without rendering different initial markup', async () => {
  const browserWindow = window;
  vi.stubGlobal('window', undefined);
  const serverHtml = renderToString(<RouteProbe />);

  vi.stubGlobal('window', browserWindow);
  window.history.replaceState(null, '', '/projects/project-1');
  document.body.innerHTML = `<div id="root">${serverHtml}</div>`;
  const container = document.querySelector('#root');
  if (!(container instanceof HTMLElement)) throw new Error('root missing');

  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  let root: ReturnType<typeof hydrateRoot> | undefined;
  await act(async () => {
    root = hydrateRoot(container, <RouteProbe />);
  });

  expect(consoleError).not.toHaveBeenCalled();
  expect(container.textContent).toBe('project');
  expect(container.querySelector('span')?.dataset.projectId).toBe('project-1');

  await act(async () => {
    root?.unmount();
  });
  consoleError.mockRestore();
});
