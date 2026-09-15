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

/** Infrastructure failure is not evidence that the image has invalid anatomy. */
export class PosterDetectorUnavailableError extends Error {
  readonly code = 'poster_detector_unavailable';
  readonly status = 503;
  constructor(detail: string) {
    super(`Poster detector unavailable: ${detail}`);
    this.name = 'PosterDetectorUnavailableError';
  }
}

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
if CommandLine.arguments.count > 2 && CommandLine.arguments[2] == "cpu" {
  for request in [hands, bodies, rectangles, text] as [VNRequest] {
    request.usesCPUOnly = true
  }
}
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
    throw new PosterDetectorUnavailableError('configure OD_POSTER_HAND_DETECTOR on this host');
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
    throw new PosterDetectorUnavailableError('native compilation failed; verify macOS command-line tools');
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
    throw new PosterDetectorUnavailableError('invalid landmark protocol; hand wrists and body arm chains are required');
  }
  return value;
}

/** Preflight before any paid render. The detector reads one PNG path and emits JSON. */
export async function createPosterHandDetector(options: { signal?: AbortSignal | undefined; onProgress?: ((message: string) => void) | undefined } = {}): Promise<PosterHandDetector> {
  const configured = process.env.OD_POSTER_HAND_DETECTOR?.trim();
  if (configured && !path.isAbsolute(configured)) {
    throw new PosterDetectorUnavailableError('OD_POSTER_HAND_DETECTOR must be an absolute executable path');
  }
  const binary = configured || await (prepared ??= prepareNativeDetector().catch((error) => {
    prepared = undefined;
    throw error;
  }));
  try {
    await access(binary, constants.X_OK);
  } catch {
    throw new PosterDetectorUnavailableError('configured detector is not executable');
  }
  options.signal?.throwIfAborted();
  let mode: 'auto' | 'cpu' = 'auto';
  const execute = async (imagePath: string, preflight: boolean) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      options.signal?.throwIfAborted();
      const started = Date.now();
      try {
        const { stdout } = await execFile(binary, [imagePath, mode], {
          timeout: preflight ? 90_000 : mode === 'cpu' ? 60_000 : 45_000,
          maxBuffer: 128 * 1024, killSignal: 'SIGKILL',
          ...(options.signal ? { signal: options.signal } : {}),
        });
        const observation = parseObservation(stdout);
        console.info(`[poster-detector] stage=${preflight ? 'preflight' : 'detect'} mode=${mode} elapsedMs=${Date.now() - started} result=ok`);
        return observation;
      } catch (error) {
        options.signal?.throwIfAborted();
        const detail = error as { code?: string; signal?: string; killed?: boolean };
        console.warn(`[poster-detector] stage=${preflight ? 'preflight' : 'detect'} mode=${mode} elapsedMs=${Date.now() - started} code=${detail.code ?? 'invalid-output'} signal=${detail.signal ?? 'none'} killed=${detail.killed ?? false}`);
        if (attempt === 1) throw new PosterDetectorUnavailableError('local execution failed after CPU recovery; saved image can be resumed');
        mode = 'cpu';
        options.onProgress?.('image:local-retry');
      }
    }
    throw new PosterDetectorUnavailableError('local execution did not complete');
  };
  // Actually run every Vision request before buying an image. A blank fixture
  // warms the models; zero hands is valid here, but a missing protocol is not.
  options.onProgress?.('image:preflight');
  const preflightDir = await mkdtemp(path.join(tmpdir(), 'od-poster-preflight-'));
  try {
    const fixture = path.join(preflightDir, 'fixture.png');
    await sharp({ create: { width: 256, height: 256, channels: 3, background: 'white' } }).png().toFile(fixture);
    await execute(fixture, true);
  } finally {
    await rm(preflightDir, { recursive: true, force: true });
  }
  return async (input) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'od-poster-hand-input-'));
    try {
      const imagePath = path.join(directory, 'image.png');
      // Match the finalizer's pixel orientation; do not independently auto-rotate EXIF.
      await sharp(input).resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .png().toFile(imagePath);
      const observation = await execute(imagePath, false);
      assertPosterArmIntegrity(observation);
      return observation;
    } catch (error) {
      options.signal?.throwIfAborted();
      if (error instanceof PosterHandLayoutError || error instanceof PosterDetectorUnavailableError) throw error;
      throw new PosterDetectorUnavailableError('local image preparation failed; saved image can be resumed');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };
}
