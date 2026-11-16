import { describe, expect, it } from 'vitest';

import {
  NATIVE_PRESENTATION_DEFAULT_RATIO,
  nativePresentationDesignInstructions,
} from '../src/api/native-presentations.js';

describe('native presentation canvas defaults', () => {
  it('pins the shared default to 16:9', () => {
    expect(NATIVE_PRESENTATION_DEFAULT_RATIO).toBe('16:9');
  });

  it.each([
    ['html-ppt', 'tech-sharing', ''],
    ['html-ppt', 'custom', 'minimal-white'],
    ['guizang-ppt-skill', 'A', 'Monocle'],
    ['guizang-ppt-skill', 'B', 'IKB'],
    ['guizang-ppt-skill', '', ''],
  ] as const)('enforces a 16:9 canvas for %s / %s', (workflow, template, theme) => {
    const instructions = nativePresentationDesignInstructions(workflow, template, theme);

    expect(instructions).toContain('画布比例固定为 16:9 横向宽屏');
    expect(instructions).toContain('不要改为 4:3、16:10、正方形或竖版');
  });

  it('keeps the explicitly selected social-post template as a non-default exception', () => {
    const instructions = nativePresentationDesignInstructions('html-ppt', 'xhs-post');

    expect(instructions).toContain('画布按该模板保持 3:4（810×1080）');
    expect(instructions).toContain('不要把这一例外作为其他演示稿的默认比例');
    expect(instructions).not.toContain('画布比例固定为 16:9');
  });
});
