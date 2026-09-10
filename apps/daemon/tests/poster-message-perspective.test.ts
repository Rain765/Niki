import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { projectMessagePoint, warpAntiFraudMessage } from '../src/poster-message-perspective.js';

describe('outward message perspective', () => {
  it('tilts clockwise and makes the far-right edge shorter without expanding the envelope', () => {
    const tl = projectMessagePoint(0, 0);
    const tr = projectMessagePoint(1, 0);
    const bl = projectMessagePoint(0, 1);
    const br = projectMessagePoint(1, 1);
    expect(tr.y).toBeGreaterThan(tl.y + 0.05);
    expect(br.y - tr.y).toBeLessThan(bl.y - tl.y);
    expect(br.y - tr.y).toBeGreaterThan(0.9);
    for (let x = 0; x <= 20; x++) for (let y = 0; y <= 20; y++) {
      const p = projectMessagePoint(x / 20, y / 20);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
  });

  it('keeps the transformed card and badge together on a transparent canvas', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="140"><rect x="12" y="2" width="184" height="120" fill="white"/><rect x="2" y="104" width="30" height="30" fill="red"/></svg>');
    const result = await warpAntiFraudMessage(svg, 200, 140);
    const { data, info } = await sharp(result).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(info).toMatchObject({ width: 200, height: 140, channels: 4 });
    const pixel = (x: number, y: number) => Array.from(data.subarray((y * 200 + x) * 4, (y * 200 + x) * 4 + 4));
    expect(pixel(199, 0)[3]).toBe(0);
    expect(pixel(199, 139)[3]).toBe(0);
    const badge = projectMessagePoint(17 / 200, 118 / 140);
    expect(pixel(Math.round(badge.x * 200), Math.round(badge.y * 140))).toEqual([255, 0, 0, 255]);
    expect(pixel(100, 55)).toEqual([255, 255, 255, 255]);
  });
});
