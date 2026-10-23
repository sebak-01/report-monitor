import { useId } from 'react';
import { de } from '../i18n/de';

interface Props {
  periods: string[];
  value: string;
  onChange: (periodId: string) => void;
}

/** The dropdown next to the view dropdown that picks the Geschäftsjahr. Newest year first. */
export function PeriodSelect({ periods, value, onChange }: Props) {
  const id = useId();
  return (
    <div className="view-select">
      <label htmlFor={id}>{de.periodSelect.label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {[...periods].reverse().map((period) => (
          <option key={period} value={period}>
            {period}
          </option>
        ))}
      </select>
    </div>
  );
}
