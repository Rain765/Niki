import { PosterHandLayoutError, type PosterHandObservation, type PosterPoint, type PosterBox } from './poster-hand-layout.js';

const reliable = (p: PosterPoint | undefined): p is PosterPoint => Boolean(p && p.confidence >= .3);
const near = (a: PosterPoint, b: PosterPoint) => Math.hypot(a.x - b.x, a.y - b.y) <= .065;
const inPhone = (p: PosterPoint, phones: PosterBox[]) => phones.some(b =>
  p.x >= b.left - .045 && p.x <= b.right + .045 && p.y >= b.top - .045 && p.y <= b.bottom + .045);

/** Insufficient landmark evidence is eligible for a local second view; it is
 * not a finding of deformed anatomy and must not immediately buy another image. */
export class PosterArmUncertainError extends PosterHandLayoutError {}

function crosses(a: PosterPoint, b: PosterPoint, c: PosterPoint, d: PosterPoint) {
  const side = (p: PosterPoint, q: PosterPoint, r: PosterPoint) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return side(a, b, c) * side(a, b, d) < -1e-8 && side(c, d, a) * side(c, d, b) < -1e-8;
}

/** Hand counts are not an anatomy check. Require independent body-pose evidence
 * connecting each hand to a separate shoulder/elbow chain on the single model.
 * Ambiguous connections get a local second view before a bounded image retry;
 * this is a conservative pose check, not a guarantee against all generated limbs.
 */
export function assertPosterArmIntegrity(observation: PosterHandObservation, corroboratingView?: PosterHandObservation): void {
  if (observation.bodies?.length !== 1 || observation.bodies[0]!.arms.length !== 2) {
    if (!observation.bodies?.length) throw new PosterArmUncertainError('one body with two traceable arms is required');
    throw new PosterHandLayoutError('one body with two traceable arms is required');
  }
  if (observation.hands.length < 1 || observation.hands.length > 2) {
    if (!observation.hands.length) throw new PosterArmUncertainError('hand observations are uncertain');
    throw new PosterHandLayoutError('only two hands belonging to one person are allowed');
  }
  const arms = [...observation.bodies[0]!.arms].sort((a, b) => a.shoulder.x - b.shoulder.x);
  const priorArms = corroboratingView?.bodies?.length === 1
    ? [...corroboratingView.bodies[0]!.arms].sort((a, b) => a.shoulder.x - b.shoulder.x) : [];
  // A moderately weak shoulder/elbow can be supported by an independent crop
  // locating the same joint. Never synthesize confidence, relax wrist matching,
  // or accept a near-absent joint (the previous extra-arm regression was < .13).
  const supportedJoint = (p: PosterPoint, prior: PosterPoint | undefined) => p.confidence >= .3
    || Boolean(prior && p.confidence >= .2 && prior.confidence >= .2
      && Math.hypot(p.x - prior.x, p.y - prior.y) <= .04);
  const available = new Set(observation.hands);
  const chains: PosterPoint[][] = [];
  for (const [index, arm] of arms.entries()) {
    if (!supportedJoint(arm.shoulder, priorArms[index]?.shoulder)
      || !supportedJoint(arm.elbow, priorArms[index]?.elbow)) {
      throw new PosterArmUncertainError('arm connection is uncertain at the shoulder or elbow');
    }
    let wrist = arm.wrist;
    let match = [...available].find(h => reliable(h.wrist) && reliable(wrist) && near(h.wrist, wrist));
    // Phone-side hand pose is frequently occluded by the device. Keep that
    // recovery only with independent phone evidence, never for the pushing arm.
    if (!match && index === 0 && !reliable(wrist)) {
      match = [...available].find(h => reliable(h.wrist) && inPhone(h.wrist, observation.phones));
      if (match) wrist = match.wrist!;
    }
    if (!reliable(wrist) || (!match && !(index === 0 && inPhone(wrist, observation.phones)))) {
      throw new PosterArmUncertainError('arm connection is uncertain or does not match the visible hand');
    }
    if (match) available.delete(match);
    chains.push([arm.shoulder, arm.elbow, wrist]);
  }
  if (available.size) throw new PosterHandLayoutError('visible hands do not match the two body arm connections');
  const [a, b] = chains;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    if (crosses(a![i]!, a![i + 1]!, b![j]!, b![j + 1]!)) {
      throw new PosterHandLayoutError('crossed or folded arms cannot be verified; keep both arms separate');
    }
  }
}
