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

/** Never clamp a message back over the hand: recompose when the requested gap cannot fit. */
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
  const left = Math.ceil((center + 0.02) * width) + badgeOverhangX;
  const top = Math.ceil((hand.bottom + 0.02) * height);
  const box = {
    left: (left - badgeOverhangX) / width,
    top: top / height,
    right: (left + size.width) / width,
    bottom: (top + size.height + badgeOverhangY) / height,
  };
  if (box.right > 0.98 || box.bottom > 0.98) {
    throw new PosterHandLayoutError('insufficient space below-right of the palm; move the rejecting hand upward and inward');
  }
  if ([...hands, ...observation.phones].some((obstacle) => overlaps(box, obstacle))) {
    throw new PosterHandLayoutError('message or red badge would overlap a hand or phone');
  }
  return { left, top, ...size, rejectingHand: hand };
}

export const ANTI_FRAUD_HAND_RETRY = 'CRITICAL HAND-RELATIVE LAYOUT: show exactly one person with both complete hands clearly visible. Keep the phone and its holding hand on the inner-left side. Move the rejecting palm center to x=62% to 66%, with its lowest fingertip or wrist above y=70%. Rotate the palm outward toward the viewer into a three-quarter view, showing one-half to two-thirds of the palm surface with visible palm creases and the thumb pad. Rotate the wrist in place without enlarging the hand or moving it farther outward. Keep every fingertip and the wrist inside x=56% to 72%, y=55% to 70% of the canvas. Keep the wrist relaxed and the fingers naturally together with a slight soft bend, and push with the broad palm surface toward the right and slightly downward. Avoid an edge-on hand, knife-hand silhouette, chopping or slicing motion, and rigid straight fingers. Keep the elbow bent and the motion in the image plane, never reaching forward or making an upright stop gesture toward the camera. Keep generous continuous background immediately below-right of the entire hand through x=97%, y=97%. This space must remain visually indistinguishable from the surrounding natural scene. Preserve the complete phone, title, subtitle and logo-safe area.';
