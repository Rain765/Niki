import { ANTI_FRAUD_OPEN_PALM_RULE } from '@open-design/contracts';

/** Normalized top-left image coordinates, independent of output resolution. */
export interface PosterPoint { x: number; y: number; confidence: number }
export interface PosterHand { points: PosterPoint[]; wrist?: PosterPoint }
export interface PosterArm { shoulder: PosterPoint; elbow: PosterPoint; wrist: PosterPoint }
export interface PosterBody { arms: PosterArm[] }
export interface PosterBox { left: number; top: number; right: number; bottom: number }
export interface PosterHandObservation { hands: PosterHand[]; phones: PosterBox[]; bodies?: PosterBody[] }
export interface AntiFraudMessagePlacement {
  left: number;
  top: number;
  width: number;
  height: number;
  rejectingHand: PosterBox;
}

export class PosterHandLayoutError extends Error {
  constructor(message: string, readonly recoverable = true) {
    super(`Anti-fraud hand layout: ${message}`);
    this.name = 'PosterHandLayoutError';
  }
}

/** A usable pose whose message cannot fit, distinct from missing/invalid limbs. */
export class PosterMessagePlacementError extends PosterHandLayoutError {}

export const ANTI_FRAUD_MESSAGE_SPACE_RETRY = `MESSAGE SPACE RECOVERY: ${ANTI_FRAUD_OPEN_PALM_RULE} Preserve the person, phone, exact copy, colors and background. Move the whole rejecting arm slightly upward and inward only as needed to leave space below-right. Keep a comfortable wrist and finger angle; do not add a hand or draw a message or placeholder.`;

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

/** Keep the message below-right without covering hands or phones. Prefer the
 * original layout, then reduce decorative gutters and card whitespace only.
 * Text size is canvas-derived in the compositor and never shrinks to fit.
 */
export function placeAntiFraudMessage(
  width: number,
  height: number,
  observation: PosterHandObservation,
): AntiFraudMessagePlacement {
  if (!(width > 0 && height > 0) || !Number.isFinite(width) || !Number.isFinite(height)) {
    throw new PosterHandLayoutError('invalid image dimensions');
  }
  if (observation.hands.length < 1 || observation.hands.length > 2) {
    throw new PosterHandLayoutError('exactly two clearly visible hands are required');
  }
  const hands = observation.hands.map(handBounds).sort((a, b) => a.left + a.right - b.left - b.right);
  const phone = [...observation.phones].sort((a, b) => a.left + a.right - b.left - b.right)[0];
  if (hands.length === 1 && !phone) {
    throw new PosterHandLayoutError('the phone-holding hand is occluded and no phone could be verified');
  }
  const phoneHand = hands.length === 2 ? hands[0]! : phone!;
  const hand = hands[hands.length - 1]!;
  const center = (hand.left + hand.right) / 2;
  if (center < 0.55 || center - (phoneHand.left + phoneHand.right) / 2 < 0.10) {
    throw new PosterHandLayoutError('the outward rejecting hand cannot be distinguished from the phone hand');
  }
  const size = antiFraudMessageSize(width, height);
  const obstacles = [...hands, ...observation.phones];
  for (const variant of [
    { height: size.height, gap: 0.02, edge: 0.02, centerOffset: 0.02 },
    { height: size.height, gap: 0.004, edge: 0.008, centerOffset: 0 },
    { height: Math.round(size.height * 0.9), gap: 0.004, edge: 0.008, centerOffset: 0 },
    { height: Math.round(size.height * 0.8), gap: 0.004, edge: 0.008, centerOffset: 0 },
  ]) {
    const placement = searchMessagePlacement(width, height, hand, obstacles,
      { width: size.width, height: variant.height }, variant);
    if (placement) return placement;
  }
  throw new PosterMessagePlacementError('insufficient space below-right of the palm without overlap; local spacing recovery exhausted');
}

function searchMessagePlacement(
  width: number, height: number, hand: PosterBox, obstacles: PosterBox[],
  size: { width: number; height: number },
  policy: { gap: number; edge: number; centerOffset: number },
): AntiFraudMessagePlacement | undefined {
  const center = (hand.left + hand.right) / 2;
  const badgeSize = Math.round(size.height * 0.28);
  const badgeOverhangX = Math.round(badgeSize * 0.22);
  const badgeOverhangY = badgeSize - Math.round(badgeSize * 0.72);
  const preferredLeft = Math.ceil((center + 0.02) * width) + badgeOverhangX;
  const minLeft = Math.max(
    Math.ceil(policy.edge * width) + badgeOverhangX,
    Math.ceil((center + policy.centerOffset) * width - size.width / 2),
  );
  const maxLeft = Math.floor((1 - policy.edge) * width) - size.width;
  const minTop = Math.ceil(hand.bottom * height) + Math.max(2, Math.ceil(policy.gap * height));
  // Stay near the gesture rather than drifting to the bottom of the poster.
  const maxTop = Math.min(Math.floor((1 - policy.edge) * height) - size.height - badgeOverhangY,
    minTop + Math.floor(0.04 * height));
  if (minLeft > maxLeft || minTop > maxTop) {
    return undefined;
  }
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
  if (!best) return undefined;
  return { left: best.left, top: best.top, ...size, rejectingHand: hand };
}

export const ANTI_FRAUD_HAND_RETRY = `CRITICAL HAND-RELATIVE LAYOUT: ${ANTI_FRAUD_OPEN_PALM_RULE} Preserve the phone, copy, brand-safe area and scene. Correct only the hand/arm issue while allowing a simpler natural refusal gesture.`;

/** Last bounded recovery changes only the pose, not brand, copy or design. */
export const ANTI_FRAUD_SIMPLE_POSE_RECOVERY = `SIMPLIFIED POSE RECOVERY: ${ANTI_FRAUD_OPEN_PALM_RULE} Simplify arm overlap and wrist tension; allow natural palm and finger-angle variation. If any arm joint is cropped or hidden, widen the camera framing enough to show both complete shoulder-elbow-wrist chains inside the image, with a small margin below and beside both elbows. Do not repeat a close crop that cuts off an elbow. Keep the phone readable and preserve the person, copy size, palette and background.`;
