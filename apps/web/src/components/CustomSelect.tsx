import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';

export interface CustomSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  subOptions?: CustomSelectOption[];
}

export interface CustomSelectGroup {
  label: string;
  options: CustomSelectOption[];
}

export type CustomSelectItem = CustomSelectOption | CustomSelectGroup;

export interface SelectRenderers {
  renderValue?: (option: CustomSelectOption) => ReactNode;
  renderOption?: (option: CustomSelectOption, keyboardActive: boolean, keyboardNavigation: boolean) => ReactNode;
}

export type SelectSelection =
  | { multiple?: false; value: string; onChange: (value: string) => void }
  | { multiple: true; value: string[]; onChange: (value: string[]) => void };

interface BaseProps extends SelectRenderers {
  options: CustomSelectItem[];
  ariaLabel: string;
  labelledBy?: string;
  className?: string;
  triggerClassName?: string;
  menuClassName?: string;
  menuGap?: number;
  menuMinWidth?: number;
  submenuLabel?: string;
  menuPlacement?: 'adaptive' | 'bottom';
  disabled?: boolean;
  placeholder?: string;
  portal?: boolean;
  title?: string;
  testId?: string;
  onFocus?: () => void;
}

type Props = BaseProps & SelectSelection;

interface FlatOption extends CustomSelectOption {
  group?: string;
}

const VIEWPORT_PADDING = 12;
const SUBMENU_GAP = 6;

interface MenuPosition {
  viewportWidth: number;
  top: number;
  left: number;
  width: number;
  maxHeight: number;
}

function isGroup(item: CustomSelectItem): item is CustomSelectGroup {
  return 'options' in item;
}

function flattenOptions(items: CustomSelectItem[]): FlatOption[] {
  return items.flatMap((item) =>
    isGroup(item)
      ? item.options.map((option) => ({ ...option, group: item.label }))
      : [item],
  );
}

export function CustomSelect({
  multiple,
  value,
  options,
  onChange,
  ariaLabel,
  labelledBy,
  className,
  triggerClassName,
  menuClassName,
  menuGap = 4,
  menuMinWidth,
  submenuLabel,
  menuPlacement = 'adaptive',
  disabled = false,
  placeholder,
  portal = true,
  title,
  testId,
  onFocus,
  renderValue,
  renderOption,
}: Props) {
  const reactId = useId();
  const idBase = reactId.replace(/:/g, '');
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const firstValue = multiple ? value[0] ?? '' : value;
  const activeSourceValueRef = useRef(firstValue);
  const [open, setOpen] = useState(false);
  const [submenuValue, setSubmenuValue] = useState<string>();
  const [keyboardNavigation, setKeyboardNavigation] = useState(false);
  const [activeValue, setActiveValue] = useState(firstValue);
  const [position, setPosition] = useState<MenuPosition | null>(null);

  const flatOptions = useMemo(() => flattenOptions(options), [options]);
  const submenu = open && !multiple ? flatOptions.find(option => option.value === submenuValue) : undefined;
  const submenuOptions = submenu?.subOptions;
  const selectedParent = multiple ? undefined : flatOptions.find(option => option.subOptions?.some(child => child.value === firstValue));
  const selected = selectedParent?.subOptions?.find(option => option.value === firstValue)
    ?? flatOptions.find(option => option.value === firstValue);
  const rootValue = selectedParent?.value ?? firstValue;
  const selectedLabel = multiple
    ? flatOptions.filter((option) => value.includes(option.value)).map((option) => option.label).join(' / ') || placeholder || ariaLabel
    : selected?.label ?? placeholder ?? value;
  const isSelected = (optionValue: string) => multiple ? value.includes(optionValue) : optionValue === value;
  const enabledOptions = useMemo(
    () => (submenuOptions ?? flatOptions).filter((option) => !option.disabled),
    [flatOptions, submenuOptions],
  );
  const flatOptionsRef = useRef(flatOptions);
  const enabledOptionsRef = useRef(enabledOptions);
  flatOptionsRef.current = flatOptions;
  enabledOptionsRef.current = enabledOptions;
  const optionIdByValue = useMemo(
    () => new Map(flatOptions.flatMap(option => [option, ...(option.subOptions ?? [])]).map((option, index) => [option.value, `${idBase}-option-${index}`])),
    [flatOptions, idBase],
  );
  const activeOptionId = open && activeValue ? optionIdByValue.get(activeValue) : undefined;

  useEffect(() => {
    if (!open || !keyboardNavigation || (!submenuLabel && !submenuOptions) || !activeOptionId) return;
    document.getElementById(activeOptionId)?.scrollIntoView?.({ block: 'nearest' });
  }, [open, keyboardNavigation, submenuLabel, submenuOptions, activeOptionId]);

  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const viewportPad = VIEWPORT_PADDING;
    const below = window.innerHeight - rect.bottom - viewportPad;
    const above = rect.top - viewportPad;
    const availableHeight = menuPlacement === 'bottom'
      ? Math.max(0, below - menuGap)
      : Math.max(below, above) - menuGap;
    const maxHeight = menuPlacement === 'bottom'
      ? Math.min(300, availableHeight)
      : Math.max(160, Math.min(300, availableHeight));
    const openAbove = menuPlacement === 'adaptive' && below < 180 && above > below;
    const availableWidth = Math.max(0, window.innerWidth - viewportPad * 2);
    const width = Math.min(
      Math.max(rect.width, menuMinWidth ?? 0),
      availableWidth,
    );
    setPosition({
      viewportWidth: window.innerWidth,
      top: openAbove
        ? Math.max(viewportPad, rect.top - maxHeight - menuGap)
        : rect.bottom + menuGap,
      left: Math.min(
        Math.max(viewportPad, rect.left),
        Math.max(viewportPad, window.innerWidth - width - viewportPad),
      ),
      width,
      maxHeight,
    });
  }, [menuGap, menuMinWidth, menuPlacement]);

  useEffect(() => {
    if (!portal) return;
    if (!open) {
      setPosition(null);
      return;
    }
    updatePosition();
  }, [open, portal, updatePosition]);

  useEffect(() => {
    if (!open) {
      activeSourceValueRef.current = firstValue;
      return;
    }
    if (multiple || activeSourceValueRef.current === firstValue) return;
    setSubmenuValue(undefined);
    const selectedOption = flatOptionsRef.current.find((option) => option.value === rootValue && !option.disabled);
    setActiveValue(selectedOption?.value ?? enabledOptionsRef.current[0]?.value ?? '');
    activeSourceValueRef.current = firstValue;
  }, [open, firstValue, multiple, rootValue]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target) || submenuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onScrollOrResize = () => {
      if (portal) updatePosition();
    };
    document.addEventListener('mousedown', onPointerDown);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open, portal, updatePosition]);

  const choose = (nextValue: string) => {
    const next = submenuOptions?.find(option => option.value === nextValue) ?? flatOptions.find(option => option.value === nextValue);
    if (!next || next.disabled) return;
    if (!multiple && next.subOptions?.length) {
      setSubmenuValue(next.value);
      setActiveValue(next.subOptions.find(option => option.value === value && !option.disabled)?.value
        ?? next.subOptions.find(option => !option.disabled)?.value ?? '');
      buttonRef.current?.focus();
      return;
    }
    if (multiple) {
      setActiveValue(next.value);
      onChange(value.includes(next.value) ? value.filter((item) => item !== next.value) : [...value, next.value]);
    } else {
      onChange(next.value);
      setOpen(false);
    }
    buttonRef.current?.focus();
  };

  const moveActive = (direction: 1 | -1) => {
    if (!enabledOptions.length) return;
    const currentIndex = enabledOptions.findIndex((option) => option.value === activeValue);
    const nextIndex =
      currentIndex < 0
        ? 0
        : (currentIndex + direction + enabledOptions.length) % enabledOptions.length;
    setActiveValue(enabledOptions[nextIndex]!.value);
  };

  const openMenu = () => {
    const selectedOption = flatOptions.find(option => option.value === rootValue && !option.disabled);
    setActiveValue(selectedOption?.value ?? enabledOptions[0]?.value ?? '');
    activeSourceValueRef.current = firstValue;
    setSubmenuValue(undefined);
    setOpen(true);
  };

  const onButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    setKeyboardNavigation(true);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      moveActive(event.key === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (open && event.key === 'ArrowRight' && !submenu && flatOptions.some(option => option.value === activeValue && option.subOptions?.length)) {
      event.preventDefault();
      choose(activeValue);
      return;
    }
    if (submenu && (event.key === 'ArrowLeft' || event.key === 'Escape')) {
      event.preventDefault();
      event.stopPropagation();
      setActiveValue(submenu.value);
      setSubmenuValue(undefined);
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (open) {
        choose(activeValue || firstValue);
      } else {
        openMenu();
      }
      return;
    }
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key === 'Tab' && open) setOpen(false);
  };

  const renderRow = (option: CustomSelectOption, inSubmenu = false) => (
    <SelectOptionButton
      key={option.value}
      option={option}
      selected={isSelected(option.value) || selectedParent?.value === option.value}
      active={option.value === activeValue || (!inSubmenu && submenuValue === option.value)}
      expanded={option.subOptions?.length ? submenuValue === option.value : undefined}
      submenuId={`${idBase}-submenu`}
      id={optionIdByValue.get(option.value)}
      onChoose={choose}
      onActive={next => {
        setKeyboardNavigation(false);
        if (!submenu || inSubmenu) setActiveValue(next);
      }}
      renderOption={renderOption}
      keyboardNavigation={keyboardNavigation && (!submenu || inSubmenu)}
    />
  );
  const menuWidth = position && submenuOptions
    ? Math.min(position.width, Math.max(0, (position.viewportWidth - 2 * VIEWPORT_PADDING - SUBMENU_GAP) / 2))
    : position?.width;
  const menuLeft = position && submenuOptions && menuWidth !== undefined
    ? Math.max(VIEWPORT_PADDING, Math.min(position.left, position.viewportWidth - 2 * menuWidth - SUBMENU_GAP - VIEWPORT_PADDING))
    : position?.left;
  const submenuMenu = submenuOptions && position && menuWidth !== undefined && menuLeft !== undefined && (
    <div
      ref={submenuRef}
      id={`${idBase}-submenu`}
      className={['od-select-menu', 'portal', menuClassName, 'od-select-submenu'].filter(Boolean).join(' ')}
      role="listbox"
      aria-label={submenuLabel}
      style={{ top: position.top, left: menuLeft + menuWidth + SUBMENU_GAP, width: menuWidth, maxHeight: position.maxHeight }}
    >
      <div className="od-select-group-label">{submenuLabel}</div>
      {submenuOptions.map(option => renderRow(option, true))}
    </div>
  );

  const menu = (
    <div
      ref={menuRef}
      id={`${idBase}-menu`}
      className={[
        'od-select-menu',
        portal ? 'portal' : 'inline',
        menuClassName,
      ].filter(Boolean).join(' ')}
      role="listbox"
      aria-label={ariaLabel}
      aria-multiselectable={multiple || undefined}
      style={
        portal && position
          ? {
              top: position.top,
              left: menuLeft,
              width: menuWidth,
              maxHeight: position.maxHeight,
            }
          : undefined
      }
    >
      {options.map((item) => {
        if (isGroup(item)) {
          return (
            <div className="od-select-group" key={`group:${item.label}`}>
              <div className="od-select-group-label">{item.label}</div>
              {item.options.map(option => renderRow(option))}
            </div>
          );
        }
        return renderRow(item);
      })}
    </div>
  );

  return (
    <div className={['od-select', className].filter(Boolean).join(' ')}>
      <button
        ref={buttonRef}
        type="button"
        className={['od-select-trigger', triggerClassName].filter(Boolean).join(' ')}
        role="combobox"
        value={multiple ? value.join(',') : value}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={submenuOptions ? `${idBase}-menu ${idBase}-submenu` : `${idBase}-menu`}
        aria-activedescendant={activeOptionId}
        aria-labelledby={labelledBy}
        aria-label={`${ariaLabel}: ${selectedLabel}`}
        data-testid={testId}
        disabled={disabled}
        title={title}
        onClick={() => { setKeyboardNavigation(false); if (open) setOpen(false); else openMenu(); }}
        onKeyDown={onButtonKeyDown}
        onFocus={onFocus}
      >
        <span id={`${idBase}-value`} className="od-select-value">
          {!multiple && selected && renderValue ? renderValue(selected) : selectedLabel}
        </span>
        <Icon name="chevron-down" size={14} />
      </button>
      {open ? (portal ? (position ? createPortal(<>{menu}{submenuMenu}</>, document.body) : null) : menu) : null}
    </div>
  );
}

function SelectOptionButton({
  option,
  selected,
  active,
  expanded,
  submenuId,
  id,
  onChoose,
  onActive,
  renderOption,
  keyboardNavigation,
}: {
  option: CustomSelectOption;
  selected: boolean;
  active: boolean;
  expanded?: boolean;
  submenuId: string;
  id?: string;
  onChoose: (value: string) => void;
  onActive: (value: string) => void;
  renderOption?: SelectRenderers['renderOption'];
  keyboardNavigation: boolean;
}) {
  return (
    <button
      id={id}
      type="button"
      className={[
        'od-select-option',
        selected ? 'selected' : '',
        active ? 'active' : '',
      ].filter(Boolean).join(' ')}
      role="option"
      aria-selected={selected}
      aria-haspopup={expanded === undefined ? undefined : 'listbox'}
      aria-expanded={expanded}
      aria-controls={expanded ? submenuId : undefined}
      tabIndex={-1}
      disabled={option.disabled}
      onMouseMove={() => onActive(option.value)}
      onClick={() => onChoose(option.value)}
    >
      <span className="od-select-option-label">{renderOption ? renderOption(option, active && keyboardNavigation, keyboardNavigation) : option.label}</span>
      {expanded === undefined ? (
        <span className="od-select-option-check" aria-hidden><Icon name="check" size={13} /></span>
      ) : <Icon name="chevron-right" size={14} aria-hidden />}

    </button>
  );
}
