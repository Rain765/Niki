/** Normalized top-left image coordinates, independent of output resolution. */
export interface PosterPoint { x: number; y: number; confidence: number }
export interface PosterHand { points: PosterPoint[] }
export interface PosterBox { left: number; top: number; right: number; bottom: number }
export interface PosterHandObservation { hands: PosterHand[]; phones: PosterBox[] }
export interface AntiFraudMessagePlacement {
  left: number;
  top: number;
  width: number;
  height: number;
  rejectingHand: PosterBox;
}

export class PosterHandLayoutError extends Error {
  constructor(message: string) {
    super(`Anti-fraud hand layout: ${message}`);
    this.name = 'PosterHandLayoutError';
  }
}

export function antiFraudMessageSize(width: number, height: number) {
  const aspect = width / height;
  return {
    width: Math.round(width * (aspect >= 1.5 ? 0.18 : aspect >= 0.9 ? 0.24 : 0.22)),
    height: Math.round(height * (aspect >= 1.5 ? 0.18 : aspect >= 0.9 ? 0.15 : 0.105)),
  };
}

function handBounds(hand: PosterHand): PosterBox {
  const points = hand.points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)
    && p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1 && p.confidence >= 0.3);
  if (points.length < 15) throw new PosterHandLayoutError('hand landmarks are uncertain; regenerate with both hands fully visible');
  const box = {
    left: Math.min(...points.map((p) => p.x)) - 0.012,
    right: Math.max(...points.map((p) => p.x)) + 0.012,
    top: Math.min(...points.map((p) => p.y)) - 0.012,
    bottom: Math.max(...points.map((p) => p.y)) + 0.012,
  };
  if (box.right - box.left < 0.035 || box.bottom - box.top < 0.025) {
    throw new PosterHandLayoutError('hand landmarks are too small to place a readable message safely');
  }
  return box;
}

function overlaps(a: PosterBox, b: PosterBox): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Keep the full-size card below the hand, with its center to the right of the palm.
 * Search rectangle boundaries for the nearest safe position; never move above
 * the hand or shrink readable copy merely to make a candidate fit.
 */
export function placeAntiFraudMessage(
  width: number,
  height: number,
  observation: PosterHandObservation,
): AntiFraudMessagePlacement {
  if (!(width > 0 && height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new PosterHandLayoutError('invalid image dimensions');
  }
  if (observation.hands.length !== 2) {
    throw new PosterHandLayoutError('exactly two clearly visible hands are required');
  }
  const hands = observation.hands.map(handBounds).sort((a, b) => a.left + a.right - b.left - b.right);
  const phoneHand = hands[0]!;
  const hand = hands[1]!;
  const center = (hand.left + hand.right) / 2;
  if (center < 0.55 || center - (phoneHand.left + phoneHand.right) / 2 < 0.10) {
    throw new PosterHandLayoutError('the outward rejecting hand cannot be distinguished from the phone hand');
  }
  const size = antiFraudMessageSize(width, height);
  const badgeSize = Math.round(size.height * 0.28);
  const badgeOverhangX = Math.round(badgeSize * 0.22);
  const badgeOverhangY = badgeSize - Math.round(badgeSize * 0.72);
  const preferredLeft = Math.ceil((center + 0.02) * width) + badgeOverhangX;
  const minLeft = Math.max(
    Math.ceil(0.02 * width) + badgeOverhangX,
    Math.ceil((center + 0.02) * width - size.width / 2),
  );
  const maxLeft = Math.floor(0.98 * width) - size.width;
  const minTop = Math.ceil((hand.bottom + 0.02) * height);
  // Stay near the gesture rather than drifting to the bottom of the poster.
  const maxTop = Math.min(Math.floor(0.98 * height) - size.height - badgeOverhangY,
    minTop + Math.floor(0.04 * height));
  if (minLeft > maxLeft || minTop > maxTop) {
    throw new PosterHandLayoutError('insufficient space below-right of the palm; move the rejecting hand upward and inward');
  }
  const obstacles = [...hands, ...observation.phones];
  // Any closest feasible position either keeps a preferred coordinate or touches
  // a canvas/obstacle boundary. Include the badge in every candidate's footprint.
  const xs = new Set([Math.min(preferredLeft, maxLeft), minLeft, maxLeft]);
  const ys = new Set([minTop, maxTop]);
  for (const obstacle of obstacles) {
    xs.add(Math.ceil(obstacle.right * width) + badgeOverhangX + 1);
    xs.add(Math.floor(obstacle.left * width) - size.width - 1);
    ys.add(Math.ceil(obstacle.bottom * height) + 1);
    ys.add(Math.floor(obstacle.top * height) - size.height - badgeOverhangY - 1);
  }
  let best: { left: number; top: number; score: number } | undefined;
  for (const left of xs) {
    for (const top of ys) {
      if (left < minLeft || left > maxLeft || top < minTop || top > maxTop) continue;
      const box = {
        left: (left - badgeOverhangX) / width, top: top / height,
        right: (left + size.width) / width,
        bottom: (top + size.height + badgeOverhangY) / height,
      };
      if (obstacles.some((obstacle) => overlaps(box, obstacle))) continue;
      const score = ((left - preferredLeft) / width) ** 2 + ((top - minTop) / height) ** 2;
      if (!best || score < best.score) best = { left, top, score };
    }
  }
  if (!best) throw new PosterHandLayoutError('message or red badge would overlap a hand or phone throughout the safe region');
  return { left: best.left, top: best.top, ...size, rejectingHand: hand };
}

export const ANTI_FRAUD_HAND_RETRY = 'CRITICAL HAND-RELATIVE LAYOUT: show exactly one person with both complete hands clearly visible. Keep the phone and its holding hand on the inner-left side. Move the rejecting palm center to x=62% to 66%, with its lowest fingertip or wrist above y=70%. Turn this palm sideways and sweep toward the right and slightly downward in the image plane, never reaching forward toward the camera. Keep generous continuous background immediately below-right of the entire hand through x=97%, y=97%. This space must remain visually indistinguishable from the surrounding natural scene. Preserve the complete phone, title, subtitle and logo-safe area.';
