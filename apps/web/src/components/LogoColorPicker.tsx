import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  formatLogoColor,
  hsvToRgba,
  parseLogoColor,
  rgbaToHsv,
  type HsvaColor,
} from './logo-color';

type PickerLanguage = 'en' | 'zh';

interface LogoColorPickerProps {
  anchor: HTMLElement | null;
  label: string;
  language: PickerLanguage;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}

interface PickerPosition {
  left: number;
  top: number;
}

interface EyeDropperConstructor {
  new(): { open: () => Promise<{ sRGBHex: string }> };
}

const PICKER_COPY = {
  en: {
    dialog: (label: string) => `Color picker for ${label}`,
    saturation: 'Saturation and brightness',
    hue: 'Hue',
    opacitySlider: 'Opacity slider',
    opacity: 'Opacity',
    format: 'Color format',
    hex: 'Hex color',
    eyedropper: 'Pick color from screen',
  },
  zh: {
    dialog: (label: string) => `${label}颜色选择器`,
    saturation: '饱和度和明度',
    hue: '色相',
    opacitySlider: '透明度滑杆',
    opacity: '透明度',
    format: '颜色格式',
    hex: 'Hex 颜色',
    eyedropper: '从屏幕吸取颜色',
  },
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function supportsEyeDropper(): boolean {
  return typeof window !== 'undefined' && 'EyeDropper' in window;
}

function pickerPosition(anchor: HTMLElement, panel: HTMLElement): PickerPosition {
  const viewportPadding = 12;
  const gap = 8;
  const anchorRect = anchor.getBoundingClientRect();
  const panelRect = panel.getBoundingClientRect();
  const panelWidth = Math.min(panelRect.width || 420, window.innerWidth - viewportPadding * 2);
  const panelHeight = panelRect.height || 600;
  const left = clamp(anchorRect.left, viewportPadding, window.innerWidth - panelWidth - viewportPadding);
  const below = anchorRect.bottom + gap;
  const top = below + panelHeight <= window.innerHeight - viewportPadding
    ? below
    : Math.max(viewportPadding, anchorRect.top - panelHeight - gap);

  return { left, top };
}

export function LogoColorPicker({
  anchor,
  label,
  language,
  value,
  onChange,
  onClose,
}: LogoColorPickerProps) {
  const copy = PICKER_COPY[language];
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<PickerPosition | null>(null);
  const [color, setColor] = useState(() => rgbaToHsv(parseLogoColor(value)));
  const [hexDraft, setHexDraft] = useState(() => formatLogoColor(parseLogoColor(value)).slice(1));
  const [eyeDropperAvailable, setEyeDropperAvailable] = useState(false);

  useEffect(() => {
    const nextColor = rgbaToHsv(parseLogoColor(value));
    setColor(nextColor);
    setHexDraft(formatLogoColor(hsvToRgba(nextColor)).slice(1));
  }, [value]);

  useEffect(() => {
    setEyeDropperAvailable(supportsEyeDropper());
  }, []);

  useEffect(() => {
    const dismiss = (event: globalThis.PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !anchor?.contains(target)) onClose();
    };
    const dismissWithKeyboard = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        anchor?.focus();
        onClose();
      }
    };

    window.addEventListener('pointerdown', dismiss);
    window.addEventListener('keydown', dismissWithKeyboard);
    return () => {
      window.removeEventListener('pointerdown', dismiss);
      window.removeEventListener('keydown', dismissWithKeyboard);
    };
  }, [anchor, onClose]);

  useLayoutEffect(() => {
    if (!anchor || !panelRef.current) return undefined;
    const place = () => {
      if (panelRef.current) setPosition(pickerPosition(anchor, panelRef.current));
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchor]);

  function commit(next: HsvaColor) {
    const normalized = {
      h: ((next.h % 360) + 360) % 360,
      s: clamp(next.s, 0, 1),
      v: clamp(next.v, 0, 1),
      a: clamp(next.a, 0, 1),
    };
    const formatted = formatLogoColor(hsvToRgba(normalized));
    setColor(normalized);
    setHexDraft(formatted.slice(1));
    onChange(formatted);
  }

  function updatePlane(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    commit({
      ...color,
      s: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      v: 1 - clamp((event.clientY - rect.top) / rect.height, 0, 1),
    });
  }

  function startPlaneDrag(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    updatePlane(event);
  }

  function movePlaneDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) updatePlane(event);
  }

  function handlePlaneKeys(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 0.1 : 0.01;
    if (event.key === 'ArrowLeft') commit({ ...color, s: color.s - step });
    else if (event.key === 'ArrowRight') commit({ ...color, s: color.s + step });
    else if (event.key === 'ArrowUp') commit({ ...color, v: color.v + step });
    else if (event.key === 'ArrowDown') commit({ ...color, v: color.v - step });
    else return;
    event.preventDefault();
  }

  function updateHex(raw: string) {
    const clean = raw.replace(/^#/u, '').toUpperCase().slice(0, 8);
    setHexDraft(clean);
    if (/^(?:[\dA-F]{6}|[\dA-F]{8})$/u.test(clean)) {
      const next = rgbaToHsv(parseLogoColor(clean));
      setColor(next);
      onChange(formatLogoColor(hsvToRgba(next)));
    }
  }

  async function pickFromScreen() {
    const EyeDropper = (window as typeof window & { EyeDropper?: EyeDropperConstructor }).EyeDropper;
    if (!EyeDropper) return;
    try {
      const result = await new EyeDropper().open();
      const picked = rgbaToHsv(parseLogoColor(result.sRGBHex));
      commit({ ...picked, a: color.a });
    } catch {
      // The browser rejects when the user cancels the picker; keep the current color.
    }
  }

  const rgba = hsvToRgba(color);
  const solidHex = formatLogoColor({ ...rgba, a: 1 });
  const hueHex = formatLogoColor(hsvToRgba({ h: color.h, s: 1, v: 1, a: 1 }));
  const opacity = Math.round(color.a * 100);
  const style = {
    '--logo-picker-color': solidHex,
    '--logo-picker-hue-color': hueHex,
    left: position?.left,
    top: position?.top,
    visibility: position ? 'visible' : 'hidden',
  } as CSSProperties;

  return (
    <div
      ref={panelRef}
      className="logo-color-picker"
      role="dialog"
      aria-label={copy.dialog(label)}
      style={style}
    >
      <div
        className="logo-color-picker__plane"
        role="slider"
        tabIndex={0}
        aria-label={copy.saturation}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(color.v * 100)}
        aria-valuetext={`${Math.round(color.s * 100)}%, ${Math.round(color.v * 100)}%`}
        onKeyDown={handlePlaneKeys}
        onPointerDown={startPlaneDrag}
        onPointerMove={movePlaneDrag}
      >
        <span
          className="logo-color-picker__plane-thumb"
          style={{ left: `${color.s * 100}%`, top: `${(1 - color.v) * 100}%` }}
        />
      </div>

      <div className="logo-color-picker__controls">
        <button
          type="button"
          className="logo-color-picker__eyedropper"
          aria-label={copy.eyedropper}
          disabled={!eyeDropperAvailable}
          onClick={() => void pickFromScreen()}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m14.6 5.3 4.1 4.1M4 20l4.2-1 9.9-9.9a2.1 2.1 0 0 0-3-3L5.2 16 4 20Zm7.2-10.8 3.6 3.6" />
          </svg>
        </button>

        <div className="logo-color-picker__sliders">
          <input
            className="logo-color-picker__range logo-color-picker__hue"
            type="range"
            min="0"
            max="360"
            step="1"
            value={Math.round(color.h)}
            aria-label={copy.hue}
            onChange={(event) => commit({ ...color, h: Number(event.target.value) })}
          />
          <input
            className="logo-color-picker__range logo-color-picker__alpha"
            type="range"
            min="0"
            max="100"
            step="1"
            value={opacity}
            aria-label={copy.opacitySlider}
            onChange={(event) => commit({ ...color, a: Number(event.target.value) / 100 })}
          />
        </div>
      </div>

      <div className="logo-color-picker__values">
        <label className="logo-color-picker__format">
          <span className="logo-color-picker__sr-only">{copy.format}</span>
          <select aria-label={copy.format} defaultValue="hex">
            <option value="hex">Hex</option>
          </select>
        </label>
        <label className="logo-color-picker__hex">
          <span className="logo-color-picker__sr-only">{copy.hex}</span>
          <span aria-hidden="true">#</span>
          <input
            aria-label={copy.hex}
            value={hexDraft}
            maxLength={8}
            spellCheck={false}
            onChange={(event) => updateHex(event.target.value)}
            onBlur={() => setHexDraft(formatLogoColor(hsvToRgba(color)).slice(1))}
          />
        </label>
        <label className="logo-color-picker__opacity-value">
          <span className="logo-color-picker__sr-only">{copy.opacity}</span>
          <input
            type="number"
            min="0"
            max="100"
            value={opacity}
            aria-label={copy.opacity}
            onChange={(event) => commit({ ...color, a: Number(event.target.value) / 100 })}
          />
          <span aria-hidden="true">%</span>
        </label>
      </div>
    </div>
  );
}
