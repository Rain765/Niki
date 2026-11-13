import { useId } from 'react';

import {
  CustomSelect,
  type CustomSelectItem,
  type SelectRenderers,
  type SelectSelection,
} from './CustomSelect';

interface SelectFieldBaseProps extends SelectRenderers {
  className?: string;
  disabled?: boolean;
  label: string;
  menuMinWidth?: number;
  submenuLabel?: string;
  touchSheet?: { backLabel: string; closeLabel: string };
  onFocus?: () => void;
  options: CustomSelectItem[];
  testId?: string;
}

export type SelectFieldProps = SelectFieldBaseProps & SelectSelection;

export function SelectField({
  className,
  disabled = false,
  label,
  menuMinWidth = 224,
  submenuLabel,
  touchSheet,
  onFocus,
  options,
  testId,
  renderValue,
  renderOption,
  ...selection
}: SelectFieldProps) {
  const reactId = useId();
  const labelId = `${reactId.replace(/:/g, '')}-label`;

  return (
    <div className={['od-field', className].filter(Boolean).join(' ')}>
      <span className="od-field__label" id={labelId}>{label}</span>
      <CustomSelect
        {...selection}
        renderValue={renderValue}
        renderOption={renderOption}
        ariaLabel={label}
        className="od-control-select"
        disabled={disabled}
        labelledBy={labelId}
        menuClassName="od-control-select__menu"
        menuGap={8}
        menuMinWidth={menuMinWidth}
        submenuLabel={submenuLabel}
        touchSheet={touchSheet}
        menuPlacement="bottom"
        onFocus={onFocus}
        options={options}
        testId={testId}
        triggerClassName="od-control-select__trigger"
      />
    </div>
  );
}
