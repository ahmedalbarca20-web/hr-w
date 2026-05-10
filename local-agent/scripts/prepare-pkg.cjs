'use strict';

/**
 * Copies ZK service + patches from backend into pkg-stub/ so pkg can snapshot them
 * (pkg does not follow ../backend from the compiled graph).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const stubDir = path.join(root, 'pkg-stub');
const backendRoot = path.join(root, '..', 'backend');

const copies = [
  ['src/services/zktecoSocket.service.js', 'zktecoSocket.service.js'],
  ['src/utils/zkUserDecodePatch.js', 'zkUserDecodePatch.js'],
  ['src/utils/zktecoJsUdpFallbackPatch.js', 'zktecoJsUdpFallbackPatch.js'],
];

if (!fs.existsSync(backendRoot)) {
  console.error('[prepare-pkg] backend folder not found next to local-agent:', backendRoot);
  process.exit(1);
}

if (!fs.existsSync(stubDir)) fs.mkdirSync(stubDir, { recursive: true });

for (const [fromRel, toName] of copies) {
  const from = path.join(backendRoot, fromRel);
  if (!fs.existsSync(from)) {
    console.error('[prepare-pkg] missing:', from);
    process.exit(1);
  }
  let text = fs.readFileSync(from, 'utf8');
  if (toName === 'zktecoSocket.service.js') {
    text = text
      .replace(/require\('\.\.\/utils\/zkUserDecodePatch'\)/g, "require('./zkUserDecodePatch')")
      .replace(/require\('\.\.\/utils\/zktecoJsUdpFallbackPatch'\)/g, "require('./zktecoJsUdpFallbackPatch')");
  }
  fs.writeFileSync(path.join(stubDir, toName), text, 'utf8');
}

console.log('[prepare-pkg] wrote', stubDir);
