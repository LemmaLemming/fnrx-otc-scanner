export function shouldStartFreshManualEntry(route) {
  return route === 'home' || route === 'result' || route === 'about';
}

export function clearLookupState(state) {
  state.dinDraft = '';
  state.detectedDin = null;
  state.detectionMethod = null;
  state.lastBarcode = null;
  state.result = null;
  state.cameraError = null;
  state.statusMessage = '';
}
