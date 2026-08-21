// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../src/i18n';
import { LogoStudioView } from '../../src/components/LogoStudioView';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('LogoStudioView', () => {
  it('builds the brief through the logo API and creates an auto-running project', async () => {
    const onCreate = vi.fn();
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      brief: {
        brandName: 'Northstar',
        industry: 'Climate analytics',
        audience: '',
        personality: ['precise'],
        architecture: 'combination',
        palette: ['#FF5A1F'],
        applications: ['web'],
        avoid: [],
        notes: '',
      },
      project: {
        name: 'Northstar Logo',
        skillId: 'logo-generator',
        designSystemId: null,
        pendingPrompt: 'Use $logo-generator',
        metadata: { kind: 'image', imageAspect: '1:1', skipDiscoveryBrief: true },
        pluginId: 'od-media-generation',
        pluginInputs: { mediaKind: 'image', aspect: '1:1' },
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    render(
      <I18nProvider initial="en">
        <LogoStudioView onCreate={onCreate} />
      </I18nProvider>,
    );

    fireEvent.change(screen.getByLabelText('Brand name'), { target: { value: 'Northstar' } });
    fireEvent.change(screen.getByLabelText('Industry'), { target: { value: 'Climate analytics' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate 4 directions' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/logo/brief', expect.objectContaining({ method: 'POST' }));
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Northstar Logo',
      skillId: 'logo-generator',
      autoSendFirstMessage: true,
      pendingPrompt: 'Use $logo-generator',
    }));
  });

  it('keeps the user on the form when required fields are empty', () => {
    const onCreate = vi.fn();
    render(
      <I18nProvider initial="en">
        <LogoStudioView onCreate={onCreate} />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Generate 4 directions' }));
    expect(screen.getByRole('alert').textContent).toContain('brand name and industry');
    expect(onCreate).not.toHaveBeenCalled();
  });
});
