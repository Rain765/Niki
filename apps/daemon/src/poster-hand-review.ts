import sharp from 'sharp';
import { assertPosterArmIntegrity, PosterArmUncertainError } from './poster-arm-integrity.js';
import { PosterHandLayoutError, type PosterBox, type PosterHandObservation, type PosterPoint } from './poster-hand-layout.js';

/** A second view changes only the detector input, never the delivered bitmap.
 * Keep every observed hand and arm in view, including low-confidence elbows;
 * a crop must not erase evidence of an extra limb. */
export function posterPersonReviewRegion(observation: PosterHandObservation): PosterBox {
  const points = [
    ...observation.hands.flatMap(h => h.points),
    ...(observation.bodies ?? []).flatMap(b => b.arms.flatMap(a => [a.shoulder, a.elbow, a.wrist])),
  ].filter(p => p.confidence >= .1);
  if (!points.length) return { left: 0, top: 0, right: 1, bottom: 1 };
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  return {
    left: Math.max(0, Math.min(...xs) - .12), right: Math.min(1, Math.max(...xs) + .12),
    top: Math.max(0, Math.min(...ys) - .25), bottom: Math.min(1, Math.max(...ys) + .12),
  };
}

export function mapPosterReviewObservation(observation: PosterHandObservation, region: PosterBox): PosterHandObservation {
  const sx = region.right - region.left;
  const sy = region.bottom - region.top;
  const point = (p: PosterPoint): PosterPoint => ({ ...p, x: region.left + p.x * sx, y: region.top + p.y * sy });
  return {
    hands: observation.hands.map(h => ({ points: h.points.map(point), ...(h.wrist ? { wrist: point(h.wrist) } : {}) })),
    ...(observation.bodies ? { bodies: observation.bodies.map(b => ({ arms: b.arms.map(a => ({ shoulder: point(a.shoulder), elbow: point(a.elbow), wrist: point(a.wrist) })) })) } : {}),
    phones: observation.phones.map(b => ({ left: region.left + b.left * sx, right: region.left + b.right * sx,
      top: region.top + b.top * sy, bottom: region.top + b.bottom * sy })),
  };
}

/** One local recheck for ambiguous evidence. Clear extra limbs never enter the
 * recheck path. Wrist/hand matching must pass in the second observation; weaker
 * shoulder/elbow evidence requires agreement between both views. No provider
 * request is made here. */
export async function reviewPosterHands(input: Buffer, observe: (bytes: Buffer) => Promise<PosterHandObservation>, onRecheck?: () => void): Promise<PosterHandObservation> {
  const original = await observe(input);
  try {
    assertPosterArmIntegrity(original);
    return original;
  } catch (error) {
    if (!(error instanceof PosterArmUncertainError)) throw error;
  }
  onRecheck?.();
  const region = posterPersonReviewRegion(original);
  const metadata = await sharp(input).metadata();
  const width = metadata.width!;
  const height = metadata.height!;
  const left = Math.floor(region.left * width);
  const top = Math.floor(region.top * height);
  const right = Math.ceil(region.right * width);
  const bottom = Math.ceil(region.bottom * height);
  const crop = await sharp(input).extract({ left, top, width: right - left, height: bottom - top })
    .resize({ width: 1600, height: 1600, fit: 'inside' }).png().toBuffer();
  const rechecked = mapPosterReviewObservation(await observe(crop), {
    left: left / width, top: top / height, right: right / width, bottom: bottom / height,
  });
  if (rechecked.hands.length < original.hands.length) {
    throw new PosterArmUncertainError('local recheck lost a previously observed hand');
  }
  assertPosterArmIntegrity(rechecked, original);
  // Do not accept a crop that turns multiple bodies/hands into a single model.
  if ((original.bodies?.length ?? 0) > 1 || original.hands.length > 2) {
    throw new PosterHandLayoutError('extra bodies or hands cannot be removed by a local recheck');
  }
  return rechecked;
}
