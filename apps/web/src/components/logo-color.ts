export interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface HsvaColor {
  h: number;
  s: number;
  v: number;
  a: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function byte(value: number): number {
  return Math.round(clamp(value, 0, 255));
}

function hexByte(value: number): string {
  return byte(value).toString(16).padStart(2, '0').toUpperCase();
}

export function parseLogoColor(value: string): RgbaColor {
  const raw = value.trim().replace(/^#/u, '');
  if (!/^(?:[\dA-F]{3,4}|[\dA-F]{6}|[\dA-F]{8})$/iu.test(raw)) {
    return { r: 0, g: 0, b: 0, a: 1 };
  }

  const expanded = raw.length <= 4
    ? Array.from(raw).map((character) => character + character).join('')
    : raw;

  return {
    r: Number.parseInt(expanded.slice(0, 2), 16),
    g: Number.parseInt(expanded.slice(2, 4), 16),
    b: Number.parseInt(expanded.slice(4, 6), 16),
    a: expanded.length === 8 ? Number.parseInt(expanded.slice(6, 8), 16) / 255 : 1,
  };
}

export function formatLogoColor(color: RgbaColor): string {
  const opaque = `#${hexByte(color.r)}${hexByte(color.g)}${hexByte(color.b)}`;
  return color.a >= 1 ? opaque : `${opaque}${hexByte(color.a * 255)}`;
}

export function rgbaToHsv(color: RgbaColor): HsvaColor {
  const r = byte(color.r) / 255;
  const g = byte(color.g) / 255;
  const b = byte(color.b) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;

  if (delta !== 0) {
    if (max === r) hue = 60 * (((g - b) / delta) % 6);
    else if (max === g) hue = 60 * ((b - r) / delta + 2);
    else hue = 60 * ((r - g) / delta + 4);
  }

  return {
    h: hue < 0 ? hue + 360 : hue,
    s: max === 0 ? 0 : delta / max,
    v: max,
    a: clamp(color.a, 0, 1),
  };
}

export function hsvToRgba(color: HsvaColor): RgbaColor {
  const hue = ((color.h % 360) + 360) % 360;
  const saturation = clamp(color.s, 0, 1);
  const value = clamp(color.v, 0, 1);
  const chroma = value * saturation;
  const sector = hue / 60;
  const x = chroma * (1 - Math.abs((sector % 2) - 1));
  const offset = value - chroma;
  let rgb: [number, number, number];

  if (sector < 1) rgb = [chroma, x, 0];
  else if (sector < 2) rgb = [x, chroma, 0];
  else if (sector < 3) rgb = [0, chroma, x];
  else if (sector < 4) rgb = [0, x, chroma];
  else if (sector < 5) rgb = [x, 0, chroma];
  else rgb = [chroma, 0, x];

  return {
    r: byte((rgb[0] + offset) * 255),
    g: byte((rgb[1] + offset) * 255),
    b: byte((rgb[2] + offset) * 255),
    a: clamp(color.a, 0, 1),
  };
}
