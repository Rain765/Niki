import { describe, expect, it } from 'vitest';
import { buildLogoBrief, buildLogoFinalization } from '../src/logo-routes.js';

describe('logo brief builder', () => {
  it('normalizes a structured brief into a shared project blueprint', () => {
    const result = buildLogoBrief({
      brandName: '  Northstar  ',
      industry: 'Climate analytics',
      audience: 'Operations leaders',
      architecture: 'symbol',
      personality: ['precise', 'bold', 'bold'],
      palette: ['#FF5A1F', '#151719'],
      applications: ['favicon', 'web'],
      avoid: ['leaves'],
    });

    expect(result.brief).toMatchObject({
      brandName: 'Northstar',
      architecture: 'symbol',
      personality: ['precise', 'bold'],
    });
    expect(result.project).toMatchObject({
      name: 'Northstar Logo',
      skillId: 'logo-generator',
      pluginId: 'od-media-generation',
      metadata: {
        kind: 'image',
        imageModel: 'gpt-image-2',
        imageAspect: '1:1',
        skipDiscoveryBrief: true,
      },
    });
    expect(result.project.pendingPrompt).toContain('Use $logo-generator');
    expect(result.project.pendingPrompt).toContain('four separate square images');
    expect(result.project.pendingPrompt).toContain('16 px');
  });

  it('requires a brand name and industry', () => {
    expect(() => buildLogoBrief({ brandName: '', industry: 'Software' })).toThrow(
      'brandName and industry are required',
    );
    expect(() => buildLogoBrief({ brandName: 'Northstar', industry: '' })).toThrow(
      'brandName and industry are required',
    );
  });

  it('falls back to the combination architecture for unknown input', () => {
    const result = buildLogoBrief({
      brandName: 'Northstar',
      industry: 'Software',
      architecture: 'emblem' as never,
    });
    expect(result.brief.architecture).toBe('combination');
  });
});

describe('logo finalization builder', () => {
  it('creates an addressable refinement record and a true-vector brand-kit prompt', () => {
    const result = buildLogoFinalization({
      projectId: 'logo-project-1',
      direction: 2,
      mode: 'refine',
      notes: 'Keep the diagonal cut, but make the wordmark calmer.',
    }, {
      finalizationId: 'final-123',
      conversationId: 'conversation-123',
      requestedAt: 1_700_000_000_000,
      projectPrompt: 'Use $logo-generator for Northstar.',
    });

    expect(result.finalization).toMatchObject({
      id: 'final-123',
      projectId: 'logo-project-1',
      conversationId: 'conversation-123',
      direction: 2,
      mode: 'refine',
      sourceFile: 'logo-direction-02.png',
      outputRoot: 'logo/final/final-123',
      status: 'prepared',
      requestedAt: 1_700_000_000_000,
    });
    expect(result.finalization.expectedOutputs).toEqual([
      'logo.svg',
      'logo-dark.svg',
      'logo-mono.svg',
      'favicon.ico',
      'apple-touch-icon.png',
      'og-image.png',
      'BRAND.md',
    ]);
    expect(result.prompt).toContain('logo-direction-02.png');
    expect(result.prompt).toContain('logo/final/final-123/logo.svg');
    expect(result.prompt).toContain('true editable SVG paths');
    expect(result.prompt).toContain('Do not embed the source raster');
    expect(result.prompt).toContain('Keep the diagonal cut');
  });

  it('defaults to deterministic faithful vectorization', () => {
    const result = buildLogoFinalization({
      projectId: 'logo-project-1',
      direction: 2,
    }, {
      finalizationId: 'final-123',
      conversationId: 'conversation-123',
      requestedAt: 1_700_000_000_000,
      projectPrompt: 'Use $logo-generator for Northstar.',
    });

    expect(result.finalization.mode).toBe('faithful');
    expect(result.prompt).toContain('deterministic vector tracing');
    expect(result.prompt).toContain('must not redesign');
  });

  it('rejects directions outside the generated four-up set', () => {
    expect(() => buildLogoFinalization({
      projectId: 'logo-project-1',
      direction: 5 as never,
    }, {
      finalizationId: 'final-123',
      conversationId: 'conversation-123',
      requestedAt: 1,
      projectPrompt: '',
    })).toThrow('direction must be an integer from 1 to 4');
  });

  it('rejects an unknown finalization mode instead of silently choosing a workflow', () => {
    expect(() => buildLogoFinalization({
      projectId: 'logo-project-1',
      direction: 2,
      mode: 'approximate' as never,
    }, {
      finalizationId: 'final-123',
      conversationId: 'conversation-123',
      requestedAt: 1,
      projectPrompt: '',
    })).toThrow('mode must be faithful or refine');
  });
});
