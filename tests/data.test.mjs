import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SNAPSHOT,
  extractDinFromOcr,
  lookupBarcode,
  lookupDin,
  normalizeGtin,
  validateDin,
} from '../src/data.mjs';

test('pinned snapshot has the reviewed catalog and barcode counts', () => {
  assert.equal(SNAPSHOT.catalogCount, 507);
  assert.equal(SNAPSHOT.barcodeCount, 289);
  assert.equal(SNAPSHOT.listUpdateLabel, 'September 2026');
});

test('product-number entry and DIN/NPN OCR preserve eight-digit identifiers', () => {
  assert.deepEqual(validateDin('00000817'), { valid: true, din: '00000817' });
  assert.deepEqual(validateDin('80025523'), { valid: true, din: '80025523' });
  assert.deepEqual(validateDin('11200026'), { valid: true, din: '11200026' });
  assert.equal(validateDin('817').valid, false);
  assert.equal(validateDin('NPN 00000817').valid, false);
  assert.equal(extractDinFromOcr(['LOT 5221', 'DIN: 0000 0817']), '00000817');
  assert.equal(extractDinFromOcr('NPN 80025523'), '80025523');
  assert.equal(extractDinFromOcr('NPN: 8002 5523'), '80025523');
  assert.equal(extractDinFromOcr('DIN-HM 00000817'), null);
  assert.equal(extractDinFromOcr('DIN-HM 00000817 NPN 80025523'), '80025523');
  assert.equal(extractDinFromOcr('PIN 11200026'), null);
  assert.equal(extractDinFromOcr('DIN 00000817 DIN 02252813'), null);
  assert.equal(extractDinFromOcr('DIN 00000817 NPN 80025523'), null);
});

test('source-published UPC and EAN resolve to exact saved list identifiers', () => {
  const upc = lookupBarcode('300650402019');
  assert.equal(upc.planWListStatus, 'listed');
  assert.equal(upc.din, '00000817');
  assert.equal(upc.productName, 'ISOPTO TEARS 1%');
  assert.ok(upc.sources.some((source) => source.url.startsWith('https://')));

  const ean = lookupBarcode('9314057021149');
  assert.equal(ean.planWListStatus, 'listed');
  assert.equal(ean.din, '00158348');
  assert.equal(normalizeGtin('9314057021149'), '09314057021149');
});

test('listed DIN, NPN and Plan W PIN numbers are accepted without implying eligibility', () => {
  const listed = lookupDin('02252813');
  assert.equal(listed.planWListStatus, 'listed');
  assert.equal(listed.barcode, undefined);
  assert.equal(lookupDin('80025523').planWListStatus, 'listed');
  assert.equal(lookupDin('11200026').planWListStatus, 'listed');
  const miss = lookupDin('12345678');
  assert.equal(miss.planWListStatus, 'not_listed');
  assert.match(miss.mappingProvenance, /current benefits are not assessed/);
});

test('unmapped and malformed barcodes never become negative list decisions', () => {
  const unmapped = lookupBarcode('036000291452');
  assert.equal(unmapped.planWListStatus, 'unknown');
  assert.equal(unmapped.din, undefined);
  assert.equal(unmapped.identificationStatus, 'unmapped_barcode');
  const malformed = lookupBarcode('300650402018');
  assert.equal(malformed.planWListStatus, 'unknown');
  assert.equal(malformed.identificationStatus, 'invalid_or_unsupported_barcode');
});
