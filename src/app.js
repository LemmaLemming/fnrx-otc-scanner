import {
  FNHA_FACT_SHEET,
  PLAN_W_SOURCE,
  SNAPSHOT,
  extractDinFromOcr,
  lookupBarcode,
  lookupDin,
  validateDin,
} from './data.mjs';
import { isNativeApp, scanBarcodeNative, captureDinTextNative } from './native.mjs';
import { clearLookupState, shouldStartFreshManualEntry } from './flow.mjs';

const root = document.getElementById('app');
const state = {
  route: 'home',
  mode: 'barcode',
  cameraStream: null,
  cameraPending: false,
  cameraError: null,
  detector: null,
  barcodeUnavailable: false,
  scanTimer: 0,
  lastDetectionAt: 0,
  scanning: false,
  torchOn: false,
  dinDraft: '',
  detectedDin: null,
  detectionMethod: null,
  lastBarcode: null,
  result: null,
  statusMessage: '',
  nativeRequestId: 0,
  lookupError: null,
};

const icons = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  camera: '<path d="M4 7h3l2-2h6l2 2h3v12H4z"/><circle cx="12" cy="13" r="3.2"/>',
  scan: '<path d="M4 9V5a1 1 0 0 1 1-1h4m6 0h4a1 1 0 0 1 1 1v4M4 15v4a1 1 0 0 0 1 1h4m6 0h4a1 1 0 0 0 1-1v-4"/><path d="M7 12h10"/>',
  keyboard: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M8 16h8"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/>',
  alert: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 9v5m0 3h.01"/>',
  close: '<path d="M6 6 18 18M18 6 6 18"/>',
  flash: '<path d="m13 2-8 11h6l-1 9 9-12h-6l1-8Z"/>',
  shield: '<path d="M12 2 4 5v6c0 5 3 8 8 11 5-3 8-6 8-11V5l-8-3Z"/><path d="m9 12 2 2 4-4"/>',
  person: '<circle cx="12" cy="8" r="3"/><path d="M5 20v-2a7 7 0 0 1 14 0v2"/>',
  home: '<path d="m3 11 9-8 9 8v9H3v-9Z"/><path d="M9 20v-6h6v6"/>',
  link: '<path d="M10 14 14 10M8 16H6a4 4 0 0 1 0-8h3m7 0h2a4 4 0 0 1 0 8h-3"/>',
  refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.8 9A7 7 0 0 1 18 7l2 5M4 12l2 5a7 7 0 0 0 12.2-2"/>',
};

function icon(name, size = 24) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function button(label, action, kind = 'primary', extra = '') {
  return `<button class="button button-${kind}" type="button" data-action="${action}">${label}${extra}</button>`;
}

function header(back = null) {
  return `<header class="app-header">
    <div class="header-left">${back ? `<button class="icon-button back-button" type="button" data-action="${back}" aria-label="Go back">${icon('back')}</button>` : ''}
      <div class="brand" aria-label="FNRx"><span class="brand-symbol" aria-hidden="true"><span></span><span></span><span></span><span></span></span><span>FN<span>R</span>x</span></div>
    </div>
    <span class="preview-pill"><span class="preview-dot"></span>Test build</span>
  </header>`;
}

function nav() {
  const active = state.route === 'home' ? 'home' : ['rationale', 'scanner', 'manual', 'confirm', 'result', 'unidentified', 'unavailable', 'camera-off', 'pharmacist'].includes(state.route) ? 'scan' : 'about';
  return `<nav class="bottom-nav" aria-label="Main navigation">
    <button type="button" data-action="home" class="nav-item ${active === 'home' ? 'active' : ''}" ${active === 'home' ? 'aria-current="page"' : ''}>${icon('home', 22)}<span>Home</span></button>
    <button type="button" data-action="scan" class="nav-item ${active === 'scan' ? 'active' : ''}" ${active === 'scan' ? 'aria-current="page"' : ''}>${icon('scan', 22)}<span>Scan</span></button>
    <button type="button" data-action="about" class="nav-item ${active === 'about' ? 'active' : ''}" ${active === 'about' ? 'aria-current="page"' : ''}>${icon('info', 22)}<span>About</span></button>
  </nav>`;
}

function wrap(content, back = null, className = '') {
  return `<div class="app-shell"><div class="app-surface ${className}">${header(back)}<main id="main" class="screen-content" tabindex="-1">${content}</main>${nav()}</div><div class="desktop-caption" aria-hidden="true"><span>FNRx</span><strong>A clearer way to start the conversation.</strong><p>Independent, accessible OTC lookup preview.</p></div></div>`;
}

function heading(kicker, title, description = '') {
  return `<div class="page-heading"><p class="eyebrow">${kicker}</p><h1>${title}</h1>${description ? `<p class="lead">${description}</p>` : ''}</div>`;
}

function renderHome() {
  return wrap(`<section class="home-hero">
      <div class="home-hero-copy"><p class="eyebrow eyebrow-on-dark">PLAN W OTC LOOKUP</p><h1>Know what to ask at the pharmacy.</h1><p>Scan a medicine’s barcode or enter its product number to check the saved list snapshot.</p></div>
      <div class="hero-art" aria-hidden="true"><div class="hero-glow"></div><div class="hero-scan"><span></span><span></span><span></span><span></span><div class="hero-package"><b>FNRx</b><small>OTC package</small><i></i><em>CHECK THE LABEL</em></div></div></div>
    </section>
    <section class="home-actions" aria-label="Start checking">
      ${button(`${icon('scan')}<span>Scan barcode</span>`, 'scan', 'primary', icon('arrow', 20))}
      ${button(`${icon('keyboard')}<span>Enter an eight-digit number</span>`, 'manual', 'secondary', icon('arrow', 20))}
    </section>
    <section class="steps-section"><h2>How it works</h2><div class="step-list">
      <div class="step"><span class="step-num">1</span><div><strong>Identify the package</strong><p>Start with the barcode. Use the printed DIN or NPN when a barcode cannot be matched.</p></div></div>
      <div class="step"><span class="step-num">2</span><div><strong>Check the saved list</strong><p>See whether the exact product number or mapped barcode appears in this research snapshot.</p></div></div>
      <div class="step"><span class="step-num">3</span><div><strong>Speak with a pharmacist</strong><p>They can confirm coverage requirements and next steps.</p></div></div>
    </div></section>
    <div class="notice-card small-notice">${icon('info', 20)}<p><strong>Client test build · ${esc(SNAPSHOT.listLabel)}.</strong> The saved catalog has ${esc(SNAPSHOT.catalogCount)} entries and ${esc(SNAPSHOT.barcodeCount)} barcode links. Results are informational; a pharmacist confirms current benefits.</p></div>`, null, 'home-screen');
}

function renderRationale() {
  return wrap(`${heading('CAMERA ACCESS', 'Point your camera at the package.', 'The barcode is the fastest starting point. If it cannot be linked to a listed product, you can read a DIN or NPN, or type a product number instead.')}
    <div class="camera-illustration" aria-hidden="true"><div class="camera-illustration-frame">${icon('scan', 86)}</div><div class="camera-illustration-card"><span></span><span></span><span></span><span></span></div></div>
    <div class="info-list"><div>${icon('camera', 22)}<p>Camera access starts only after you tap Continue.</p></div><div>${icon('shield', 22)}<p>No sign-in, personal health number, or scan history is needed.</p></div></div>
    <div class="sticky-actions">${button(isNativeApp() ? 'Open barcode scanner' : 'Continue to camera', 'start-camera', 'primary', icon('arrow', 20))}${button('Enter product number', 'manual', 'secondary')}</div>`, 'home');
}

function scannerStatus() {
  if (state.cameraPending) return 'Opening camera…';
  if (isNativeApp()) return state.statusMessage || (state.mode === 'barcode' ? 'Open the scanner and centre the package barcode.' : 'Photograph the printed DIN or NPN. You will confirm all eight digits before lookup.');
  if (state.cameraStream) {
    if (state.mode === 'barcode' && (!('BarcodeDetector' in window) || state.barcodeUnavailable)) return 'Camera ready. Live UPC/EAN reading is unavailable in this browser.';
    if (state.mode === 'din' && !('TextDetector' in window)) return 'Camera ready. DIN/NPN text reading is unavailable in this browser.';
    return state.statusMessage || (state.mode === 'barcode' ? 'Hold the barcode inside the frame.' : 'Keep the printed DIN or NPN steady inside the frame.');
  }
  return 'Camera not started.';
}

function renderScanner() {
  const dinMode = state.mode === 'din';
  return wrap(`${heading(dinMode ? 'NUMBER CAMERA' : 'BARCODE CAMERA', dinMode ? 'Read the DIN or NPN on the label.' : 'Scan the package barcode.', dinMode ? 'Look for “DIN” or “NPN” followed by eight digits. DIN-HM is a different identifier.' : 'A barcode identifies a product only when it has a usable mapping. It does not establish coverage.')}
    <div class="mode-control" role="group" aria-label="Scan mode"><button type="button" class="${!dinMode ? 'selected' : ''}" data-action="mode-barcode" aria-pressed="${!dinMode}">${icon('scan', 20)} Barcode</button><button type="button" class="${dinMode ? 'selected' : ''}" data-action="mode-din" aria-pressed="${dinMode}">${icon('keyboard', 20)} DIN/NPN</button></div>
    ${isNativeApp() ? `<div class="viewfinder native-viewfinder" aria-label="${dinMode ? 'DIN/NPN camera guidance' : 'Barcode camera guidance'}"><div class="native-viewfinder-icon">${icon(dinMode ? 'camera' : 'scan', 58)}</div><strong>${dinMode ? 'Read the printed DIN or NPN' : 'Scan the package barcode'}</strong><span>The device camera opens when you tap below.</span></div>` : `<div class="viewfinder ${state.cameraStream ? 'live' : ''}"><video id="camera-video" autoplay playsinline muted aria-label="Live camera preview"></video><div class="viewfinder-shade"></div><div class="reticle ${dinMode ? 'reticle-din' : ''}" aria-hidden="true"><i></i><i></i><i></i><i></i>${dinMode ? '<span>DIN / NPN  ••••••••</span>' : '<div class="barcode-lines"></div>'}</div><span class="camera-chip">${state.cameraStream ? '<span class="live-dot"></span> LIVE CAMERA' : 'CAMERA PREVIEW'}</span></div>`}
    <p class="scan-status" role="status" aria-live="polite">${esc(scannerStatus())}</p>
    <div class="scanner-actions ${isNativeApp() ? 'native-scanner-actions' : ''}">
      ${dinMode ? button(`${icon('camera')}<span>Read DIN or NPN</span>`, 'capture-din', 'primary') : isNativeApp() ? button(`${icon('scan')}<span>Open barcode scanner</span>`, 'start-camera', 'primary') : button(`${icon('flash', 20)}<span>${state.torchOn ? 'Flash off' : 'Flashlight'}</span>`, 'torch', 'secondary')}
      ${button(`${icon('keyboard', 20)}<span>Enter product number</span>`, 'manual', 'secondary')}
    </div>
    <div class="demo-panel"><span class="demo-icon">${icon('info', 18)}</span><div><strong>Saved research snapshot</strong><p>Some retail barcodes are not yet mapped. If a scan cannot identify the product, use its DIN or NPN, or ask a pharmacist.</p></div></div>
    <canvas id="ocr-canvas" hidden></canvas>`, 'rationale', 'scanner-screen');
}

function renderManual() {
  return wrap(`${heading('MANUAL LOOKUP', 'Enter a product number.', 'Use the eight-digit DIN or NPN on the package, or a Plan W PIN provided by the pharmacy. Keep leading zeroes.')}
    <form id="din-form" novalidate><label class="field-label" for="din-input">DIN, NPN or Plan W PIN</label><div class="din-field-wrap"><span>No.</span><input id="din-input" name="din" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="00000000" value="${esc(state.dinDraft)}" aria-describedby="din-help din-error" /></div><div class="field-meta"><p id="din-help">Exactly eight digits, without the prefix. Do not use DIN-HM.</p><span id="din-count">${state.dinDraft.length}/8</span></div><p class="field-error" id="din-error" role="alert"></p><div class="sticky-actions"><button class="button button-primary" type="submit">Check this number ${icon('arrow', 20)}</button>${button('Scan instead', 'scan', 'secondary')}</div></form>
    <div class="notice-card">${icon('shield', 20)}<p>No sign-in, patient number, or health details are needed for this product lookup preview.</p></div>`, 'home');
}

function renderConfirm() {
  return wrap(`${heading('CONFIRM DETAILS', 'Is this the number on the package?', 'Camera text can be misread. Compare all eight digits before continuing.')}
    <div class="confirmation-card"><p>Detected DIN/NPN</p><strong class="din-display">${esc(state.detectedDin)}</strong><span class="method-tag">Camera text recognition · please verify</span></div>
    <div class="notice-card attention">${icon('alert', 20)}<p>This is a number-format check, not a product or coverage decision.</p></div>
    <div class="sticky-actions">${button('Yes, check this number', 'confirm-din', 'primary', icon('arrow', 20))}${button('Edit the digits', 'edit-din', 'secondary')}${button('Scan again', 'rescan', 'ghost')}</div>`, 'scanner');
}

function productCard(result) {
  return `<section class="product-card"><div class="product-topline"><span>PRODUCT DETAILS</span><span class="example-tag">SAVED LIST</span></div><h2>${esc(result.productName || 'Product name unavailable')}</h2><div class="details-grid"><div><span>Product number</span><strong>${esc(result.din || '—')}</strong></div><div><span>Strength</span><strong>${esc(result.strength || '—')}</strong></div><div><span>Form</span><strong>${esc(result.dosageForm || '—')}</strong></div><div><span>Ingredient</span><strong>${esc(result.ingredient || '—')}</strong></div>${result.manufacturer ? `<div class="detail-span"><span>Manufacturer</span><strong>${esc(result.manufacturer)}</strong></div>` : ''}</div></section>`;
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}

function sourceBlock(result = null) {
  const sourceLinks = (result?.sources || []).slice(0, 3).map((source) => {
    const url = safeExternalUrl(source.url);
    return url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(source.title || 'Product evidence')} ${icon('link', 16)}</a>` : '';
  }).join('');
  return `<div class="source-block"><p class="source-label">SOURCE &amp; LIMITATIONS</p><p>Checked against the ${esc(SNAPSHOT.listLabel)} (${esc(SNAPSHOT.catalogCount)} entries). This is a saved research copy, not a live benefits check. List content and individual coverage can change.</p>${result?.mappingProvenance ? `<p>Identification: ${esc(result.mappingProvenance)}</p>` : ''}<a href="${esc(PLAN_W_SOURCE)}" target="_blank" rel="noopener noreferrer">Open BC Plan W OTC list ${icon('link', 16)}</a>${sourceLinks}</div>`;
}

function renderResult() {
  const result = state.result;
  if (result?.planWListStatus === 'listed') {
    return wrap(`<div class="status-hero status-listed"><span class="status-icon">${icon('check', 28)}</span><p class="eyebrow">${esc(SNAPSHOT.listLabel).toUpperCase()}</p><h1>Found on the saved Plan W OTC list.</h1><p>${result.barcode ? 'This barcode has a research link to a listed product number. Check that the package name, strength, and form agree.' : 'This exact product number appears in the saved list. Check that the package name, strength, and form agree.'} A list match is not a coverage decision.</p></div>
      ${productCard(result)}
      <div class="guidance-card"><span>${icon('info', 22)}</span><div><h2>Ask the pharmacist</h2><p>Coverage requires a practitioner prescription or pharmacist recommendation and confirmation of benefits at the pharmacy. Self-selected OTC purchases are not covered.</p></div></div>
      <div class="stack-actions">${button(`${icon('person', 20)}<span>Show a pharmacist</span>`, 'pharmacist', 'primary', icon('arrow', 20))}${button('Check another medicine', 'scan', 'secondary')}</div>
      ${sourceBlock(result)}`, 'home', 'result-screen');
  }
  if (result?.planWListStatus === 'not_listed') {
    return wrap(`<div class="status-hero status-unknown"><span class="status-icon">${icon('info', 28)}</span><p class="eyebrow">${esc(SNAPSHOT.listLabel).toUpperCase()}</p><h1>Number not found in the saved list.</h1><p>This eight-digit product number does not appear in the local Plan W OTC research snapshot. It does not rule out a current list change or another benefit.</p></div>
      <div class="mini-detail"><span>Number checked</span><strong>${esc(result.din || '—')}</strong></div>
      <div class="guidance-card"><span>${icon('info', 22)}</span><div><h2>Confirm at the pharmacy</h2><p>Ask a pharmacist to check the current list and benefits for this exact product. Another strength or form may have a different identifier.</p></div></div>
      <div class="stack-actions">${button('Show a pharmacist', 'pharmacist', 'primary')}${button('Check another number', 'manual', 'secondary')}</div>${sourceBlock(result)}`, 'manual', 'result-screen');
  }
  return wrap(`<div class="status-hero status-unknown"><span class="status-icon">${icon('alert', 28)}</span><p class="eyebrow">NO LIST RESULT</p><h1>We can’t confirm this medicine.</h1><p>The package could not be identified reliably from this input. This is not a decision about coverage.</p></div>
    ${result?.barcode ? `<div class="mini-detail"><span>Barcode scanned</span><strong>${esc(result.barcode)}</strong></div>` : ''}
    <div class="guidance-card"><span>${icon('info', 22)}</span><div><h2>Try the printed DIN or NPN</h2><p>Read or enter the eight-digit DIN or NPN printed on the package, or ask a pharmacist to verify the exact product.</p></div></div>
    <div class="stack-actions">${button('Enter product number', 'manual', 'primary')}${button('Show a pharmacist', 'pharmacist', 'secondary')}</div>${sourceBlock(result)}`, 'manual', 'result-screen');
}

function renderUnidentified() {
  return wrap(`<div class="state-illustration state-unknown-icon">${icon('scan', 56)}</div>${heading('BARCODE NOT IDENTIFIED', 'We could not confirm this product.', 'This barcode has no unambiguous product link in the saved research snapshot. That is not a coverage decision.')}
    ${state.lastBarcode ? `<div class="mini-detail"><span>Scanned barcode</span><strong>${esc(state.lastBarcode)}</strong></div>` : ''}
    <div class="notice-card attention">${icon('alert', 20)}<p>Try the eight-digit DIN or NPN printed on the package. A pharmacist can also check a Plan W PIN.</p></div>
    <div class="sticky-actions">${button('Read DIN or NPN', 'din-camera', 'primary')}${button('Enter product number', 'manual', 'secondary')}${button('Scan another barcode', 'scan-barcode-again', 'ghost')}</div>`, 'scanner');
}

function renderUnavailable() {
  return wrap(`<div class="state-illustration">${icon('refresh', 56)}</div>${heading('LOOKUP UNAVAILABLE', 'We could not check the saved list.', 'The local research snapshot could not be read. No list result has been produced.')}
    ${state.lookupError ? `<div class="notice-card attention">${icon('alert', 20)}<p>${esc(state.lookupError)}</p></div>` : ''}
    <div class="sticky-actions">${button('Return to start', 'home', 'primary')}${button('Enter product number', 'manual', 'secondary')}</div>`, 'about');
}

function renderCameraOff() {
  return wrap(`<div class="state-illustration">${icon('camera', 56)}</div>${heading('CAMERA UNAVAILABLE', 'The camera did not open.', 'Check camera permission in device settings and try again, or enter the DIN or NPN from the package.')}
    ${state.cameraError ? `<div class="notice-card attention">${icon('alert', 20)}<p>${esc(state.cameraError)}</p></div>` : ''}
    <div class="sticky-actions">${button('Try camera again', 'start-camera', 'primary')}${button('Enter product number', 'manual', 'secondary')}</div>`, 'rationale');
}

function renderPharmacist() {
  const result = state.result;
  return wrap(`${heading('PHARMACIST CONVERSATION', 'Show this at the pharmacy.', 'This is information for a conversation, not a prescription, recommendation, claim, or guarantee of payment.')}
    ${result?.productName ? productCard(result) : result?.din ? `<div class="mini-detail"><span>Number checked</span><strong>${esc(result.din)}</strong></div>` : result?.barcode ? `<div class="mini-detail"><span>Barcode scanned</span><strong>${esc(result.barcode)}</strong></div>` : ''}
    <div class="pharmacist-card"><div class="person-badge">${icon('person', 26)}</div><p class="question-label">A QUESTION YOU CAN ASK</p><blockquote>“Could you check this exact product under Plan W OTC and tell me whether a recommendation or prescription is needed?”</blockquote></div>
    <div class="notice-card"><span>${icon('shield', 20)}</span><p>The pharmacist checks current benefits and rules. FNRx does not send this screen to a pharmacy.</p></div>
    <div class="stack-actions">${button('Check another medicine', 'scan', 'primary')}${button('Back to result', 'result', 'secondary')}</div>`, 'result');
}

function renderAbout() {
  return wrap(`${heading('ABOUT FNRx', 'A small step toward a clearer answer.', 'FNRx is an independent client test app inspired by a 2025 health hackathon project.')}
    <div class="about-card about-primary"><span class="about-icon">${icon('shield', 25)}</span><h2>Independent by design</h2><p>FNRx grew from Island Health’s Code Hack 2025. This is an independent FNRx test build, not an Island Health or FNHA service.</p></div>
    <section class="about-section"><h2>About Plan W</h2><p>Plan W offers eligible First Nations residents of BC coverage for certain health benefits. For listed over-the-counter medicines, a practitioner prescription or pharmacist recommendation and pharmacy confirmation are required. A product on a list does not guarantee a paid claim.</p><a href="${FNHA_FACT_SHEET}" target="_blank" rel="noopener noreferrer">Read the FNHA OTC fact sheet ${icon('link', 16)}</a></section>
    <section class="about-section"><h2>What this test app can do</h2><ul><li>Scan a retail barcode and check it against ${esc(SNAPSHOT.barcodeCount)} saved research links.</li><li>Read a DIN or NPN from a photo and ask you to verify all eight digits, or let you type a DIN, NPN or Plan W PIN.</li><li>Check the ${esc(SNAPSHOT.catalogCount)}-entry ${esc(SNAPSHOT.listLabel)}.</li></ul><p>Barcode links are incomplete and may not establish the printed product number. This build does not check live benefits, request personal health details, or keep scan history.</p></section>
    <section class="about-section sources"><h2>Sources</h2><a href="${PLAN_W_SOURCE}" target="_blank" rel="noopener noreferrer">BC Plan W OTC list ${icon('link', 16)}</a><a href="${FNHA_FACT_SHEET}" target="_blank" rel="noopener noreferrer">FNHA OTC medications fact sheet ${icon('link', 16)}</a></section>`, 'home');
}

function render() {
  const screens = {
    home: renderHome,
    rationale: renderRationale,
    scanner: renderScanner,
    manual: renderManual,
    confirm: renderConfirm,
    result: renderResult,
    unidentified: renderUnidentified,
    unavailable: renderUnavailable,
    'camera-off': renderCameraOff,
    pharmacist: renderPharmacist,
    about: renderAbout,
  };
  root.innerHTML = screens[state.route]();
  if (state.route === 'scanner' && state.cameraStream) {
    const video = document.getElementById('camera-video');
    video.srcObject = state.cameraStream;
    video.play().catch(() => {});
  }
}

function stopCamera() {
  if (state.scanTimer) cancelAnimationFrame(state.scanTimer);
  state.scanTimer = 0;
  state.scanning = false;
  if (state.cameraStream) {
    for (const track of state.cameraStream.getTracks()) track.stop();
  }
  state.cameraStream = null;
  state.detector = null;
  state.barcodeUnavailable = false;
  state.torchOn = false;
}

function navigate(route) {
  if (state.route === 'scanner' && route !== 'scanner') {
    stopCamera();
    state.nativeRequestId += 1;
  }
  state.route = route;
  state.statusMessage = '';
  render();
  document.querySelector('.app-surface')?.scrollTo({ top: 0, behavior: 'auto' });
  window.scrollTo({ top: 0, behavior: 'auto' });
  document.getElementById('main')?.focus({ preventScroll: true });
}

function checkBarcode(barcode) {
  state.lastBarcode = String(barcode);
  try {
    state.result = lookupBarcode(state.lastBarcode);
    navigate(state.result.planWListStatus === 'unknown' ? 'unidentified' : 'result');
  } catch {
    state.lookupError = 'The saved barcode catalog could not be read. No list result has been produced.';
    navigate('unavailable');
  }
}

async function startCamera() {
  stopCamera();
  state.cameraPending = true;
  state.cameraError = null;
  navigate('scanner');
  if (isNativeApp()) {
    if (state.mode === 'din') {
      await captureDin();
      return;
    }
    const requestId = ++state.nativeRequestId;
    try {
      const barcode = await scanBarcodeNative();
      if (requestId !== state.nativeRequestId || state.route !== 'scanner') return;
      state.cameraPending = false;
      if (!barcode) {
        state.statusMessage = 'Scan cancelled. Try again or enter a product number.';
        render();
        return;
      }
      checkBarcode(barcode);
    } catch (error) {
      if (requestId !== state.nativeRequestId || state.route !== 'scanner') return;
      state.cameraPending = false;
      if (/cancel/i.test(String(error?.message || ''))) {
        state.statusMessage = 'Scan cancelled. Try again or enter a product number.';
        render();
        return;
      }
      state.cameraError = 'The barcode scanner could not open. Check camera permission and try again.';
      navigate('camera-off');
    }
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    state.cameraPending = false;
    state.cameraError = 'This browser does not provide camera access here. Use a secure connection or enter a product number.';
    navigate('camera-off');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    if (state.route !== 'scanner') {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    state.cameraStream = stream;
    state.cameraPending = false;
    render();
    const video = document.getElementById('camera-video');
    video.srcObject = stream;
    await video.play();
    scheduleScan();
  } catch (error) {
    state.cameraPending = false;
    state.cameraError = error?.name === 'NotAllowedError' ? 'Camera permission was declined. You can change it in your browser settings.' : 'Camera access is unavailable on this device or browser.';
    navigate('camera-off');
  }
}

function scheduleScan() {
  if (!state.cameraStream || state.route !== 'scanner') return;
  state.scanTimer = requestAnimationFrame(scanFrame);
}

async function scanFrame(now) {
  if (!state.cameraStream || state.route !== 'scanner') return;
  if (state.mode === 'barcode' && 'BarcodeDetector' in window && !state.barcodeUnavailable && !state.scanning && now - state.lastDetectionAt > 350) {
    state.lastDetectionAt = now;
    state.scanning = true;
    try {
      if (!state.detector) {
        const retailFormats = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
        const supported = BarcodeDetector.getSupportedFormats ? await BarcodeDetector.getSupportedFormats() : retailFormats;
        const formats = retailFormats.filter((format) => supported.includes(format));
        if (!formats.length) throw new Error('UPC/EAN formats unavailable');
        state.detector = new BarcodeDetector({ formats });
      }
      const found = await state.detector.detect(document.getElementById('camera-video'));
      const retailCode = found.find((code) => ['ean_13', 'ean_8', 'upc_a', 'upc_e'].includes(code.format));
      if (retailCode && state.route === 'scanner') {
        checkBarcode(retailCode.rawValue);
        return;
      }
    } catch {
      state.barcodeUnavailable = true;
      state.statusMessage = 'Live UPC/EAN reading is unavailable. You can enter a product number instead.';
      const status = document.querySelector('.scan-status');
      if (status) status.textContent = state.statusMessage;
    } finally {
      state.scanning = false;
    }
  }
  scheduleScan();
}

async function captureDin() {
  if (isNativeApp()) {
    const requestId = ++state.nativeRequestId;
    state.cameraPending = true;
    render();
    try {
      const text = await captureDinTextNative();
      if (requestId !== state.nativeRequestId || state.route !== 'scanner') return;
      state.cameraPending = false;
      if (!text) {
        state.statusMessage = 'Photo cancelled. Try again or type the DIN or NPN.';
        render();
        return;
      }
      const din = extractDinFromOcr([text]);
      if (!din) {
        state.statusMessage = 'No clear eight-digit DIN or NPN was found. Try another photo or enter it manually.';
        render();
        return;
      }
      state.detectedDin = din;
      state.detectionMethod = 'camera';
      state.dinDraft = din;
      navigate('confirm');
    } catch (error) {
      if (requestId !== state.nativeRequestId || state.route !== 'scanner') return;
      state.cameraPending = false;
      if (/permission|denied|unauthoriz/i.test(String(error?.message || ''))) {
        state.cameraError = 'Camera access was declined. You can enable it in device settings.';
        navigate('camera-off');
        return;
      }
      state.statusMessage = 'DIN/NPN text reading did not complete. Please try again or enter the number.';
      render();
    }
    return;
  }
  if (!state.cameraStream) {
    state.statusMessage = 'Open the camera first, or enter a product number.';
    render();
    return;
  }
  if (!('TextDetector' in window)) {
    state.statusMessage = 'DIN/NPN text recognition is not available in this browser. Enter the number manually.';
    render();
    return;
  }
  const video = document.getElementById('camera-video');
  const canvas = document.getElementById('ocr-canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  try {
    const blocks = await new TextDetector().detect(canvas);
    const din = extractDinFromOcr(blocks);
    if (!din) {
      state.statusMessage = 'No clear eight-digit DIN or NPN was found. Hold the label steady or enter it manually.';
      render();
      return;
    }
    state.detectedDin = din;
    state.detectionMethod = 'camera';
    state.dinDraft = din;
    navigate('confirm');
  } catch {
    state.statusMessage = 'DIN/NPN text reading did not complete. Please enter the number.';
    render();
  }
}

function checkDin(din) {
  state.dinDraft = din;
  try {
    state.result = lookupDin(din);
    navigate('result');
  } catch {
    state.lookupError = 'The saved catalog could not be read. No coverage conclusion has been made.';
    navigate('unavailable');
  }
}

root.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  switch (action) {
    case 'home': clearLookupState(state); navigate('home'); break;
    case 'about': navigate('about'); break;
    case 'scan': clearLookupState(state); state.mode = 'barcode'; navigate('rationale'); break;
    case 'manual': if (shouldStartFreshManualEntry(state.route) || ['unidentified', 'camera-off', 'unavailable'].includes(state.route)) clearLookupState(state); navigate('manual'); break;
    case 'start-camera': await startCamera(); break;
    case 'din-camera': state.mode = 'din'; await startCamera(); break;
    case 'mode-barcode': state.mode = 'barcode'; render(); break;
    case 'mode-din': state.mode = 'din'; render(); break;
    case 'capture-din': await captureDin(); break;
    case 'scan-barcode-again': state.mode = 'barcode'; await startCamera(); break;
    case 'confirm-din': checkDin(state.detectedDin); break;
    case 'edit-din': state.dinDraft = state.detectedDin || state.result?.din || state.dinDraft; navigate('manual'); break;
    case 'rescan': state.mode = 'din'; await startCamera(); break;
    case 'pharmacist': navigate('pharmacist'); break;
    case 'result': navigate('result'); break;
    case 'torch': {
      const track = state.cameraStream?.getVideoTracks()?.[0];
      const capabilities = track?.getCapabilities?.();
      if (capabilities?.torch) {
        try { await track.applyConstraints({ advanced: [{ torch: !state.torchOn }] }); state.torchOn = !state.torchOn; render(); }
        catch { state.statusMessage = 'Flashlight control is unavailable on this device.'; render(); }
      } else { state.statusMessage = 'Flashlight control is unavailable on this device.'; render(); }
      break;
    }
  }
});

root.addEventListener('submit', (event) => {
  if (event.target.id !== 'din-form') return;
  event.preventDefault();
  const input = document.getElementById('din-input');
  const validation = validateDin(input.value);
  if (!validation.valid) {
    input.setAttribute('aria-invalid', 'true');
    document.getElementById('din-error').textContent = validation.message;
    input.focus();
    return;
  }
  state.detectedDin = null;
  checkDin(validation.din);
});

root.addEventListener('input', (event) => {
  if (event.target.id !== 'din-input') return;
  state.dinDraft = event.target.value;
  document.getElementById('din-count').textContent = `${state.dinDraft.length}/8`;
  document.getElementById('din-error').textContent = '';
  event.target.removeAttribute('aria-invalid');
});

window.addEventListener('pagehide', stopCamera);
render();
