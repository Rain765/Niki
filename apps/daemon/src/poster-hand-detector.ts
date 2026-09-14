import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { PosterHandLayoutError, type PosterHandObservation } from './poster-hand-layout.js';
import { assertPosterArmIntegrity } from './poster-arm-integrity.js';

const execFile = promisify(execFileCallback);
export type PosterHandDetector = (input: Buffer) => Promise<PosterHandObservation>;

// TypeScript owns the bridge; this generated native helper only exposes Apple's
// local Vision landmarks. Images never leave the machine. Other hosts can supply
// the same JSON protocol using OD_POSTER_HAND_DETECTOR (executable, not a shell).
// The protocol requires hands[].wrist and bodies[].arms (shoulder/elbow/wrist),
// each point {x,y,confidence} in normalized top-left coordinates. Count-only
// custom detectors must be upgraded; missing body evidence is not accepted.
const VISION_BRIDGE = String.raw`
import Foundation
import Vision
let handler = VNImageRequestHandler(url: URL(fileURLWithPath: CommandLine.arguments[1]))
let hands = VNDetectHumanHandPoseRequest()
hands.maximumHandCount = 3
let bodies = VNDetectHumanBodyPoseRequest()
let rectangles = VNDetectRectanglesRequest()
rectangles.maximumObservations = 20
rectangles.minimumSize = 0.05
rectangles.minimumConfidence = 0.6
rectangles.minimumAspectRatio = 0.2
rectangles.maximumAspectRatio = 0.85
let text = VNRecognizeTextRequest()
text.recognitionLevel = .accurate
text.recognitionLanguages = ["en-US"]
try handler.perform([hands, bodies, rectangles, text])
let domains = (text.results ?? []).filter {
  ($0.topCandidates(1).first?.string.lowercased() ?? "").contains(".com")
}
let phones = domains.map { domain -> [String: Double] in
  let center = CGPoint(x: domain.boundingBox.midX, y: domain.boundingBox.midY)
  let matchingRectangle = (rectangles.results ?? []).filter { rect in
    let expanded = rect.boundingBox.insetBy(dx: -0.015, dy: -0.015)
    return expanded.contains(center)
  }.min { a, b in
    a.boundingBox.width * a.boundingBox.height < b.boundingBox.width * b.boundingBox.height
  }
  // Rounded or partly covered phones are not always returned by Vision's
  // rectangle detector. The recognised on-screen domain is still strong local
  // evidence of a phone, so retain a conservative obstacle around it.
  let b = matchingRectangle?.boundingBox ?? domain.boundingBox.insetBy(
    dx: -max(0.045, domain.boundingBox.width * 0.75),
    dy: -max(0.10, domain.boundingBox.height * 2.5)
  ).intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
  return ["left": b.minX, "top": 1-b.maxY, "right": b.maxX, "bottom": 1-b.minY]
}
let result: [String: Any] = [
  "hands": try (hands.results ?? []).map { hand -> [String: Any] in
    let points = try hand.recognizedPoints(.all).values.map { point in
      ["x": Double(point.location.x), "y": 1-Double(point.location.y), "confidence": Double(point.confidence)]
    }
    let wrist = try hand.recognizedPoint(.wrist)
    return ["points": points, "wrist": ["x": Double(wrist.location.x), "y": 1-Double(wrist.location.y), "confidence": Double(wrist.confidence)]]
  },
  "bodies": try (bodies.results ?? []).map { body -> [String: Any] in
    let joints: [[VNHumanBodyPoseObservation.JointName]] = [
      [.leftShoulder, .leftElbow, .leftWrist], [.rightShoulder, .rightElbow, .rightWrist]
    ]
    let arms = try joints.map { names -> [String: Any] in
      let points = try names.map { name -> [String: Double] in
        let p = try body.recognizedPoint(name)
        return ["x": Double(p.location.x), "y": 1-Double(p.location.y), "confidence": Double(p.confidence)]
      }
      return ["shoulder": points[0], "elbow": points[1], "wrist": points[2]]
    }
    return ["arms": arms]
  },
  "phones": phones
]
let json = try JSONSerialization.data(withJSONObject: result)
FileHandle.standardOutput.write(json)
`;

let prepared: Promise<string> | undefined;
async function prepareNativeDetector(): Promise<string> {
  if (process.platform !== 'darwin') {
    throw new PosterHandLayoutError('local detector unavailable; configure OD_POSTER_HAND_DETECTOR before generating anti-fraud posters');
  }
  const directory = await mkdtemp(path.join(tmpdir(), 'od-poster-vision-'));
  const source = path.join(directory, 'detect.swift');
  const binary = path.join(directory, 'detect');
  try {
    await writeFile(source, VISION_BRIDGE, { mode: 0o600 });
    await execFile('/usr/bin/xcrun', ['swiftc', source, '-O', '-o', binary], {
      timeout: 120_000, maxBuffer: 1024 * 1024,
    });
    return binary;
  } catch {
    await rm(directory, { recursive: true, force: true });
    throw new PosterHandLayoutError('local Vision detector could not start; verify macOS command-line tools before generating');
  }
}

function parseObservation(raw: string): PosterHandObservation {
  const value = JSON.parse(raw) as PosterHandObservation;
  const point = (p: unknown) => {
    if (!p || typeof p !== 'object') return false;
    const q = p as Record<string, unknown>;
    return [q.x, q.y, q.confidence].every(n => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1);
  };
  if (!value || !Array.isArray(value.hands) || value.hands.length > 3
    || !value.hands.every((h) => h && point(h.wrist) && Array.isArray(h.points) && h.points.length <= 30
      && h.points.every((p) => p && [p.x, p.y, p.confidence].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)))
    || !Array.isArray(value.bodies) || value.bodies.length > 10
    || !value.bodies.every(b => b && Array.isArray(b.arms) && b.arms.length === 2
      && b.arms.every(a => a && point(a.shoulder) && point(a.elbow) && point(a.wrist)))
    || !Array.isArray(value.phones) || value.phones.length > 30
    || !value.phones.every((b) => [b.left, b.top, b.right, b.bottom].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)
      && b.left < b.right && b.top < b.bottom)) {
    throw new PosterHandLayoutError('detector returned invalid landmarks; hand wrists and body arm chains are required', false);
  }
  return value;
}

/** Preflight before any paid render. The detector reads one PNG path and emits JSON. */
export async function createPosterHandDetector(): Promise<PosterHandDetector> {
  const configured = process.env.OD_POSTER_HAND_DETECTOR?.trim();
  if (configured && !path.isAbsolute(configured)) {
    throw new PosterHandLayoutError('OD_POSTER_HAND_DETECTOR must be an absolute executable path');
  }
  const binary = configured || await (prepared ??= prepareNativeDetector().catch((error) => {
    prepared = undefined;
    throw error;
  }));
  try {
    await access(binary, constants.X_OK);
  } catch {
    throw new PosterHandLayoutError('configured detector is not executable');
  }
  return async (input) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'od-poster-hand-input-'));
    try {
      const imagePath = path.join(directory, 'image.png');
      // Match the finalizer's pixel orientation; do not independently auto-rotate EXIF.
      await sharp(input).resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .png().toFile(imagePath);
      const { stdout } = await execFile(binary, [imagePath], { timeout: 30_000, maxBuffer: 128 * 1024 });
      const observation = parseObservation(stdout);
      assertPosterArmIntegrity(observation);
      return observation;
    } catch (error) {
      if (error instanceof PosterHandLayoutError) throw error;
      throw new PosterHandLayoutError('hand recognition failed or timed out; no message was composited', false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };
}
