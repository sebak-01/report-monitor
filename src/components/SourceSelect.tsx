import { useId } from 'react';
import { de } from '../i18n/de';

interface Props {
  options: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
}

/** Picks between the bundled data and datasets the user loaded. Only shown when something was loaded. */
export function SourceSelect({ options, value, onChange }: Props) {
  const id = useId();
  return (
    <div className="view-select source-select">
      <label htmlFor={id}>{de.sourceSelect.label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </select>
    </div>
  );
}
