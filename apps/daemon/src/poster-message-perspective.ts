import sharp from 'sharp';

// A gentle clockwise projective turn: right edge recedes by 7.4%. All four
// corners stay inside the original unit rectangle, so the hand-layout solver's
// full card-and-badge envelope remains a conservative collision boundary.
const RECESSION = 0.08;
const TILT = 0.075;
const LEAN = 0.025;
const SPAN = 0.995;

export function projectMessagePoint(x: number, y: number) {
  const depth = 1 + RECESSION * x;
  return { x: (SPAN * x - LEAN * y) / depth + LEAN, y: (y + TILT * x) / depth };
}

function unprojectMessagePoint(x: number, y: number) {
  const u = x - LEAN;
  const sourceX = (u + LEAN * y) / (SPAN - RECESSION * u - LEAN * RECESSION * y + LEAN * TILT);
  return { x: sourceX, y: y + (RECESSION * y - TILT) * sourceX };
}

/** Warp one transparent card+badge tile, never the poster underneath it.
 * Render and resample at 2x for small text. Premultiplied-alpha interpolation
 * prevents dark fringes; transparent space stays transparent (no backing plate).
 */
export async function warpAntiFraudMessage(svg: Buffer, width: number, height: number): Promise<Buffer> {
  const { data, info } = await sharp(svg, { density: 144 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const outWidth = width * 2;
  const outHeight = height * 2;
  const output = Buffer.alloc(outWidth * outHeight * 4);
  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      const p = unprojectMessagePoint((x + 0.5) / outWidth, (y + 0.5) / outHeight);
      if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) continue;
      const sx = Math.max(0, Math.min(info.width - 1, p.x * info.width - 0.5));
      const sy = Math.max(0, Math.min(info.height - 1, p.y * info.height - 0.5));
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const fx = sx - x0, fy = sy - y0;
      let alpha = 0, red = 0, green = 0, blue = 0;
      for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) {
        const i = (Math.min(y0 + dy, info.height - 1) * info.width + Math.min(x0 + dx, info.width - 1)) * 4;
        const weight = (dx ? fx : 1 - fx) * (dy ? fy : 1 - fy);
        const a = data[i + 3]! * weight;
        alpha += a;
        red += data[i]! * a;
        green += data[i + 1]! * a;
        blue += data[i + 2]! * a;
      }
      const index = (y * outWidth + x) * 4;
      if (alpha > 0) {
        output[index] = Math.round(red / alpha);
        output[index + 1] = Math.round(green / alpha);
        output[index + 2] = Math.round(blue / alpha);
        output[index + 3] = Math.round(alpha);
      }
    }
  }
  return sharp(output, { raw: { width: outWidth, height: outHeight, channels: 4 } })
    .resize(width, height).png().toBuffer();
}
