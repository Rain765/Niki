import sharp from 'sharp';

const MAX_VECTOR_DIMENSION = 1_024;
const PALETTE_COLORS = 32;
const BACKGROUND_DISTANCE = 20;
const MIN_SIMILARITY = 0.94;

interface VectorizeLogoOptions {
  brandName: string;
}

interface VectorizedLogoResult {
  files: Map<string, Buffer>;
  similarityScore: number;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface VectorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function xmlEscape(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function hexByte(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0').toUpperCase();
}

function colorHex(r: number, g: number, b: number): string {
  return `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`;
}

function estimateBackground(data: Buffer, width: number, height: number): Rgb {
  const patch = Math.max(2, Math.min(24, Math.floor(Math.min(width, height) / 24)));
  const samples: Rgb[] = [];
  const origins = [
    [0, 0],
    [width - patch, 0],
    [0, height - patch],
    [width - patch, height - patch],
  ] as const;
  for (const [startX, startY] of origins) {
    for (let y = startY; y < startY + patch; y += 1) {
      for (let x = startX; x < startX + patch; x += 1) {
        const offset = (y * width + x) * 4;
        if ((data[offset + 3] ?? 0) < 192) continue;
        samples.push({
          r: data[offset] ?? 255,
          g: data[offset + 1] ?? 255,
          b: data[offset + 2] ?? 255,
        });
      }
    }
  }
  if (samples.length === 0) return { r: 255, g: 255, b: 255 };
  const median = (channel: keyof Rgb) => {
    const values = samples.map((sample) => sample[channel]).sort((left, right) => left - right);
    return values[Math.floor(values.length / 2)] ?? 255;
  };
  return { r: median('r'), g: median('g'), b: median('b') };
}

function isForeground(data: Buffer, offset: number, background: Rgb): boolean {
  const alpha = data[offset + 3] ?? 0;
  if (alpha < 32) return false;
  const red = (data[offset] ?? background.r) - background.r;
  const green = (data[offset + 1] ?? background.g) - background.g;
  const blue = (data[offset + 2] ?? background.b) - background.b;
  return red * red + green * green + blue * blue >= BACKGROUND_DISTANCE * BACKGROUND_DISTANCE;
}

function tracePaletteRects(
  original: Buffer,
  quantized: Buffer,
  width: number,
  height: number,
  background: Rgb,
): { groups: Map<string, VectorRect[]>; foregroundPixels: number } {
  const groups = new Map<string, VectorRect[]>();
  let active = new Map<string, VectorRect>();
  let foregroundPixels = 0;

  for (let y = 0; y < height; y += 1) {
    const next = new Map<string, VectorRect>();
    let x = 0;
    while (x < width) {
      const offset = (y * width + x) * 4;
      if (!isForeground(original, offset, background)) {
        x += 1;
        continue;
      }
      const color = colorHex(
        quantized[offset] ?? 0,
        quantized[offset + 1] ?? 0,
        quantized[offset + 2] ?? 0,
      );
      const start = x;
      x += 1;
      while (x < width) {
        const nextOffset = (y * width + x) * 4;
        if (!isForeground(original, nextOffset, background)) break;
        const nextColor = colorHex(
          quantized[nextOffset] ?? 0,
          quantized[nextOffset + 1] ?? 0,
          quantized[nextOffset + 2] ?? 0,
        );
        if (nextColor !== color) break;
        x += 1;
      }
      const runWidth = x - start;
      foregroundPixels += runWidth;
      const key = `${color}:${start}:${runWidth}`;
      const prior = active.get(key);
      if (prior) {
        prior.height += 1;
        next.set(key, prior);
      } else {
        const rect = { x: start, y, width: runWidth, height: 1 };
        const colorRects = groups.get(color) ?? [];
        colorRects.push(rect);
        groups.set(color, colorRects);
        next.set(key, rect);
      }
    }
    active = next;
  }
  return { groups, foregroundPixels };
}

function svgFromRects(
  groups: Map<string, VectorRect[]>,
  width: number,
  height: number,
  brandName: string,
  forcedColor?: string,
): string {
  const paths = [...groups.entries()].map(([color, rects]) => {
    const path = rects.map((rect) => (
      `M${rect.x} ${rect.y}h${rect.width}v${rect.height}h-${rect.width}Z`
    )).join('');
    return `  <path fill="${forcedColor ?? color}" d="${path}"/>`;
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${xmlEscape(brandName)}" data-vectorization="faithful">`,
    `  <title>${xmlEscape(brandName)}</title>`,
    ...paths,
    '</svg>',
    '',
  ].join('\n');
}

async function renderRaw(svg: string, width: number, height: number): Promise<Buffer> {
  return await sharp(Buffer.from(svg), { density: 72 })
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer();
}

function renderSimilarity(
  source: Buffer,
  rendered: Buffer,
  width: number,
  height: number,
  background: Rgb,
): number {
  let difference = 0;
  let comparedPixels = 0;
  let sourcePixels = 0;
  let renderedPixels = 0;
  const backgroundChannels = [background.r, background.g, background.b];
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const sourceForeground = isForeground(source, offset, background);
    const renderedForeground = (rendered[offset + 3] ?? 0) >= 32;
    if (sourceForeground) sourcePixels += 1;
    if (renderedForeground) renderedPixels += 1;
    if (!sourceForeground && !renderedForeground) continue;
    comparedPixels += 1;
    for (let channel = 0; channel < 3; channel += 1) {
      const sourceValue = sourceForeground ? (source[offset + channel] ?? 0) : (backgroundChannels[channel] ?? 255);
      const renderedValue = renderedForeground ? (rendered[offset + channel] ?? 0) : (backgroundChannels[channel] ?? 255);
      difference += Math.abs(sourceValue - renderedValue);
    }
  }
  if (comparedPixels === 0) return 0;
  const colorScore = 1 - difference / (comparedPixels * 3 * 255);
  const coverageScore = 1 - Math.abs(sourcePixels - renderedPixels) / comparedPixels;
  return Math.max(0, Math.min(1, colorScore * coverageScore));
}

function pngIco(png: Buffer, size: number): Buffer {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(size >= 256 ? 0 : size, 6);
  header.writeUInt8(size >= 256 ? 0 : size, 7);
  header.writeUInt8(0, 8);
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(header.length, 18);
  return Buffer.concat([header, png]);
}

function brandGuide(brandName: string, similarityScore: number, background: Rgb): string {
  return `# ${brandName} faithful vectorization

This kit was generated through deterministic color-quantized vector tracing, not visual reinterpretation. The primary SVG preserves the source canvas, placement, proportions, and sampled colors without embedding a raster image.

## Validation

- Render-back similarity: **${(similarityScore * 100).toFixed(2)}%**
- Required minimum: **${(MIN_SIMILARITY * 100).toFixed(0)}%**
- Source background sample: \`${colorHex(background.r, background.g, background.b)}\`
- SVG content: editable vector paths only; no \`<image>\`, data URL, or base64 payload.

## Files

- \`logo.svg\`: faithful full-color vector on a transparent canvas.
- \`logo-dark.svg\`: identical geometry in white for dark backgrounds.
- \`logo-mono.svg\`: identical geometry in black for one-color production.
- \`favicon.ico\`, \`apple-touch-icon.png\`, and \`og-image.png\`: deterministic renders from \`logo.svg\`.

The traced paths intentionally retain source-pixel detail to protect visual fidelity. A later design-refinement pass may simplify geometry, but that is a separate operation and can change appearance.
`;
}

export async function vectorizeLogoSource(
  source: Buffer,
  options: VectorizeLogoOptions,
): Promise<VectorizedLogoResult> {
  const metadata = await sharp(source, { limitInputPixels: 32_000_000 }).rotate().metadata();
  if (!metadata.width || !metadata.height) throw new Error('logo source has no readable dimensions');
  const scale = Math.min(1, MAX_VECTOR_DIMENSION / Math.max(metadata.width, metadata.height));
  const width = Math.max(1, Math.round(metadata.width * scale));
  const height = Math.max(1, Math.round(metadata.height * scale));
  const pipeline = () => sharp(source, { limitInputPixels: 32_000_000 })
    .rotate()
    .resize(width, height, { fit: 'fill' })
    .ensureAlpha();
  const original = await pipeline().raw().toBuffer();
  const background = estimateBackground(original, width, height);
  const quantizedPng = await pipeline().png({ palette: true, colours: PALETTE_COLORS, dither: 0 }).toBuffer();
  const quantized = await sharp(quantizedPng).ensureAlpha().raw().toBuffer();
  const { groups, foregroundPixels } = tracePaletteRects(original, quantized, width, height, background);
  const foregroundRatio = foregroundPixels / (width * height);
  if (foregroundRatio < 0.001 || foregroundRatio > 0.85 || groups.size === 0) {
    throw new Error('faithful vectorization could not isolate a logo from its background');
  }

  const primary = svgFromRects(groups, width, height, options.brandName);
  const dark = svgFromRects(groups, width, height, options.brandName, '#FFFFFF');
  const mono = svgFromRects(groups, width, height, options.brandName, '#000000');
  const rendered = await renderRaw(primary, width, height);
  const similarityScore = Number(renderSimilarity(original, rendered, width, height, background).toFixed(4));
  if (similarityScore < MIN_SIMILARITY) {
    throw new Error(`faithful vectorization similarity ${(similarityScore * 100).toFixed(2)}% is below the required ${(MIN_SIMILARITY * 100).toFixed(0)}%`);
  }

  const logoBuffer = Buffer.from(primary);
  const faviconPng = await sharp(logoBuffer).resize(48, 48, { fit: 'contain' }).png().toBuffer();
  const appleTouchIcon = await sharp(logoBuffer).resize(180, 180, { fit: 'contain' }).png().toBuffer();
  const ogImage = await sharp({
    create: {
      width: 1_200,
      height: 630,
      channels: 4,
      background: { ...background, alpha: 1 },
    },
  }).composite([{
    input: await sharp(logoBuffer).resize(1_040, 510, { fit: 'contain' }).png().toBuffer(),
    gravity: 'centre',
  }]).png().toBuffer();

  return {
    similarityScore,
    files: new Map([
      ['logo.svg', logoBuffer],
      ['logo-dark.svg', Buffer.from(dark)],
      ['logo-mono.svg', Buffer.from(mono)],
      ['favicon.ico', pngIco(faviconPng, 48)],
      ['apple-touch-icon.png', appleTouchIcon],
      ['og-image.png', ogImage],
      ['BRAND.md', Buffer.from(brandGuide(options.brandName, similarityScore, background))],
    ]),
  };
}
