import { Capacitor, registerPlugin } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } from '@capacitor/barcode-scanner';
import { Script, TextRecognition } from '@capacitor-mlkit/text-recognition';
import { Directory, Filesystem } from '@capacitor/filesystem';

const DinOcr = registerPlugin('DinOcr');

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export async function scanBarcodeNative() {
  if (!isNativeApp()) throw new Error('Native barcode scanning is available in the iOS and Android app.');
  const response = await CapacitorBarcodeScanner.scanBarcode({
    hint: CapacitorBarcodeScannerTypeHint.ALL,
    scanInstructions: 'Hold the retail barcode inside the frame',
    cancelButtonAccessibilityLabel: 'Cancel barcode scan',
    torchButtonOnAccessibilityLabel: 'Turn flashlight off',
    torchButtonOffAccessibilityLabel: 'Turn flashlight on',
  });
  return response?.ScanResult?.trim() || null;
}

export async function captureDinTextNative() {
  if (!isNativeApp()) throw new Error('Native DIN text recognition is available in the iOS and Android app.');
  const photo = await Camera.getPhoto({
    quality: 85,
    source: CameraSource.Camera,
    resultType: CameraResultType.Base64,
    allowEditing: false,
    saveToGallery: false,
    correctOrientation: true,
  });
  if (!photo?.base64String) return null;
  // Own the single OCR input file so it can be removed after recognition.
  const fileName = `din-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const image = await Filesystem.writeFile({
    path: fileName,
    directory: Directory.Cache,
    data: photo.base64String,
  });
  try {
    const result = Capacitor.getPlatform() === 'ios'
      ? await DinOcr.processImage({ path: image.uri })
      : await TextRecognition.processImage({ path: image.uri, script: Script.Latin });
    return result?.text || '';
  } finally {
    try { await Filesystem.deleteFile({ path: fileName, directory: Directory.Cache }); }
    catch { /* The OS may have already removed this temporary cache file. */ }
  }
}
