import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import { renderImageWithAntiFraudSafeZoneRetry, finalizeGeneratedPng } from '../src/media.js';
import { ANTI_FRAUD_HAND_RETRY, placeAntiFraudMessage, type PosterHand, type PosterHandObservation } from '../src/poster-hand-layout.js';

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
  it('retries with a visible palm surface rather than an edge-on chopping hand', () => {
    expect(ANTI_FRAUD_HAND_RETRY).toContain('showing one-half to two-thirds of the palm surface');
    expect(ANTI_FRAUD_HAND_RETRY).toContain('push with the broad palm surface');
    expect(ANTI_FRAUD_HAND_RETRY).toContain('Rotate the wrist in place');
    expect(ANTI_FRAUD_HAND_RETRY).toContain('x=56% to 72%, y=55% to 70%');
    expect(ANTI_FRAUD_HAND_RETRY).not.toContain('Turn this palm sideways');
  });
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
      .toThrow('exactly two');
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
  it('includes the red badge when checking the phone exclusion box', () => {
    const scene = observation();
    scene.phones = [{ left: 0.65, top: 0.72, right: 0.7, bottom: 0.86 }];
    expect(() => placeAntiFraudMessage(1086, 1448, scene)).toThrow('overlap');
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

  it('never delivers a guessed placement after the bounded retry', async () => {
    const bytes = await sharp({ create: { width: 800, height: 1067, channels: 3, background: '#f6ead6' } }).png().toBuffer();
    const render = vi.fn(async (_prompt: string) => ({ bytes }));
    await expect(renderImageWithAntiFraudSafeZoneRetry('scene', render, {
      detectHands: async () => ({ hands: [], phones: [] }),
    })).rejects.toThrow('exactly two');
    expect(render).toHaveBeenCalledTimes(2);
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
});
