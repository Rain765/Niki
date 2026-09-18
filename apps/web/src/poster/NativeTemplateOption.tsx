import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

type Asset = { thumb: string; full: string; width: number; height: number };

/** Preview stays outside the scrolling listbox; selecting the label retains normal select behavior. */
export function NativeTemplateOption({ label, asset, keyboardActive, keyboardNavigation, disabled }: {
  label: string; asset: Asset; keyboardActive: boolean; keyboardNavigation: boolean; disabled: boolean;
}) {
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number; width: number }>();
  const visible = !disabled && !dismissed && (keyboardActive || (!keyboardNavigation && (hovered || pinned)));
  const cancelHide = () => clearTimeout(timer.current);
  const enter = () => { cancelHide(); setDismissed(false); setHovered(true); };
  const leave = () => { cancelHide(); timer.current = setTimeout(() => setHovered(false), 140); };

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => { setDismissed(false); }, [keyboardActive, asset.full]);
  useEffect(() => {
    if (!visible || !anchor.current) return;
    const rect = anchor.current.getBoundingClientRect();
    const width = Math.min(420, window.innerWidth - 24, (window.innerHeight - 24) * asset.width / asset.height);
    const height = width * asset.height / asset.width;
    const menu = anchor.current.closest('.od-select-menu')?.getBoundingClientRect();
    const edge = menu ?? anchor.current.closest('.od-select-trigger')?.getBoundingClientRect() ?? rect;
    const beside = edge.right + width + 16 <= window.innerWidth;
    const before = !beside && edge.left - width - 12 >= 12;
    setPosition({
      width,
      left: beside ? edge.right + 12 : before ? edge.left - width - 12 : Math.max(12, Math.min(rect.left, window.innerWidth - width - 12)),
      top: Math.max(12, Math.min(beside || before ? rect.top : rect.bottom + 8, window.innerHeight - height - 12)),
    });
    const dismiss = () => { setHovered(false); setPinned(false); setDismissed(true); };
    const outside = (event: PointerEvent) => {
      if (!anchor.current?.contains(event.target as Node) && !bubble.current?.contains(event.target as Node)) dismiss();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { setHovered(false); setPinned(false); }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('scroll', dismiss, true);
    window.addEventListener('resize', dismiss);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('scroll', dismiss, true);
      window.removeEventListener('resize', dismiss);
    };
  }, [visible, asset]);

  return <span className="native-template-option">
    <span ref={anchor} className="native-template-option__thumb" aria-describedby={visible ? id : undefined}
      onMouseEnter={enter} onMouseLeave={leave}
      onMouseDown={event => { event.preventDefault(); event.stopPropagation(); }}
      onClick={event => { event.stopPropagation(); setHovered(false); setDismissed(pinned); setPinned(old => !old); }}>
      <img src={asset.thumb} alt="" width={asset.width} height={asset.height} loading="lazy" decoding="async" />
    </span>
    <span className="native-template-option__label">{label}</span>
    {visible && position && createPortal(<span ref={bubble} id={id} role="tooltip" aria-label={label}
      className="native-template-option__preview" style={position} onMouseEnter={enter} onMouseLeave={leave}
      onMouseDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
      <img src={asset.full} alt={label} width={asset.width} height={asset.height} decoding="async" />
    </span>, document.body)}
  </span>;
}
