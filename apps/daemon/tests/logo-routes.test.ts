import { describe, expect, it } from 'vitest';
import { buildLogoBrief } from '../src/logo-routes.js';

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
        imageAspect: '1:1',
        skipDiscoveryBrief: true,
      },
    });
    expect(result.project.pendingPrompt).toContain('Use $logo-generator');
    expect(result.project.pendingPrompt).toContain('four conceptually distinct directions');
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
