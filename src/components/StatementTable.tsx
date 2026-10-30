import { useMemo, useState } from 'react';
import { de } from '../i18n/de';
import { formatAmount, formatSignedAmount, formatSignedRatio } from '../lib/format';
import { expandableKeys, type StatementRow } from '../lib/statementRows';

interface Props {
  title: string;
  rows: StatementRow[];
  currentLabel: string;
  previousLabel: string;
}

const INDENT_PX = 18;

function amount(value: number | null): string {
  return value === null ? '–' : formatAmount(value);
}

/**
 * A full statement (Aktiva, Passiva or GuV) as a table: position numbers as
 * printed (Bilanz: § 266 HGB), both years and the change. Rows with sub-items
 * can be collapsed. Amounts are in EUR and shown as printed in the report.
 */
export function StatementTable({ title, rows, currentLabel, previousLabel }: Props) {
  // Start fully collapsed: only the top levels (A., B., … / 1., 2., …) are visible.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(expandableKeys(rows)));
  const expandable = useMemo(() => expandableKeys(rows), [rows]);
  const labelByKey = useMemo(() => new Map(rows.map((r) => [r.key, r.label])), [rows]);

  const visible = rows.filter((row) => row.ancestors.every((key) => !collapsed.has(key)));
  const anyCollapsed = collapsed.size > 0;

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="statement">
      <div className="statement-head">
        <h4 className="statement-title">{title}</h4>
        {expandable.length > 0 && (
          <button
            type="button"
            className="link-button"
            onClick={() => setCollapsed(anyCollapsed ? new Set() : new Set(expandable))}
          >
            {anyCollapsed ? de.table.expandAll : de.table.collapseAll}
          </button>
        )}
      </div>
      <div className="table-scroll" role="region" aria-label={`${title}: ${de.table.scrollHint}`} tabIndex={0}>
        <table className="statement-table">
          <caption className="sr-only">
            {title}, {de.table.eur}
          </caption>
          <thead>
            <tr>
              <th scope="col">{de.table.position}</th>
              <th scope="col" className="num">
                {currentLabel}
              </th>
              <th scope="col" className="num">
                {previousLabel}
              </th>
              <th scope="col" className="num">
                <abbr title={de.table.changeAbs}>Δ EUR</abbr>
              </th>
              <th scope="col" className="num">
                <abbr title={de.table.changeRel}>Δ %</abbr>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const isCollapsed = collapsed.has(row.key);
              const classes = [
                row.level === 0 && row.hasChildren ? 'row-top' : '',
                row.emphasis ? `row-${row.emphasis}` : '',
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <tr key={row.key} className={classes} title={row.note}>
                  <th scope="row">
                    <span className="row-label" style={{ paddingLeft: row.level * INDENT_PX }}>
                      {row.hasChildren ? (
                        <button
                          type="button"
                          className="chevron"
                          aria-expanded={!isCollapsed}
                          aria-label={
                            isCollapsed ? de.table.expand(row.label) : de.table.collapse(row.label)
                          }
                          onClick={() => toggle(row.key)}
                        >
                          <span aria-hidden="true">{isCollapsed ? '▸' : '▾'}</span>
                        </button>
                      ) : (
                        <span className="chevron-space" aria-hidden="true" />
                      )}
                      {row.number && <span className="row-number">{row.number}</span>}
                      <span>{labelByKey.get(row.key)}</span>
                    </span>
                  </th>
                  <td className="num">{amount(row.current)}</td>
                  <td className="num">{amount(row.previous)}</td>
                  <td className="num">{row.deltaAbs === null ? '–' : formatSignedAmount(row.deltaAbs)}</td>
                  <td className="num">{row.deltaRel === null ? '–' : formatSignedRatio(row.deltaRel)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
