import { CustomSelect, type CustomSelectOption } from '../CustomSelect';

interface Props {
  label: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  testId: string;
  value: string;
}

export function LoanVideoSelect({
  label,
  onChange,
  options,
  testId,
  value,
}: Props) {
  return (
    <div className="loan-video-field loan-video-select-field">
      <span>{label}</span>
      <CustomSelect
        ariaLabel={label}
        className="loan-video-select"
        menuClassName="loan-video-select__menu"
        menuGap={8}
        menuPlacement="bottom"
        onChange={onChange}
        options={options}
        testId={testId}
        triggerClassName="loan-video-select__trigger"
        value={value}
      />
    </div>
  );
}
