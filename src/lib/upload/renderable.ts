import type { Dataset } from '../../types';

/**
 * Makes sure a loaded dataset can be shown. The dashboard has dedicated views for "balance" and "income".
 * Anything else (or a dataset without views this app knows) gets one generic "data" view that lists
 * every statement of the dataset.
 */
export function withGenericView(dataset: Dataset, dedicatedViewIds: string[]): Dataset {
  if (dataset.views.some((v) => dedicatedViewIds.includes(v.id) || v.id === 'data')) return dataset;
  const statements = [...new Set(dataset.facts.map((f) => f.statement))];
  return {
    ...dataset,
    statements: { ...dataset.statements, ...Object.fromEntries(statements.filter((s) => !dataset.statements[s]).map((s) => [s, { labelDe: s }])) },
    views: [{ id: 'data', labelDe: 'Daten', statements }],
  };
}
