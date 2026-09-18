import { useId } from 'react';

import {
  CustomSelect,
  type CustomSelectItem,
  type SelectRenderers,
} from './CustomSelect';

export interface SelectFieldProps extends SelectRenderers {
  className?: string;
  disabled?: boolean;
  label: string;
  menuMinWidth?: number;
  onChange: (value: string) => void;
  onFocus?: () => void;
  options: CustomSelectItem[];
  testId?: string;
  value: string;
}

export function SelectField({
  className,
  disabled = false,
  label,
  menuMinWidth = 224,
  onChange,
  onFocus,
  options,
  testId,
  value,
  renderValue,
  renderOption,
}: SelectFieldProps) {
  const reactId = useId();
  const labelId = `${reactId.replace(/:/g, '')}-label`;

  return (
    <div className={['od-field', className].filter(Boolean).join(' ')}>
      <span className="od-field__label" id={labelId}>{label}</span>
      <CustomSelect
        renderValue={renderValue}
        renderOption={renderOption}
        ariaLabel={label}
        className="od-control-select"
        disabled={disabled}
        labelledBy={labelId}
        menuClassName="od-control-select__menu"
        menuGap={8}
        menuMinWidth={menuMinWidth}
        menuPlacement="bottom"
        onChange={onChange}
        onFocus={onFocus}
        options={options}
        testId={testId}
        triggerClassName="od-control-select__trigger"
        value={value}
      />
    </div>
  );
}
