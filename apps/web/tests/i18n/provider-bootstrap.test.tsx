// @vitest-environment node

import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { I18nProvider, useT } from '../../src/i18n';

function LocalizedWorkspace() {
  const t = useT();
  return <main>{t('entry.navNewProject')}</main>;
}

it('renders a locale-neutral bootstrap screen instead of English app content before hydration', () => {
  const html = renderToStaticMarkup(
    <I18nProvider deferUntilClient>
      <LocalizedWorkspace />
    </I18nProvider>,
  );

  expect(html).toContain('data-testid="locale-bootstrap"');
  expect(html).toContain('aria-label="Niki"');
  expect(html).toContain('locale-bootstrap__spinner');
  expect(html).not.toContain('locale-bootstrap__logo');
  expect(html).not.toContain('locale-bootstrap__name');
  expect(html).not.toContain('<img');
  expect(html).not.toContain('New project');
});
