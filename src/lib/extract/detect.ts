/**
 * Recognises the `*_extracted.json` report dumps (a PDF text layer: one object
 * with `source_url` and `pages[].text`) and reads the report's meta data.
 */

export interface ExtractPage {
  page_number: number;
  extraction_method?: string;
  text: string;
}

export interface ReportExtract {
  source_url?: string;
  /** The newer extraction names the field `source`. */
  source?: string;
  pages: ExtractPage[];
}

export interface ReportMeta {
  /** Company name as printed in the report header (may change between years). */
  entityName: string;
  entitySeat?: string;
  /** Report year, e.g. "2024". */
  periodId: string;
  sourceUrl?: string;
  title: string;
  extraction: 'text-layer' | 'ocr';
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** True for `{ source_url, pages: [{ text }] }` dumps of the PDF extraction. */
export function looksLikeExtract(json: unknown): json is ReportExtract {
  if (!isRecord(json) || !Array.isArray(json.pages) || json.pages.length === 0) return false;
  return json.pages.every(
    (p) => isRecord(p) && typeof p.text === 'string' && typeof p.page_number === 'number',
  );
}

const COMPANY_LINE = /^.{5,80}(GmbH|AG|KG|e\.?V\.?|GmbH & Co\.?)[,;]?\s*\S+/im;

/**
 * The company as printed in the header, split into name and seat:
 * "Forschungsinstitut für Glas - Keramik GmbH, Höhr-Grenzhausen".
 */
export function findEntity(pages: ExtractPage[]): { name: string; seat?: string } {
  for (const page of pages) {
    for (const line of page.text.split('\n')) {
      const trimmed = line.trim().replace(/\s+/g, ' ');
      if (!/GmbH|AG\b/.test(trimmed)) continue;
      if (/Anhang|Anlage \d|Bilanz|Gewinn|Geschäftsjahr|Handelsregister/i.test(trimmed)) continue;
      if (!COMPANY_LINE.test(trimmed)) continue;
      const cut = trimmed.lastIndexOf(',');
      if (cut > 0) {
        return { name: trimmed.slice(0, cut).trim(), seat: trimmed.slice(cut + 1).trim() };
      }
      return { name: trimmed.replace(/\s*[,;]\s*$/, '') };
    }
  }
  return { name: '' };
}

/** The report year from headlines like "Bilanz zum 31.12.2024" or "Geschäftsjahr 2024". */
export function findPeriodId(pages: ExtractPage[]): string | null {
  const text = pages
    .map((p) => p.text)
    .join('\n')
    .slice(0, 4000);
  const patterns = [
    /Bilanz zum\s+31\.?\s*(?:Dezember|Dec\.?|12\.?)\s*(\d{4})/i,
    /Geschäftsjahr\s+(\d{4})/i,
    /(?:vom|für das Geschäftsjahr)\s+\d{2}\.\d{2}\.(\d{4})/i,
    /zum\s+31\.\s*(?:Dezember|12\.)\s*(\d{4})/i,
    /(20\d{2})/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return match[1];
  }
  return null;
}

/** Period id from the file name, e.g. "...-fgk-2024_extracted.json" -> "2024". */
export function periodFromFileName(name: string): string | null {
  const years = [...name.matchAll(/(?:19|20)\d{2}/g)].map((m) => m[0]);
  return years.length > 0 ? years[years.length - 1] : null;
}

export function readReportMeta(extract: ReportExtract, fileName: string): ReportMeta {
  const periodId = findPeriodId(extract.pages) ?? periodFromFileName(fileName) ?? '';
  const ocr = extract.pages.some((p) => p.extraction_method === 'ocr');
  const entity = findEntity(extract.pages);
  return {
    entityName: entity.name || fileName.replace(/_extracted\.json$/i, ''),
    entitySeat: entity.seat,
    periodId,
    sourceUrl: extract.source_url ?? extract.source,
    title: `Jahresabschluss ${periodId}`,
    extraction: ocr ? 'ocr' : 'text-layer',
  };
}

/** Page texts of one report, lowest page number first. */
export function sortedPages(extract: ReportExtract): ExtractPage[] {
  return [...extract.pages].sort((a, b) => a.page_number - b.page_number);
}

/** Pages whose text matches a headline pattern. */
export function pagesMatching(pages: ExtractPage[], pattern: RegExp): ExtractPage[] {
  return pages.filter((p) => pattern.test(p.text));
}
