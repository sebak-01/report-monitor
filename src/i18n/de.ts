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
    scheduleRows: (n: number) => `${n} Zeilen Anlagespiegel`,
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
    cancel: 'Abbrechen',
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
    amountsInEur: 'Beträge in EUR',
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
    anhangTitle: 'Angaben zur Bilanz',
    anhangSource: 'Anhang, Teil III',
    capitalReserveTitle: 'Entwicklung der Kapitalrücklage',
    specialItemTitle: 'Entwicklung des Sonderpostens für Zuschüsse zum Anlagevermögen',
    rollForward: {
      opening: 'Stand 01.01.',
      addition: 'Zuführung',
      correction: 'Korrektur',
      lossOffset: 'Entnahme / Verrechnung mit dem Verlustvortrag',
      release: 'Auflösung',
      closing: 'Stand 31.12.',
    },
    provisionsTitle: 'Sonstige Rückstellungen',
    provisionsSubtitle:
      'Die Anhangsangabe nennt die wesentlichen Bestandteile in T€; sie ergeben nicht die volle Bilanzsumme der Rückstellungen.',
    provisionsBalance: 'Bilanzwert sonstige Rückstellungen',
    maturityTitle: 'Verbindlichkeitenspiegel',
    maturitySubtitle: (date: string) =>
      `Restlaufzeiten zum 31.12.${date}; Vorjahreswerte in Klammern, Beträge in EUR`,
    maturityColumns: {
      item: 'Verbindlichkeit',
      lt1y: 'Restlaufzeit bis zu 1 Jahr',
      gt1y: 'Restlaufzeit mehr als 1 Jahr',
      gt5y: 'davon mehr als 5 Jahre',
      total: 'Gesamt',
    },
    maturityTotal: 'Summe Verbindlichkeiten',
    maturityUnavailable: 'Für dieses Geschäftsjahr liegt der Verbindlichkeitenspiegel nicht in Euro vor.',
    trendItems: {
      totalAssets: 'Bilanzsumme',
      fixedAssets: 'Anlagevermögen',
      equity: 'Eigenkapital',
      cash: 'Liquide Mittel',
    },
    notesTitle: 'Weitere Angaben',
  },

  income: {
    statementTitle: (date: string) => `Gewinn- und Verlustrechnung für das Geschäftsjahr bis ${date}`,
    statementSubtitle: 'Gesamtkostenverfahren (§ 275 Abs. 2 HGB), Beträge in EUR, wie im Jahresabschluss ausgewiesen (Anlage 2)',
    itemsChartTitle: 'Erträge und Aufwände im Vergleich',
    itemsChartSubtitle: 'in Mio. €; der Jahresfehlbetrag ist als positiver Betrag dargestellt',
    revenueChartTitle: 'Umsatzerlöse nach Tätigkeitsbereichen',
    revenueChartSubtitle: 'in Mio. €',
    anhangTitle: 'Erläuterungen zur Gewinn- und Verlustrechnung',
    anhangSource: 'Anhang, Teil IV',
    revenueTableTitle: 'Zusammensetzung der Umsatzerlöse',
    revenueTotal: 'Umsatzerlöse gesamt',
    regionTitle: 'Umsatzerlöse nach Region',
    domestic: 'Inland',
    foreign: 'Ausland',
    vsPrevious: (previous: string, value: string) => `${previous}: ${value}`,
    priorPeriodTitle: 'Posten aus anderen Geschäftsjahren',
    priorPeriodSubtitle: 'in T€',
    priorIncome: 'In den sonstigen betrieblichen Erträgen enthaltene Erträge aus anderen Geschäftsjahren',
    priorExpenses: 'In den sonstigen betrieblichen Aufwendungen enthaltene Aufwendungen aus anderen Geschäftsjahren',
    priorDetailLead: 'Darunter im Wesentlichen:',
    trendItems: {
      revenue: 'Umsatzerlöse',
      otherIncome: 'Sonstige betriebliche Erträge',
      personnel: 'Personalaufwand',
      netLoss: 'Jahresfehlbetrag',
    },
    notesTitle: 'Weitere Angaben',
  },

  anlagespiegel: {
    title: 'Anlagespiegel',
    subtitle: 'Entwicklung der Anschaffungs- und Herstellungskosten und der Abschreibungen, Beträge in EUR',
    groups: {
      cost: 'Anschaffungs- und Herstellungskosten',
      accdep: 'Abschreibungen',
      book: 'Restbuchwerte',
      other: 'Weitere Spalten',
    },
    tilesLabel: 'Kennzahlen des Anlagevermögens',
    bookValue: 'Restbuchwert',
    additions: 'Zugänge',
    depExpense: 'Abschreibung des Geschäftsjahres',
    missing: 'Für dieses Geschäftsjahr ist kein Anlagespiegel ausgewiesen.',
    trendTitle: 'Restbuchwert der Hauptposten',
    trendSubtitle: 'in Mio. €; die senkrechte Linie markiert das gewählte Geschäftsjahr',
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
