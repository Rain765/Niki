import { execFile as execFileCallback } from 'node:child_process';
import { mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { PosterHandLayoutError, type PosterHandObservation } from './poster-hand-layout.js';

const execFile = promisify(execFileCallback);
export type PosterHandDetector = (input: Buffer) => Promise<PosterHandObservation>;

// TypeScript owns the bridge; this generated native helper only exposes Apple's
// local Vision landmarks. Images never leave the machine. Other hosts can supply
// the same JSON protocol using OD_POSTER_HAND_DETECTOR (executable, not a shell).
const VISION_BRIDGE = String.raw`
import Foundation
import Vision
let handler = VNImageRequestHandler(url: URL(fileURLWithPath: CommandLine.arguments[1]))
let hands = VNDetectHumanHandPoseRequest()
hands.maximumHandCount = 3
let rectangles = VNDetectRectanglesRequest()
rectangles.maximumObservations = 20
rectangles.minimumSize = 0.05
rectangles.minimumConfidence = 0.6
rectangles.minimumAspectRatio = 0.2
rectangles.maximumAspectRatio = 0.85
let text = VNRecognizeTextRequest()
text.recognitionLevel = .accurate
text.recognitionLanguages = ["en-US"]
try handler.perform([hands, rectangles, text])
let domains = (text.results ?? []).filter {
  ($0.topCandidates(1).first?.string.lowercased() ?? "").contains(".com")
}
let phones = domains.compactMap { domain in
  (rectangles.results ?? []).filter { rect in
    rect.boundingBox.contains(CGPoint(x: domain.boundingBox.midX, y: domain.boundingBox.midY))
  }.min { a, b in
    a.boundingBox.width * a.boundingBox.height < b.boundingBox.width * b.boundingBox.height
  }
}.map { rect -> [String: Double] in
  let b = rect.boundingBox
  return ["left": b.minX, "top": 1-b.maxY, "right": b.maxX, "bottom": 1-b.minY]
}
let result: [String: Any] = [
  "hands": try (hands.results ?? []).map { hand -> [String: Any] in
    let points = try hand.recognizedPoints(.all).values.map { point in
      ["x": Double(point.location.x), "y": 1-Double(point.location.y), "confidence": Double(point.confidence)]
    }
    return ["points": points]
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
  if (!value || !Array.isArray(value.hands) || value.hands.length > 3
    || !value.hands.every((h) => Array.isArray(h.points) && h.points.length <= 30
      && h.points.every((p) => p && [p.x, p.y, p.confidence].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)))
    || !Array.isArray(value.phones) || value.phones.length > 30
    || !value.phones.every((b) => [b.left, b.top, b.right, b.bottom].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)
      && b.left < b.right && b.top < b.bottom)) {
    throw new PosterHandLayoutError('detector returned invalid landmarks');
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
      return parseObservation(stdout);
    } catch (error) {
      if (error instanceof PosterHandLayoutError) throw error;
      throw new PosterHandLayoutError('hand recognition failed or timed out; no message was composited');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };
}
