import { de } from '../i18n/de';
import type { KpiCardModel } from '../lib/kpiCards';

const ARROWS = { up: '▲', down: '▼', flat: '▬' } as const;

/**
 * One headline figure. The change vs. the previous period carries an arrow
 * (direction) and a color (good/bad). Screen readers get the verdict as text,
 * so meaning never depends on color alone.
 */
export function KpiCard({ card }: { card: KpiCardModel }) {
  const { delta } = card;
  return (
    <article className="kpi-card">
      <h3 className="kpi-label">{card.label}</h3>
      <p className="kpi-value">{card.value}</p>
      {card.exact && <p className="kpi-exact">{card.exact}</p>}
      {card.detail && <p className="kpi-exact">{card.detail}</p>}
      {delta && (
        <p className={`kpi-delta kpi-delta--${delta.tone}`}>
          <span aria-hidden="true">{ARROWS[delta.direction]}</span> {delta.text}
          <span className="sr-only">
            {' '}
            ({de.kpi.direction[delta.direction]}, {de.kpi.tone[delta.tone]})
          </span>
        </p>
      )}
      {card.prior && <p className="kpi-prior">{card.prior}</p>}
    </article>
  );
}
