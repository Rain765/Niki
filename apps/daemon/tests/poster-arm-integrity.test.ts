import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { createPosterHandDetector } from '../src/poster-hand-detector.js';
import { assertPosterArmIntegrity, PosterArmUncertainError } from '../src/poster-arm-integrity.js';
import { reviewPosterHands, mapPosterReviewObservation, posterPersonReviewRegion } from '../src/poster-hand-review.js';
import type { PosterHandObservation, PosterPoint } from '../src/poster-hand-layout.js';

const point = (x: number, y: number, confidence = 0.8): PosterPoint => ({ x, y, confidence });
afterEach(() => vi.unstubAllEnvs());
function valid(): PosterHandObservation {
  const wrists = [point(.44, .72), point(.80, .78)];
  return {
    hands: wrists.map(wrist => ({ wrist, points: [wrist] })),
    phones: [{ left: .35, top: .53, right: .48, bottom: .72 }],
    bodies: [{ arms: [
      { shoulder: point(.52, .60), elbow: point(.46, .81), wrist: wrists[0]! },
      { shoulder: point(.81, .60), elbow: point(.90, .72), wrist: wrists[1]! },
    ] }],
  };
}

describe('anti-fraud arm integrity', () => {
  it('requires two consistent views before accepting a moderately weak elbow', () => {
    const first = valid();
    first.bodies![0]!.arms[1]!.elbow.confidence = .265;
    const second = structuredClone(first);
    second.bodies![0]!.arms[1]!.elbow.confidence = .279;
    second.bodies![0]!.arms[1]!.elbow.x += .01;
    expect(() => assertPosterArmIntegrity(second)).toThrow(PosterArmUncertainError);
    expect(() => assertPosterArmIntegrity(second, first)).not.toThrow();
    second.bodies![0]!.arms[1]!.elbow.x += .1;
    expect(() => assertPosterArmIntegrity(second, first)).toThrow(PosterArmUncertainError);
    second.bodies![0]!.arms[1]!.elbow = point(.90, .72, .12);
    expect(() => assertPosterArmIntegrity(second, first)).toThrow(PosterArmUncertainError);
  });
  it('keeps wrists strict even if both views repeat a mismatched connection', () => {
    const scene = valid();
    scene.bodies![0]!.arms[1]!.wrist = point(.70, .78);
    expect(() => assertPosterArmIntegrity(scene, structuredClone(scene))).toThrow(PosterArmUncertainError);
  });
  it('rechecks uncertain evidence once, maps it back, and never crops away a known third hand', async () => {
    const bytes = await sharp({ create: { width: 800, height: 1000, channels: 3, background: 'white' } }).png().toBuffer();
    const scene = valid();
    scene.bodies![0]!.arms[0]!.wrist = point(.44, .786);
    const region = posterPersonReviewRegion(scene);
    const rounded = { left: Math.floor(region.left * 800) / 800, right: Math.ceil(region.right * 800) / 800,
      top: Math.floor(region.top * 1000) / 1000, bottom: Math.ceil(region.bottom * 1000) / 1000 };
    const inverse = { left: -rounded.left / (rounded.right - rounded.left), top: -rounded.top / (rounded.bottom - rounded.top),
      right: (1 - rounded.left) / (rounded.right - rounded.left), bottom: (1 - rounded.top) / (rounded.bottom - rounded.top) };
    const observe = vi.fn().mockResolvedValueOnce(scene).mockResolvedValueOnce(mapPosterReviewObservation(valid(), inverse));
    const onRecheck = vi.fn();
    const accepted = await reviewPosterHands(bytes, observe, onRecheck);
    expect(observe).toHaveBeenCalledTimes(2);
    expect(onRecheck).toHaveBeenCalledOnce();
    expect(accepted.hands[1]!.wrist!.x).toBeCloseTo(.8);
    expect(accepted.phones[0]!.top).toBeCloseTo(.53);
    const extra = valid(); extra.hands.push(extra.hands[0]!);
    const bad = vi.fn().mockResolvedValue(extra);
    await expect(reviewPosterHands(bytes, bad)).rejects.toThrow(/hands/);
    expect(bad).toHaveBeenCalledOnce();
  });
  it('executes a real preflight and retries a process failure on the same image using CPU', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'poster-detector-recovery-'));
    try {
      const executable = path.join(directory, 'detector');
      const calls = path.join(directory, 'calls');
      await writeFile(executable, `#!/usr/bin/env node\nconst fs=require('fs');fs.appendFileSync(${JSON.stringify(calls)},process.argv.slice(2).join('|')+'\\n');if(process.argv[3]!=='cpu')process.exit(1);process.stdout.write(${JSON.stringify(JSON.stringify(valid()))});`, { mode: 0o700 });
      vi.stubEnv('OD_POSTER_HAND_DETECTOR', executable);
      const detector = await createPosterHandDetector();
      expect((await readFile(calls, 'utf8')).trim().split('\n')).toHaveLength(2);
      const bytes = await sharp({ create: { width: 32, height: 32, channels: 3, background: 'white' } }).png().toBuffer();
      await expect(detector(bytes)).resolves.toEqual(valid());
      const history = (await readFile(calls, 'utf8')).trim().split('\n');
      expect(history.at(-1)).toMatch(/\|cpu$/);
      expect(history).toHaveLength(3);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('does not loop or accept a local recheck that loses an observed hand', async () => {
    const bytes = await sharp({ create: { width: 800, height: 1000, channels: 3, background: 'white' } }).png().toBuffer();
    const uncertain = valid();
    uncertain.bodies![0]!.arms[1]!.wrist = point(.70, .78, .1);
    const stillUncertain = vi.fn().mockResolvedValue(uncertain);
    await expect(reviewPosterHands(bytes, stillUncertain)).rejects.toThrow(PosterArmUncertainError);
    expect(stillUncertain).toHaveBeenCalledTimes(2);
    const lost = valid(); lost.hands.pop();
    const losesHand = vi.fn().mockResolvedValueOnce(uncertain).mockResolvedValueOnce(lost);
    await expect(reviewPosterHands(bytes, losesHand)).rejects.toThrow('lost a previously observed hand');
    expect(losesHand).toHaveBeenCalledTimes(2);
  });
  it('accepts two separate shoulder-elbow-wrist chains matched to the hands', () => {
    expect(() => assertPosterArmIntegrity(valid())).not.toThrow();
  });
  it('rejects the low-confidence rejecting wrist seen in the three-hand regression', () => {
    const scene = valid();
    // Body-pose measurement from the reported crossed-arm poster. Hand pose
    // detects two palms, but body pose cannot resolve the rejecting wrist.
    scene.bodies![0]!.arms[1]!.wrist = point(.74273449, .82372808, .122802734);
    expect(() => assertPosterArmIntegrity(scene)).toThrow(/arm connection/);
  });
  it('does not treat a missing body result as proof of correct anatomy', () => {
    const scene = valid();
    delete scene.bodies;
    expect(() => assertPosterArmIntegrity(scene)).toThrow(/body/);
    scene.bodies = [];
    expect(() => assertPosterArmIntegrity(scene)).toThrow(/body/);
  });
  it('rejects extra bodies, extra hands and unmatched wrists', () => {
    const scene = valid();
    scene.bodies!.push(scene.bodies![0]!);
    expect(() => assertPosterArmIntegrity(scene)).toThrow(/body/);
    const extra = valid();
    extra.hands.push(extra.hands[0]!);
    expect(() => assertPosterArmIntegrity(extra)).toThrow(/hands/);
    const unmatched = valid();
    unmatched.hands[1]!.wrist = point(.62, .76);
    expect(() => assertPosterArmIntegrity(unmatched)).toThrow(/arm connection/);
  });
  it('rejects crossed forearms even when both wrists match', () => {
    const scene = valid();
    scene.bodies![0]!.arms[0]!.elbow = point(.85, .66);
    scene.bodies![0]!.arms[1]!.elbow = point(.4, .66);
    expect(() => assertPosterArmIntegrity(scene)).toThrow(/crossed/);
  });
  it.each(['valid', 'missing-body', 'uncertain-arm', 'malformed-body'])('enforces %s through the executable detector boundary', async mode => {
    const directory = await mkdtemp(path.join(tmpdir(), 'poster-arm-test-'));
    try {
      const scene = valid();
      if (mode === 'missing-body') delete scene.bodies;
      if (mode === 'uncertain-arm') scene.bodies![0]!.arms[1]!.wrist.confidence = .1;
      if (mode === 'malformed-body') scene.bodies = [null] as never;
      const executable = path.join(directory, 'detector');
      await writeFile(executable, `#!/usr/bin/env node\nprocess.stdout.write(${JSON.stringify(JSON.stringify(scene))});\n`, { mode: 0o700 });
      vi.stubEnv('OD_POSTER_HAND_DETECTOR', executable);
      if (mode === 'missing-body' || mode === 'malformed-body') {
        await expect(createPosterHandDetector()).rejects.toThrow(/Poster detector unavailable/);
        return;
      }
      const detector = await createPosterHandDetector();
      const bytes = await sharp({ create: { width: 32, height: 32, channels: 3, background: 'white' } }).png().toBuffer();
      if (mode === 'valid') await expect(detector(bytes)).resolves.toEqual(scene);
      else await expect(detector(bytes)).rejects.toThrow(/Anti-fraud hand layout/);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('retains the verified-phone fallback only for the phone-side wrist', () => {
    const scene = valid();
    scene.bodies![0]!.arms[0]!.wrist = point(.44, .72, .2);
    expect(() => assertPosterArmIntegrity(scene)).not.toThrow();
    scene.hands.shift();
    scene.bodies![0]!.arms[0]!.wrist = point(.44, .72);
    expect(() => assertPosterArmIntegrity(scene)).not.toThrow();
    scene.bodies![0]!.arms[0]!.wrist = point(.44, .72, .2);
    expect(() => assertPosterArmIntegrity(scene)).toThrow(/arm connection/);
  });
});
