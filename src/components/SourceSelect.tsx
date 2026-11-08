import { useId } from 'react';
import { de } from '../i18n/de';

export interface SourceOption {
  id: string;
  name: string;
  /** Grouped options render inside an `<optgroup>`; the empty view stays ungrouped. */
  group?: 'system' | 'user';
}

interface Props {
  options: SourceOption[];
  value: string;
  onChange: (id: string) => void;
}

/** Picks between the sample data, datasets the user loaded, and the empty view. */
export function SourceSelect({ options, value, onChange }: Props) {
  const id = useId();
  const plain = options.filter((option) => !option.group);
  const groups = (['system', 'user'] as const)
    .map((key) => ({
      key,
      label: key === 'system' ? de.sourceSelect.groupSystem : de.sourceSelect.groupUser,
      items: options.filter((option) => option.group === key),
    }))
    .filter((group) => group.items.length > 0);
  return (
    <div className="view-select source-select">
      <label htmlFor={id}>{de.sourceSelect.label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {plain.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
        {groups.map((group) => (
          <optgroup key={group.key} label={group.label}>
            {group.items.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
