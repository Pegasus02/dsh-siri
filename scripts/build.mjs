import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(resolve(root, 'lib'), { recursive: true });

// Runtime packages the Host already ships; they stay out of the bundle.
const external = ['undici', 'sharp', 'qrcode', 'imapflow', 'mailparser', 'nodemailer']
  .flatMap((name) => [name, `${name}/*`]);

await build({
  entryPoints: [resolve(root, 'plugin-src/host/siri-entry.mjs')],
  bundle: true, format: 'esm', platform: 'node', target: ['node22'],
  mainFields: ['module', 'main'], external,
  outfile: resolve(root, 'lib/index.js'),
  banner: { js: [
    "import { createRequire as __dshCreateRequire } from 'node:module';",
    "import { dirname as __dshDirname } from 'node:path';",
    "import { fileURLToPath as __dshFileURLToPath } from 'node:url';",
    'const require = __dshCreateRequire(import.meta.url);',
    'const __filename = __dshFileURLToPath(import.meta.url);',
    'const __dirname = __dshDirname(__filename);',
  ].join('\n') },
  minify: true, legalComments: 'none', logLevel: 'warning',
});

const client = await build({
  entryPoints: [resolve(root, 'client/index.js')],
  bundle: true, format: 'cjs', platform: 'browser', target: ['chrome100'],
  external: ['react', 'react-dom'], write: false, minify: true, legalComments: 'none',
});
const bundled = client.outputFiles[0].text;
await writeFile(resolve(root, 'lib/client.js'), `window.__ModuleLoader__.load({
  id: "dsh-siri",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
${bundled}
    return module.exports;
  }
});
`, 'utf8');
console.log('Wrote lib/index.js and lib/client.js');
