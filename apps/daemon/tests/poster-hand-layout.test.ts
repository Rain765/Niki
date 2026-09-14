import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { renderImageWithAntiFraudSafeZoneRetry, finalizeGeneratedPng } from '../src/media.js';
import { antiFraudMessageSize, placeAntiFraudMessage, PosterHandLayoutError, type PosterHand, type PosterHandObservation } from '../src/poster-hand-layout.js';

function hand(left: number, top: number, right: number, bottom: number): PosterHand {
  return { points: Array.from({ length: 21 }, (_, i) => ({
    x: left + (right - left) * (i % 5) / 4,
    y: top + (bottom - top) * Math.floor(i / 5) / 4,
    confidence: 0.9,
  })) };
}
const observation = (palm = hand(0.57, 0.60, 0.70, 0.69)): PosterHandObservation => ({
  hands: [hand(0.35, 0.48, 0.45, 0.61), palm],
  phones: [{ left: 0.37, top: 0.40, right: 0.51, bottom: 0.63 }],
});

describe('hand-relative anti-fraud message layout', () => {
  it.each([[1086, 1448], [1024, 1024], [1536, 864]])('places the complete message below-right for %sx%s', (w, h) => {
    const p = placeAntiFraudMessage(w, h, observation());
    expect(p.top / h).toBeGreaterThanOrEqual(p.rejectingHand.bottom + 0.02);
    expect(p.left / w).toBeGreaterThan((p.rejectingHand.left + p.rejectingHand.right) / 2);
    expect((p.left + p.width) / w).toBeLessThanOrEqual(0.97);
    expect((p.top + p.height * 1.08) / h).toBeLessThanOrEqual(0.97);
  });
  it('moves with the actual hand instead of keeping the old 75% top', () => {
    const upper = placeAntiFraudMessage(1086, 1448, observation());
    const lower = placeAntiFraudMessage(1086, 1448, observation(hand(0.57, 0.70, 0.70, 0.79)));
    expect(lower.top - upper.top).toBeCloseTo(145, -1);
  });
  it('does not guess from a single phone-holding hand', () => {
    expect(() => placeAntiFraudMessage(1086, 1448, { hands: [observation().hands[0]!], phones: [] }))
      .toThrow('no phone could be verified');
  });
  it('rejects low-confidence landmarks and overlapping hands', () => {
    const uncertain = observation();
    uncertain.hands[1]!.points.forEach((p) => { p.confidence = 0.1; });
    expect(() => placeAntiFraudMessage(1086, 1448, uncertain)).toThrow('uncertain');
    expect(() => placeAntiFraudMessage(1086, 1448, observation(hand(0.37, 0.60, 0.46, 0.69))))
      .toThrow('distinguished');
  });
  it('rejects edge layouts instead of putting the message back above the palm', () => {
    expect(() => placeAntiFraudMessage(1086, 1448, observation(hand(0.79, 0.7, 0.94, 0.8))))
      .toThrow('insufficient space');
    expect(() => placeAntiFraudMessage(1086, 1448, observation(hand(0.57, 0.8, 0.70, 0.92))))
      .toThrow('insufficient space');
  });
  it.each([[1086, 1448], [1024, 1024], [1536, 864]])('recovers a right-shifted palm without shrinking the message for %sx%s', (w, h) => {
    const scene = observation(hand(0.70, 0.60, 0.82, 0.69));
    const p = placeAntiFraudMessage(w, h, scene);
    expect({ width: p.width, height: p.height }).toEqual(antiFraudMessageSize(w, h));
    expect((p.left + p.width / 2) / w).toBeGreaterThanOrEqual(0.78);
    expect(p.top / h).toBeGreaterThanOrEqual(p.rejectingHand.bottom + 0.02);
    expect((p.left + p.width) / w).toBeLessThanOrEqual(0.98);
  });
  it('searches around a phone instead of rejecting the first candidate', () => {
    const scene = observation();
    scene.phones = [{ left: 0.65, top: 0.72, right: 0.7, bottom: 0.86 }];
    const p = placeAntiFraudMessage(1086, 1448, scene);
    const overhang = Math.round(Math.round(p.height * 0.28) * 0.22);
    expect((p.left - overhang) / 1086).toBeGreaterThanOrEqual(0.7);
  });
  it('includes the red badge and rejects a genuinely blocked safe region', () => {
    const scene = observation();
    scene.phones = [{ left: 0.5, top: 0.72, right: 0.99, bottom: 0.99 }];
    expect(() => placeAntiFraudMessage(1086, 1448, scene)).toThrow('overlap');
  });

  it('uses a small downward adjustment when the initial horizontal strip is blocked', () => {
    const scene = observation();
    scene.phones = [{ left: 0.5, top: 0.72, right: 0.99, bottom: 0.74 }];
    const p = placeAntiFraudMessage(1086, 1448, scene);
    expect(p.top / 1448).toBeGreaterThan(0.74);
    expect(p.top / 1448).toBeLessThan(p.rejectingHand.bottom + 0.061);
  });

  it.each([[1086, 1448], [1024, 1024], [1536, 864]])('preserves clearance, size and direction throughout the search region for %sx%s', (w, h) => {
    for (const x of [0.60, 0.70, 0.74, 0.76, 0.80, 0.82]) {
      const scene = observation(hand(x - 0.05, 0.60, x + 0.05, 0.69));
      const p = placeAntiFraudMessage(w, h, scene);
      const badge = Math.round(p.height * 0.28);
      expect(p.top / h).toBeGreaterThanOrEqual(p.rejectingHand.bottom + 0.02);
      expect((p.left + p.width / 2) / w).toBeGreaterThanOrEqual(x + 0.02 - 1e-10);
      expect((p.left + p.width) / w).toBeLessThanOrEqual(0.98);
      expect((p.top + p.height + badge - Math.round(badge * 0.72)) / h).toBeLessThanOrEqual(0.98);
      expect({ width: p.width, height: p.height }).toEqual(antiFraudMessageSize(w, h));
    }
  });

  it('retries uncertain hands once and keeps the landmarks of the accepted image', async () => {
    const bytes = await sharp({ create: { width: 800, height: 1067, channels: 3, background: '#f6ead6' } }).png().toBuffer();
    const render = vi.fn(async (_prompt: string) => ({ bytes }));
    const detectHands = vi.fn().mockResolvedValueOnce({ hands: [], phones: [] }).mockResolvedValueOnce(observation());
    const result = await renderImageWithAntiFraudSafeZoneRetry('scene', render, { detectHands });
    expect(render).toHaveBeenCalledTimes(2);
    expect(render.mock.calls[1]![0]).toContain('CRITICAL HAND-RELATIVE LAYOUT');
    expect(result.handObservation).toEqual(observation());
  });

  it('accepts a verified phone when the holding hand is partly occluded', () => {
    const scene: PosterHandObservation = {
      hands: [hand(0.57, 0.60, 0.70, 0.69)],
      phones: [{ left: 0.24, top: 0.48, right: 0.39, bottom: 0.73 }],
    };
    const placement = placeAntiFraudMessage(1086, 1448, scene);
    expect(placement.rejectingHand.left).toBeGreaterThan(0.5);
  });

  it('does not infer an occluded phone hand without a verified phone', () => {
    expect(() => placeAntiFraudMessage(1086, 1448, {
      hands: [hand(0.57, 0.60, 0.70, 0.69)],
      phones: [],
    })).toThrow('no phone could be verified');
  });

  it('never delivers a guessed placement after the bounded retry', async () => {
    const bytes = await sharp({ create: { width: 800, height: 1067, channels: 3, background: '#f6ead6' } }).png().toBuffer();
    const render = vi.fn(async (_prompt: string) => ({ bytes }));
    await expect(renderImageWithAntiFraudSafeZoneRetry('scene', render, {
      detectHands: async () => ({ hands: [], phones: [] }),
    })).rejects.toThrow('exactly two');
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('preserves the selected base before reporting an exhausted layout retry', async () => {
    const bytes = await sharp({ create: { width: 800, height: 1067, channels: 3, background: '#f6ead6' } }).png().toBuffer();
    const preserveLayoutDraft = vi.fn(async (_bytes: Buffer) => {});
    await expect(renderImageWithAntiFraudSafeZoneRetry('scene', async () => ({ bytes }), {
      detectHands: async () => observation(hand(0.79, 0.70, 0.94, 0.80)),
      preserveLayoutDraft,
    })).rejects.toThrow('insufficient space');
    expect(preserveLayoutDraft).toHaveBeenCalledTimes(1);
    expect(preserveLayoutDraft.mock.calls[0]?.[0]).toEqual(bytes);
  });

  it('retains the layout-error classification if saving the draft fails', async () => {
    const bytes = await sharp({ create: { width: 800, height: 1067, channels: 3, background: '#f6ead6' } }).png().toBuffer();
    const result = renderImageWithAntiFraudSafeZoneRetry('scene', async () => ({ bytes }), {
      detectHands: async () => ({ hands: [], phones: [] }),
      preserveLayoutDraft: async () => { throw new Error('disk full'); },
    });
    await expect(result).rejects.toBeInstanceOf(PosterHandLayoutError);
    await expect(result).rejects.toThrow('could not preserve the layout draft');
  });

  it('composites below the hand and leaves all pixels above the clearance untouched', async () => {
    const bytes = await sharp({ create: { width: 800, height: 1067, channels: 3, background: '#365943' } }).png().toBuffer();
    const output = await finalizeGeneratedPng(bytes, {
      loanPosterOutput: false,
      posterTextAnchor: 'right',
      posterHeadline: 'Prevent Fraud', posterSubtitle: 'Trust Only Official Customer Service',
      posterCopyStyle: 'anti-fraud-message', posterHandObservation: observation(),
    });
    const before = await sharp(bytes).extract({ left: 0, top: 0, width: 800, height: 765 }).removeAlpha().raw().toBuffer();
    const after = await sharp(output).extract({ left: 0, top: 0, width: 800, height: 765 }).removeAlpha().raw().toBuffer();
    expect(after.equals(before)).toBe(true);
    const placement = placeAntiFraudMessage(800, 1067, observation());
    const pixel = await sharp(output).extract({ left: placement.left + 20, top: placement.top + 5, width: 1, height: 1 }).removeAlpha().raw().toBuffer();
    expect(pixel[0]).toBeGreaterThan(180);
    expect((await sharp(output).removeAlpha().raw().toBuffer()).equals(await sharp(bytes).removeAlpha().raw().toBuffer())).toBe(false);
  });

  it.each([[800, 1067], [800, 800], [960, 540]])('keeps every transformed pixel inside the checked envelope for %sx%s', async (width, height) => {
    const input = await sharp({ create: { width, height, channels: 3, background: '#365943' } }).png().toBuffer();
    const placement = placeAntiFraudMessage(width, height, observation());
    const badge = Math.round(placement.height * 0.28);
    const left = placement.left - Math.round(badge * 0.22);
    const right = placement.left + placement.width;
    const bottom = placement.top + placement.height + badge - Math.round(badge * 0.72);
    const output = await finalizeGeneratedPng(input, {
      loanPosterOutput: false, posterTextAnchor: 'right',
      posterHeadline: 'Prevent Fraud', posterSubtitle: 'Trust Only Official Customer Service',
      posterCopyStyle: 'anti-fraud-message', posterHandObservation: observation(),
    });
    const before = await sharp(input).removeAlpha().raw().toBuffer();
    const after = await sharp(output).removeAlpha().raw().toBuffer();
    let outsideChanges = 0;
    let insideChanges = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      if (before[i] === after[i] && before[i + 1] === after[i + 1] && before[i + 2] === after[i + 2]) continue;
      if (x < left || x >= right || y < placement.top || y >= bottom) outsideChanges++;
      else insideChanges++;
    }
    expect(outsideChanges).toBe(0);
    expect(insideChanges).toBeGreaterThan(placement.width * placement.height * 0.7);
    // The upper-right corner recedes; it must reveal the original scene, not a backplate.
    const corner = (placement.top * width + right - 1) * 3;
    expect(after.subarray(corner, corner + 3)).toEqual(before.subarray(corner, corner + 3));
  });
});
