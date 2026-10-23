import type { ReactNode } from 'react';

export interface DataTableRow {
  key: string;
  label: ReactNode;
  cells: ReactNode[];
  /** `total` = sum row, `memo` = indented "davon" line, `heading` = label only. */
  kind?: 'total' | 'memo' | 'heading';
}

interface Props {
  /** Omitted when a CollapsibleCard already shows the heading. */
  title?: string;
  subtitle?: string;
  /** Column headers after the label column. */
  columns: string[];
  rows: DataTableRow[];
  /** Header of the label column. */
  labelHeader?: string;
}

/** A small read-only table for the figures of the Anhang. Numbers are right-aligned. */
export function DataTable({ title, subtitle, columns, rows, labelHeader = '' }: Props) {
  return (
    <div className="data-table">
      {title && <h4 className="statement-title">{title}</h4>}
      {subtitle && <p className="card-subtitle">{subtitle}</p>}
      <div className="table-scroll">
        <table>
          {title && <caption className="sr-only">{title}</caption>}
          <thead>
            <tr>
              <th scope="col">{labelHeader}</th>
              {columns.map((c) => (
                <th scope="col" className="num" key={c}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={row.kind ? `row-${row.kind}` : undefined}>
                <th scope="row">{row.label}</th>
                {row.cells.map((cell, i) => (
                  <td className="num" key={i}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
