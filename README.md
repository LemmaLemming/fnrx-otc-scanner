# FNRx OTC Scanner

Source for the FNRx OTC Scanner iOS and Android **client test app** (`1.0.0-test.2`). The app scans a package barcode first. If a barcode is unavailable or unmapped, a user can photograph a printed DIN/NPN and confirm the recognized digits, or enter an eight-digit DIN, NPN, or Plan W PIN manually. It looks up the exact identifier in a bundled research copy of the September 2026 Plan W over-the-counter list.

FNRx is an independent prototype, loosely informed by Island Health visual guidance. It is **not** an Island Health, First Nations Health Authority (FNHA), or Province of British Columbia service. A result is not an official eligibility or payment decision. The interface uses BC Sans; the current revision keeps the FNRx mark and uses sharper corners, stronger borders, and higher contrast.

## What this snapshot can answer

The bundled data has **507 eight-digit identifiers** and **289 source-published barcode links** from FNRx research dated 26 September 2026. The official [Plan W OTC list PDF](https://www2.gov.bc.ca/assets/gov/health/health-drug-coverage/pharmacare/plan_w_otc_drug_list.pdf) was labelled “Last update: September 2026” when this snapshot was prepared. [`data-manifest.json`](data-manifest.json) records the list URL, counts, and SHA-256 fingerprints. The source research exports are not part of this public source repository; [`src/catalog.mjs`](src/catalog.mjs) is the reviewed, pinned app dataset.

| App result | Meaning |
| --- | --- |
| **Found on the saved list** | The exact number, or a number reached through a saved barcode association, appears in this research copy. It does not establish a paid claim. |
| **Number not found in the saved list** | The entered eight-digit value is absent from this copy. It does not establish that a person or product is ineligible. |
| **We can't confirm this medicine** | The barcode is unmapped, unsupported, or invalid in this copy. Enter the printed DIN/NPN or ask a pharmacist. |

Many barcodes are still missing. The app makes no live formulary or PharmaNet query. Coverage depends on current eligibility, the exact product, and pharmacy processing. Review the current [BC Plan W guidance](https://www2.gov.bc.ca/gov/content/health/health-drug-coverage/pharmacare-for-bc-residents/who-we-cover/first-nations-health-authority-clients), [official OTC list](https://www2.gov.bc.ca/assets/gov/health/health-drug-coverage/pharmacare/plan_w_otc_drug_list.pdf), and [FNHA OTC fact sheet](https://www.fnha.ca/Documents/FNHA-Over-the-Counter-Medications-Fact-Sheet.pdf). A pharmacist must confirm whether a purchase can be covered.

## Build and test

This is a Capacitor 8 app with a bundled web interface. Install Node.js/npm compatible with Capacitor 8. Android builds also require an Android SDK and JDK 21; iOS builds require macOS, Xcode, and CocoaPods. The source repository excludes dependencies, native build caches, and installable test binaries.

```sh
npm ci
npm test
npm run build
```

For an Android 8.0+ debug APK:

```sh
npm run android:apk
# Output: android/app/build/outputs/apk/debug/app-debug.apk
```

For an Apple Silicon iOS simulator build:

```sh
cd ios/App && pod install && cd ../..
npm run ios:simulator
# Output: .build/ios/Build/Products/Debug-iphonesimulator/App.app
```

The Android APK is debug-signed. The iOS command creates a simulator app, not an iPhone IPA or TestFlight release. Installing on a physical iPhone requires Apple signing. Test camera scanning and text recognition on physical devices before relying on them; simulator testing covers navigation and manual lookup only.

Suggested checks:

1. Enter DIN `00000817` and keep its leading zeroes. The saved-list result should identify **ISOPTO TEARS 1%**.
2. Enter `02252813`; it should be found even though this snapshot has no barcode for that identifier.
3. Enter NPN `80025523` and Plan W PIN `11200026`; both should be found. PINs are manual-entry only.
4. Enter `12345678`; the app should say the **number** is not in the saved snapshot, not that coverage is denied.
5. On a physical device, scan UPC `300650402019` (maps to `00000817`) or EAN-13 `9314057021149` (maps to `00158348`). Verify the package name, strength, and form against the result; these mappings have not been checked against current physical packages.
6. Scan an unmapped retail barcode. The app should show an unknown result and offer product-number entry. Confirm all OCR digits before lookup; use manual entry if camera permission is denied or recognition fails.

## Data and privacy

Lookups use bundled data. Identifiers are strings so leading zeroes survive. Barcode lookup accepts 12-, 13-, and 14-digit GTINs with valid check digits. Camera text recognition accepts a single unambiguous eight-digit number next to a `DIN` or `NPN` label, rejects `DIN-HM`, and asks the user to confirm the digits. A pharmacy-provided Plan W PIN must be typed.

No account, personal health number, or profile is requested. The app does not intentionally retain scan history or send scanned codes to an FNRx server. Camera access starts only when the user opens a scan or DIN/NPN photo. Text recognition runs on-device. The app creates a temporary cache image for recognition and attempts to delete it afterward. Opening linked external sources uses the device network connection and those sites' own practices.

Normal builds use the pinned catalog; they do not automatically ingest new research. To regenerate it from **reviewed** external JSON exports of the same schema and expected 507/289 counts, run:

```sh
node scripts/prepare-data.mjs /path/to/reviewed-ledger.json /path/to/reviewed-barcode-lookup.json
```

The script validates identifier and barcode form, catalog membership, counts, and source URL agreement before replacing `src/catalog.mjs` and `data-manifest.json`. Review the resulting diff and provenance before building. If the official list or research counts change, update the script's expected counts as part of a reviewed data refresh. Unverified leads and unresolved products are not bundled.

The automated tests cover exact DIN/NPN/PIN lookup, barcode checksum and mapping, leading zeroes, ambiguous OCR text, unknown results, and stale lookup state. Camera recognition quality and package-to-result agreement still need physical iOS and Android testing.

BC Sans font files are included under the [Open Font License](assets/LICENSE_OFL.txt). This repository does not otherwise grant a software license.
