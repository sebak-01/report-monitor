import { describe, expect, it } from 'vitest';
import { normalizeEntityName, sameEntity, sameEntityAny } from './entityMatch';

describe('entityMatch', () => {
  it('normalises case, umlauts and separators', () => {
    expect(normalizeEntityName('Muster Technik GmbH')).toBe('mustertechnikgmbh');
    expect(normalizeEntityName('Größe & Ärger GmbH')).toBe('groesseaergergmbh');
    expect(normalizeEntityName('Technologie-Institut für Metall und Engineering GmbH')).toBe(
      'technologieinstitutfuermetallundengineeringgmbh',
    );
  });

  it('matches names that only differ in hyphenation, spacing or case', () => {
    expect(sameEntity('Technologie-Institut für Metall und Engineering GmbH', 'Technologieinstitut für Metall und Engineering GmbH')).toBe(true);
    expect(sameEntity('Forschungsinstitut für Glas - Keramik GmbH', 'Forschungsinstitut für Glas-Keramik GmbH')).toBe(true);
    expect(sameEntity('ifos Institut', 'IFOS INSTITUT')).toBe(true);
    expect(sameEntity('ifos Institut', 'TIME')).toBe(false);
  });

  it('never matches empty names', () => {
    expect(sameEntity('', '')).toBe(false);
    expect(sameEntityAny('', ['', ' '])).toBe(false);
  });

  it('matches against any known name', () => {
    expect(sameEntityAny('Technologieinstitut für Metall und Engineering GmbH', ['Unbekannt GmbH', 'Technologie-Institut für Metall und Engineering GmbH'])).toBe(true);
    expect(sameEntityAny('andere GmbH', ['Unbekannt GmbH', 'Technologie-Institut für Metall und Engineering GmbH'])).toBe(false);
  });
});
