/**
 * All user-visible strings of the dashboard (German).
 * Code and identifiers stay English; only text shown in the UI lives here.
 * Labels of figures come from the dataset (`labelDe`), not from this file.
 */
import type { ValidationReason } from '../lib/validate';

export const de = {
  appTitle: 'Kennzahlen-Dashboard',
  subtitle: (current: string, previous: string | null) =>
    previous ? `Geschäftsjahr ${current} im Vergleich zu ${previous}` : `Geschäftsjahr ${current}`,
  formerName: (name: string, until: string | null) =>
    until ? `Bis ${until} firmierte die Gesellschaft als ${name}` : `Früherer Name: ${name}`,
  loading: 'Daten werden geladen …',
  renderError: 'Die Darstellung dieses Datensatzes ist gescheitert.',
  empty: {
    title: 'Keine Daten geladen',
    lede: 'Bitte laden Sie einen Jahresabschluss hoch – die Übersicht zeigt dann die Zahlen.',
  },
  source: 'Quelle',
  sourceStatus: {
    manualUnverified: 'Manuell erfasst, nicht unabhängig geprüft',
    manual: 'Manuell erfasst',
    textLayer: 'Aus dem Textteil des PDFs übernommen, nicht unabhängig geprüft',
    upload: 'Hochgeladen, nicht geprüft',
  },

  viewSelect: {
    label: 'Ansicht',
  },

  sourceSelect: {
    label: 'Datenquelle',
  },

  data: {
    cardsLabel: 'Erste Positionen der Tabelle',
    chartTitle: 'Verlauf ausgewählter Positionen',
    chartSubtitle: 'Bis zu vier Positionen; die senkrechte Linie markiert das gewählte Jahr',
    pickSeries: 'Positionen im Diagramm',
    maxSeries: 'Höchstens vier Positionen gleichzeitig',
    tableTitle: 'Alle Positionen',
    noChart: 'Für ein Diagramm braucht es mindestens zwei Jahre.',
    empty: 'Dieser Datensatz enthält keine Positionen.',
    notesTitle: 'Weitere Angaben',
  },

  upload: {
    link: 'Daten hochladen',
    title: 'Daten hochladen',
    back: 'Zurück zum Dashboard',
    intro:
      'CSV-, Excel- (.xlsx) und JSON-Dateien. Die Datei wird nur in Ihrem Browser gelesen und dort gespeichert; es wird nichts übertragen.',
    introMulti:
      'CSV-, Excel- (.xlsx) und JSON-Dateien. Mehrere Berichte (eine Datei je Geschäftsjahr) werden zu einem Datensatz zusammengeführt. Alles bleibt in Ihrem Browser; es wird nichts übertragen.',
    dropTitle: 'Datei hierher ziehen',
    dropTitleMulti: 'Dateien hierher ziehen',
    or: 'oder',
    choose: 'Datei auswählen',
    chooseMulti: 'Dateien auswählen',
    formats: 'CSV, XLSX, JSON · höchstens 15 MB',
    formatsMulti: 'CSV, XLSX, JSON · mehrere Dateien möglich · höchstens 15 MB je Datei',
    oneAtATime:
      'Tabellen und Datensätze werden einzeln übernommen – bitte nur eine davon auswählen. Berichts-Extrakte dürfen mehrere sein.',
    reading: 'Datei wird gelesen …',
    reportsFound: (n: number) => (n === 1 ? 'Bericht erkannt' : `${n} Berichte erkannt`),
    truncated: 'Die Datei hat sehr viele Zeilen; nur die ersten 50.000 wurden gelesen.',
    stepMapping: 'Spalten zuordnen',
    stepPreview: 'Vorschau',
    table: 'Tabelle / Blatt',
    layout: 'Aufbau der Tabelle',
    layoutWide: 'Eine Zeile je Position, eine Spalte je Jahr',
    layoutLong: 'Eine Zeile je Wert (Position, Jahr, Wert)',
    headerRow: 'Kopfzeile',
    labelCol: 'Spalte mit der Bezeichnung',
    periodCol: 'Spalte mit dem Jahr',
    valueCol: 'Spalte mit dem Wert',
    yearCols: 'Jahresspalten',
    yearColsHint: 'Haken setzen und das Geschäftsjahr eintragen, das die Spalte darstellt.',
    yearInput: (col: string) => `Geschäftsjahr der Spalte ${col}`,
    unit: 'Einheit der Werte',
    units: { EUR: 'Euro (€)', TEUR: 'Tausend Euro (T€)', count: 'Anzahl', pct: 'Prozent (%)' },
    numberFormat: 'Zahlenschreibweise',
    formatAuto: (detected: string) => `Automatisch erkennen (erkannt: ${detected})`,
    formatDe: '1.234,56 (deutsch)',
    formatEn: '1,234.56 (englisch)',
    formatDeShort: 'deutsch',
    formatEnShort: 'englisch',
    entityName: 'Name des Unternehmens oder der Datenreihe',
    rawPreview: 'Ausschnitt der Datei',
    rawPreviewHint: 'Die ersten Zeilen und Spalten, so wie sie gelesen wurden.',
    resultTitle: 'So werden die Daten übernommen',
    result: (facts: number, periods: string) => `${facts} Positionen, Geschäftsjahre ${periods}`,
    warnings: 'Hinweise',
    errors: 'Das lässt sich so noch nicht übernehmen',
    import: 'Übernehmen und anzeigen',
    importOverwrite: 'Überschreiben & importieren',
    cancel: 'Abbrechen',
    mergeInto: (name: string) => `Wird der Quelle „${name}“ zugeordnet – die Geschäftsjahre werden zusammengeführt.`,
    mergeAsNewHint: 'Die Berichte werden als eigene Quelle angelegt.',
    mergeAsNew: 'Als eigene Quelle anlegen',
    mergeAssign: 'Zuordnen zu',
    mergeNewSource: 'Neue Quelle',
    duplicateFile: (file: string, source: string) =>
      `Die Datei „${file}“ wurde bereits hochgeladen (Quelle „${source}“). Beim Übernehmen werden die Werte dieses Geschäftsjahres ersetzt.`,
    datasetFound: 'Datensatz erkannt',
    datasetSummary: (facts: number, periods: string, checks: number) =>
      `${facts} Positionen, Geschäftsjahre ${periods}, ${checks} Plausibilitätsprüfungen`,
    checksOk: 'Alle Prüfungen bestanden',
    checksFailed: (n: number) => `${n} Prüfung(en) nicht bestanden – die Daten werden trotzdem übernommen und die Abweichungen angezeigt`,
    saveFailed:
      'Ihr Browser erlaubt kein Speichern. Die Daten sind nur bis zum Schließen dieser Seite verfügbar.',
    storedTitle: 'Geladene Datensätze',
    storedEmpty: 'Noch nichts geladen. Das Dashboard zeigt dann die Übersicht ohne Zahlen.',
    use: 'Anzeigen',
    inUse: 'Wird angezeigt',
    remove: 'Löschen',
    removeLabel: (name: string) => `${name} löschen`,
    loadedOn: (date: string) => `geladen am ${date}`,
    sourceStatus: 'Hochgeladen, nicht geprüft',
    footer: 'Die Zahlen stammen aus Ihrer hochgeladenen Datei und wurden nicht geprüft.',
  },

  periodSelect: {
    label: 'Geschäftsjahr',
  },

  kpi: {
    sectionLabel: 'Wichtigste Kennzahlen',
    totalAssets: 'Bilanzsumme',
    fixedAssets: 'Anlagevermögen',
    equityRatio: 'Eigenkapitalquote',
    cash: 'Liquide Mittel',
    revenue: 'Umsatzerlöse',
    netLoss: 'Jahresfehlbetrag',
    personnel: 'Personalaufwand',
    personnelRatio: 'Personalaufwand im Verhältnis zum Umsatz',
    vsPrevious: (previous: string) => `ggü. ${previous}`,
    unchanged: (previous: string) => `unverändert ggü. ${previous}`,
    tone: {
      good: 'Verbesserung',
      bad: 'Verschlechterung',
      neutral: 'Neutral',
    },
    direction: {
      up: 'gestiegen',
      down: 'gesunken',
      flat: 'unverändert',
    },
  },

  table: {
    position: 'Position',
    eur: 'EUR',
    change: 'Veränderung',
    changeAbs: 'Veränderung in EUR',
    changeRel: 'Veränderung in %',
    expandAll: 'Alle aufklappen',
    collapseAll: 'Alle zuklappen',
    collapse: (label: string) => `${label} zuklappen`,
    expand: (label: string) => `${label} aufklappen`,
    sourcePage: (page: number) => `Seite ${page} im PDF`,
    scrollHint: 'Tabelle seitlich scrollen, falls sie nicht ganz sichtbar ist',
  },

  chart: {
    controls: {
      years: 'Angezeigte Geschäftsjahre',
      from: 'von',
      to: 'bis',
      type: 'Darstellung',
      bar: 'Balken',
      line: 'Linie',
    },
    tableToggle: 'Daten als Tabelle anzeigen',
    tableItem: 'Position',
    tableChange: 'Veränderung',
    trendTitle: 'Entwicklung über die Jahre',
    trendSubtitle: 'in Mio. €; die senkrechte Linie markiert das gewählte Geschäftsjahr',
    change: 'Veränderung',
    share: 'Anteil',
    total: 'Summe',
    axisMio: 'in Mio. €',
    axisTeur: 'in T€',
    ariaLabel: (title: string) => `Diagramm: ${title}. Die Werte stehen auch in der Tabelle darunter.`,
  },

  validation: {
    title: 'Plausibilitätsprüfungen',
    intro:
      'Summen, Fortschreibungen und Bilanzgleichungen werden mit den erfassten Werten nachgerechnet.',
    allPassed: (total: number) => `Alle ${total} Prüfungen bestanden`,
    someFailed: (failed: number, total: number) =>
      `${failed} von ${total} Prüfungen fehlgeschlagen`,
    skippedNote: (skipped: number) => `${skipped} übersprungen (fehlende Werte)`,
    details: 'Einzelne Prüfungen anzeigen',
    columnCheck: 'Prüfung',
    pass: 'bestanden',
    fail: 'Abweichung',
    skipped: 'übersprungen',
    tolerance: (value: string) => `Toleranz: ${value}`,
  },

  redaction: {
    title: 'Im Bericht geschwärzt',
    page: (page: number) => `PDF-Seite ${page}`,
    missingTitle: 'Im Bericht nicht enthalten',
  },

  balance: {
    structureTitle: 'Struktur der Bilanz',
    structureSubtitle: 'Anteile der Hauptposten an der Bilanzsumme, in Mio. €',
    assetsChartTitle: 'Aktiva',
    liabilitiesChartTitle: 'Passiva',
    assetsTable: 'Aktiva',
    liabilitiesTable: 'Passiva',
    statementTitle: (date: string) => `Bilanz zum ${date}`,
    statementSubtitle: 'Beträge in EUR, wie im Jahresabschluss ausgewiesen (Anlage 1)',
    hgbToggle: 'Anzeige nach §266 HGB',
    trendItems: {
      totalAssets: 'Bilanzsumme',
      fixedAssets: 'Anlagevermögen',
      equity: 'Eigenkapital',
      cash: 'Liquide Mittel',
    },
  },

  income: {
    statementTitle: (date: string) => `Gewinn- und Verlustrechnung für das Geschäftsjahr bis ${date}`,
    statementSubtitle: 'Gesamtkostenverfahren (§ 275 Abs. 2 HGB), Beträge in EUR, wie im Jahresabschluss ausgewiesen (Anlage 2)',
    itemsChartTitle: 'Erträge und Aufwände im Vergleich',
    itemsChartSubtitle: 'in Mio. €; der Jahresfehlbetrag ist als positiver Betrag dargestellt',
    trendItems: {
      revenue: 'Umsatzerlöse',
      otherIncome: 'Sonstige betriebliche Erträge',
      personnel: 'Personalaufwand',
      netLoss: 'Jahresfehlbetrag',
    },
  },

  analysis: {
    viewLabel: 'Analyse',
    intro:
      'Kennzahlen, Zeitreihen und Prüfstatus über alle Geschäftsjahre – berechnet aus den Positionen ' +
      'dieses Datensatzes. Es werden keine Daten übertragen.',
    kennzahlenTitle: 'Kennzahlen',
    kennzahlenSubtitle:
      'Werte je Geschäftsjahr. „n/a“ heißt: eine Eingangsposition fehlt im Bericht; die Berechnungsdetails nennen sie.',
    metricColumn: 'Kennzahl',
    calculation: 'Berechnung',
    formulaLabel: 'Formel',
    sourcesLabel: 'Verwendete Positionen',
    inputColumn: 'Position',
    noValue: '–',
    na: 'n/a',
    naTooltip: (missing: string) => `Fehlende Positionen: ${missing}`,
    assumedZero: (keys: string) => `${keys}: nicht ausgewiesen → 0 angesetzt`,
    assumedZeroMark: '0 *',
    timeseriesTitle: 'Zeitreihen',
    timeseriesSubtitle:
      'Beliebige Positionen über alle Geschäftsjahre; die senkrechte Linie markiert das gewählte Geschäftsjahr.',
    pickPositions: 'Positionen',
    groupBalance: 'Bilanz',
    groupIncome: 'Gewinn- und Verlustrechnung',
    maxSeries: 'Höchstens sechs Positionen gleichzeitig',
    mode: 'Darstellung',
    modeAbsolute: 'Absolute Werte',
    modeIndex: 'Index (Basisjahr = 100)',
    modeChange: 'Veränderung zum Vorjahr',
    baseYear: 'Basisjahr',
    tableTitle: 'Veränderung und Wachstum',
    measureColumn: 'Größe',
    valueRow: 'Wert',
    yoyAbs: 'Δ absolut',
    yoyRel: 'Δ in %',
    cagr: 'Ø p. a. (CAGR)',
    axisIndex: 'Index',
    cagrNote:
      'Durchschnittliche jährliche Veränderung über die gesamte Periode; „n/a“ bei nicht positiven Endpunkten.',
    outlierRule: (threshold: number) =>
      `Markiert werden Werte, die um mindestens ${threshold} Standardabweichungen vom Mittelwert der ` +
      'Reihe abweichen (Z-Score über die Werte der Position).',
    outlierMark: (z: string) => `Auffällig: ${z} Standardabweichungen vom Mittelwert der Reihe`,
    noSeries: 'Bitte mindestens eine Position auswählen.',
    checksTitle: 'Prüfstatus',
    checksIntro: 'Bilanzgleichung, Summenbildungen und Vorjahresabgleich über alle Geschäftsjahre.',
    statusGreen: 'Plausibel',
    statusAmber: 'Mit Hinweisen',
    statusRed: 'Abweichungen gefunden',
    findings: 'Befunde anzeigen',
    counts: (passed: number, warned: number, failed: number, skipped: number) =>
      `${passed} ohne Befund · ${warned} Hinweise · ${failed} Abweichungen · ${skipped} nicht prüfbar`,
    severity: {
      pass: 'ohne Befund',
      warn: 'Hinweis',
      fail: 'Abweichung',
      skip: 'nicht prüfbar',
    },
    priorYearUnavailable: 'Vorjahresabgleich nicht möglich (keine Rohberichte zu diesem Datensatz gespeichert).',
    exportTitle: 'Export',
    exportCsv: 'Kennzahlen als CSV herunterladen',
    exportCsvHint: 'Semikolon-getrennt mit Dezimalkomma; für Excel geeignet.',
    exportChart: 'Diagramm als PNG herunterladen',
    exportChartHint: 'Speichert das sichtbare Zeitreihen-Diagramm als Bild.',
    exportNoChart: 'Kein Diagramm zum Speichern vorhanden.',
  },

  footer: {
    note: 'Alle Zahlen stammen aus dem jeweils verlinkten Jahresabschluss; sie wurden maschinell aus den PDFs ausgelesen bzw. von Hand erfasst und sind nicht unabhängig geprüft.',
  },
};

/** Human-readable (German) text for a validation reason code. */
export function reasonText(reason: ValidationReason): string {
  switch (reason.code) {
    case 'missing-key':
      return `Unbekannte Kennzahl: ${reason.detail}`;
    case 'null-value':
      return `Wert fehlt: ${reason.detail}`;
    case 'no-previous-period':
      return 'Kein Vorjahr vorhanden';
    case 'not-finite':
      return 'Ergebnis nicht berechenbar';
    case 'invalid-expression':
      return `Ungültige Formel: ${reason.detail}`;
  }
}
