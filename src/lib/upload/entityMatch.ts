/**
 * Recognises that several uploads belong to the same company. The display name
 * may differ between years ("Technologie-Institut für Metall und Engineering
 * GmbH" vs. "Technologieinstitut für …"), so names are compared normalised.
 */

export function normalizeEntityName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '');
}

export function sameEntity(a: string, b: string): boolean {
  const normalized = normalizeEntityName(a);
  return normalized.length > 0 && normalized === normalizeEntityName(b);
}

/** True when `name` is one of `known` (all normalised). */
export function sameEntityAny(name: string, known: string[]): boolean {
  return known.some((candidate) => sameEntity(name, candidate));
}
