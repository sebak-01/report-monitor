import { useId } from 'react';
import { de } from '../i18n/de';
import type { ViewMeta } from '../types';

interface Props {
  views: ViewMeta[];
  value: string;
  onChange: (viewId: string) => void;
}

/** The dropdown in the upper right corner that switches between Bilanz and GuV. */
export function ViewSelect({ views, value, onChange }: Props) {
  const id = useId();
  return (
    <div className="view-select">
      <label htmlFor={id}>{de.viewSelect.label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {views.map((view) => (
          <option key={view.id} value={view.id}>
            {view.labelDe}
          </option>
        ))}
      </select>
    </div>
  );
}
