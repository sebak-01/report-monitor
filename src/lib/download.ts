/**
 * Browser download helpers for locally generated content (CSV text, chart
 * images). Nothing is sent anywhere; everything happens via Blob URLs.
 */

import * as echarts from 'echarts/core';

/** Triggers a browser download of a locally generated text file. */
export function downloadTextFile(
  fileName: string,
  content: string,
  mime = 'text/csv;charset=utf-8',
): void {
  // The BOM keeps Excel happy with the UTF-8 German umlauts.
  const blob = new Blob(['\uFEFF', content], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Triggers a browser download of a generated image data URL. */
export function downloadDataUrl(fileName: string, dataUrl: string): void {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/**
 * PNG data URL of the ECharts instance inside `root`, or null when no chart is
 * mounted there. The chart canvas sits on the node carrying ECharts' internal
 * `_echarts_instance_` attribute, so chart components do not have to expose
 * their instance just for exporting.
 */
export function chartPngDataUrl(root: HTMLElement, backgroundColor?: string): string | null {
  const host = root.querySelector<HTMLElement>('[_echarts_instance_]');
  if (!host) return null;
  const chart = echarts.getInstanceByDom(host);
  return chart?.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor }) ?? null;
}
