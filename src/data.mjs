import { SNAPSHOT, CATALOG, BARCODE_LOOKUP } from './catalog.mjs';

export { SNAPSHOT };
export const PLAN_W_SOURCE = SNAPSHOT.officialListUrl;
export const FNHA_FACT_SHEET = 'https://www.fnha.ca/Documents/FNHA-Over-the-Counter-Medications-Fact-Sheet.pdf';

export function validateDin(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return { valid: false, message: 'Enter the eight-digit DIN, NPN or Plan W PIN.' };
  if (!/^\d+$/.test(raw)) return { valid: false, message: 'Use the eight digits only, without letters or spaces.' };
  if (raw.length !== 8) return { valid: false, message: 'The product number must have exactly eight digits.' };
  return { valid: true, din: raw };
}

export function extractDinFromOcr(blocks) {
  const text = (Array.isArray(blocks) ? blocks : [blocks])
    .map((block) => typeof block === 'string' ? block : block?.text ?? block?.rawValue ?? '')
    .join(' ').replace(/\s+/g, ' ');
  const candidates = [...text.matchAll(/\b(?:DIN(?!\s*[- ]?HM)|NPN)\b\s*[:#-]?\s*((?:\d[\s-]?){8})\b/gi)]
    .map((match) => match[1].replace(/\D/g, ''));
  const unique = [...new Set(candidates)];
  return unique.length === 1 && validateDin(unique[0]).valid ? unique[0] : null;
}

export function normalizeGtin(value) {
  const code = String(value ?? '').trim();
  if (!/^\d{12,14}$/.test(code)) return null;
  let sum = 0;
  for (let i = code.length - 1, position = 0; i >= 0; i--, position++) {
    sum += Number(code[i]) * (position % 2 ? 3 : 1);
  }
  return sum % 10 === 0 ? code.padStart(14, '0') : null;
}

function listedResult(identifier, input, evidence = null) {
  const product = CATALOG[identifier];
  return {
    identificationStatus: input === 'barcode' ? 'source_published_barcode_match' : 'exact_identifier_match',
    planWListStatus: 'listed',
    din: identifier,
    barcode: evidence?.scannedBarcode,
    productName: product.brandName,
    ingredient: product.chemicalName,
    strength: product.strength,
    dosageForm: product.dosageForm,
    manufacturer: product.manufacturer,
    identifierType: 'Product number',
    mappingProvenance: input === 'barcode'
      ? evidence.hasLiveSource ? 'Source-published barcode association' : 'Dated catalog barcode association; packaging may have changed'
      : 'Exact identifier found in the September 2026 research snapshot',
    sources: evidence?.sources ?? [],
    sourceUrl: PLAN_W_SOURCE,
    sourcePublishedAt: SNAPSHOT.listUpdateLabel,
    sourceRetrievedAt: SNAPSHOT.researchDate,
    isDemo: true,
  };
}

export function lookupDin(value) {
  const result = validateDin(value);
  if (!result.valid) throw new Error(result.message);
  if (CATALOG[result.din]) return listedResult(result.din, 'din');
  return {
    identificationStatus: 'exact_identifier_not_in_snapshot',
    planWListStatus: 'not_listed',
    din: result.din,
    identifierType: 'Product number',
    mappingProvenance: 'This product number was not found in the bundled September 2026 research snapshot; current benefits are not assessed',
    sourceUrl: PLAN_W_SOURCE,
    sourcePublishedAt: SNAPSHOT.listUpdateLabel,
    sourceRetrievedAt: SNAPSHOT.researchDate,
    isDemo: true,
  };
}

export function lookupBarcode(value) {
  const scannedBarcode = String(value ?? '').trim();
  const gtin14 = normalizeGtin(scannedBarcode);
  const evidence = gtin14 && BARCODE_LOOKUP[gtin14];
  if (evidence) return listedResult(evidence.identifier, 'barcode', { ...evidence, scannedBarcode });
  return {
    identificationStatus: gtin14 ? 'unmapped_barcode' : 'invalid_or_unsupported_barcode',
    planWListStatus: 'unknown',
    barcode: scannedBarcode,
    mappingProvenance: gtin14
      ? 'No source-published identifier association in this research snapshot'
      : 'This is not a supported 12-, 13-, or 14-digit retail barcode with a valid check digit',
    sourceUrl: PLAN_W_SOURCE,
    sourceRetrievedAt: SNAPSHOT.researchDate,
    isDemo: true,
  };
}
