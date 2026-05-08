'use strict';

/**
 * iconv-lite must ship with an `encodings/` directory next to `lib/`.
 * If it is missing (corrupt install, partial sync), Express body-parser fails at startup.
 */
const fs = require('fs');
const path = require('path');

let pkgRoot;
try {
  pkgRoot = path.dirname(require.resolve('iconv-lite/package.json'));
} catch (e) {
  console.error('[verify-iconv-lite] iconv-lite is not installed. Run: npm install');
  process.exit(1);
}

const encDir = path.join(pkgRoot, 'encodings');
if (!fs.existsSync(encDir) || !fs.existsSync(path.join(encDir, 'index.js'))) {
  console.error(
    '[verify-iconv-lite] Broken iconv-lite install: missing encodings/.\n'
    + '  Fix (from this folder): npm install iconv-lite@0.7.2 --force\n'
    + '  Or reinstall all: remove node_modules then npm install',
  );
  process.exit(1);
}
