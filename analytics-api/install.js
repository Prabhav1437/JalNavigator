const fs = require('fs');
const path = require('path');

const source = __dirname;
const target = path.resolve(process.argv[2] || process.cwd());
const apiFile = path.join(target, 'backend', 'routes', 'api.js');
const packageFile = path.join(target, 'backend', 'package.json');
const REQUIRE_LINE = "const analyticsRoutes = require('./analytics');";
const MOUNT_LINE = "router.use('/analytics', analyticsRoutes);";
const SERIAL_TEST_SCRIPT = 'node --test --test-concurrency=1';

function stop(message) {
  console.error(`Install stopped: ${message}`);
  process.exit(1);
}

function copyTree(from, to, copied) {
  fs.mkdirSync(to, { recursive: true });
  fs.readdirSync(from, { withFileTypes: true }).forEach((entry) => {
    const fromPath = path.join(from, entry.name);
    const toPath = path.join(to, entry.name);
    if (entry.isDirectory()) {
      copyTree(fromPath, toPath, copied);
      return;
    }
    fs.copyFileSync(fromPath, toPath);
    copied.push(path.relative(target, toPath));
  });
}

function insertAfterLast(text, pattern, line) {
  const matches = [...text.matchAll(pattern)];
  if (matches.length === 0) return null;
  const last = matches[matches.length - 1];
  const end = last.index + last[0].length;
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return text.slice(0, end) + eol + line + text.slice(end);
}

function wireRouter() {
  let text = fs.readFileSync(apiFile, 'utf8');
  const done = [];

  if (!text.includes("require('./analytics')")) {
    const next = insertAfterLast(text, /^const \w+ = require\('\.\/[\w-]+'\);(?=\r?$)/gm, REQUIRE_LINE);
    if (next === null) return { ok: false };
    text = next;
    done.push('added the analytics require line');
  }

  if (!text.includes("'/analytics'")) {
    const next = insertAfterLast(text, /^router\.use\('\/[\w-]+', \w+\);(?=\r?$)/gm, MOUNT_LINE);
    if (next === null) return { ok: false };
    text = next;
    done.push('mounted /api/analytics');
  }

  if (done.length > 0) fs.writeFileSync(apiFile, text);
  return { ok: true, done };
}

function configureTestScript() {
  const text = fs.readFileSync(packageFile, 'utf8');
  if (text.includes('--test-concurrency')) return 'test script already runs files one at a time';

  if (text.includes('"test": "node --test"')) {
    fs.writeFileSync(packageFile, text.replace('"test": "node --test"', `"test": "${SERIAL_TEST_SCRIPT}"`));
    return 'set the test script to run test files one at a time';
  }

  const startLine = text.match(/^(\s*)"start": "node server\.js",?\r?$/m);
  if (!text.includes('"test"') && startLine && startLine[0].trimEnd().endsWith(',')) {
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const insert = `${startLine[0]}${eol}${startLine[1]}"test": "${SERIAL_TEST_SCRIPT}",`;
    fs.writeFileSync(packageFile, text.replace(startLine[0], () => insert));
    return 'added a test script that runs test files one at a time';
  }

  return `could not edit the test script automatically; set it to "${SERIAL_TEST_SCRIPT}" so database test files do not overlap`;
}

if (!fs.existsSync(apiFile) || !fs.existsSync(packageFile)) {
  stop(`${target} does not look like the JalNavigator repository root (backend/routes/api.js or backend/package.json is missing). Run this from the folder that contains backend/ and frontend/, or pass that folder as an argument.`);
}

const copied = [];
copyTree(path.join(source, 'backend'), path.join(target, 'backend'), copied);
copyTree(path.join(source, 'docs'), path.join(target, 'docs'), copied);

const wired = wireRouter();
if (!wired.ok) {
  stop(`the files were copied, but backend/routes/api.js has an unexpected layout. Add these two lines to it by hand:\n  ${REQUIRE_LINE}\n  ${MOUNT_LINE}`);
}

console.log('Copied:');
copied.forEach((file) => console.log(`  ${file}`));
console.log('backend/routes/api.js:', wired.done.length > 0 ? wired.done.join(', ') : 'already wired, nothing to change');
console.log('backend/package.json:', configureTestScript());
console.log('Done. Restart the backend and open /api/analytics');
