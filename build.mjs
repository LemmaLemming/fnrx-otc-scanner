import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, 'dist');
const copy = (source, destination) => cp(resolve(here, source), resolve(target, destination));

await rm(target, { recursive: true, force: true });
await mkdir(resolve(target, 'fonts'), { recursive: true });
await Promise.all([
  copy('index.html', 'index.html'),
  copy('styles.css', 'styles.css'),
  copy('manifest.webmanifest', 'manifest.webmanifest'),
  copy('icon.svg', 'icon.svg'),
  copy('assets/2023_01_01_BCSans-Regular_2f.otf', 'fonts/BCSans-Regular.otf'),
  copy('assets/2023_01_01_BCSans-Bold_2f.otf', 'fonts/BCSans-Bold.otf'),
  copy('assets/LICENSE_OFL.txt', 'fonts/LICENSE_OFL.txt'),
]);
await build({
  entryPoints: [resolve(here, 'src/app.js')],
  outfile: resolve(target, 'app.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  legalComments: 'none',
});
process.stdout.write(`Built the pinned FNRx test app in ${target}\n`);
