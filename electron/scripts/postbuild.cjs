const fs = require('node:fs');
const path = require('node:path');

const outDir = path.join(__dirname, '..', '..', 'dist-electron');

// Rename .js -> .cjs so Node loads them as CommonJS regardless of root
// package.json's "type": "module" setting. This is required because Electron's
// main-process module injection only works when the entry is loaded as CJS;
// loading as ESM puts Electron into a "Node script" mode where
// require('electron') returns a path string instead of the API.
const renames = ['main', 'preload'];
for (const name of renames) {
  const fromJs = path.join(outDir, `${name}.js`);
  const toCjs = path.join(outDir, `${name}.cjs`);
  if (fs.existsSync(fromJs)) {
    fs.renameSync(fromJs, toCjs);
  }
  const fromMap = path.join(outDir, `${name}.js.map`);
  const toMap = path.join(outDir, `${name}.cjs.map`);
  if (fs.existsSync(fromMap)) {
    // Update sourceMappingURL inside the .cjs file
    const cjs = fs.readFileSync(toCjs, 'utf8');
    fs.writeFileSync(toCjs, cjs.replace(`${name}.js.map`, `${name}.cjs.map`));
    fs.renameSync(fromMap, toMap);
  }
}

// The main entry is named main.cjs so Electron loads it as CJS regardless of
// the root package.json's "type": "module". But subdir files (net/*.js) keep
// the .js extension and would inherit "type": "module" from root unless we
// override it here. Writing a package.json marker pins the whole dist-electron
// subtree to CJS.
fs.writeFileSync(
  path.join(outDir, 'package.json'),
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
);
