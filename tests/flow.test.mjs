import test from 'node:test';
import assert from 'node:assert/strict';
import { clearLookupState, shouldStartFreshManualEntry } from '../src/flow.mjs';

test('starting again from Home or a result clears the previous DIN and result', () => {
  assert.equal(shouldStartFreshManualEntry('home'), true);
  assert.equal(shouldStartFreshManualEntry('result'), true);

  const state = {
    dinDraft: '02252813',
    detectedDin: '02252813',
    detectionMethod: 'simulated',
    lastBarcode: '012345678901',
    result: { planWListStatus: 'listed' },
    cameraError: 'denied',
    statusMessage: 'old status',
  };
  clearLookupState(state);
  assert.equal(state.dinDraft, '');
  assert.equal(state.detectedDin, null);
  assert.equal(state.result, null);
  assert.equal(state.lastBarcode, null);
});

test('Edit DIN and recovery routes are not treated as new manual lookups', () => {
  for (const route of ['confirm', 'scanner', 'camera-off', 'unidentified', 'unavailable']) {
    assert.equal(shouldStartFreshManualEntry(route), false, route);
  }
});
