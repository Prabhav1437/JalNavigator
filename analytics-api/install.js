const fs = require('fs');
const path = require('path');

const source = __dirname;
const target = path.resolve(process.argv[2] || process.cwd());
const apiFile = path.join(target, 'backend', 'routes', 'api.js');
const packageFile = path.join(target, 'backend', 'package.json');
const schemaFile = path.join(target, 'backend', 'prisma', 'schema.prisma');
const REQUIRE_LINE = "const analyticsRoutes = require('./analytics');";
const MOUNT_LINE = "router.use('/analytics', analyticsRoutes);";
const SERIAL_TEST_SCRIPT = 'node --test --test-concurrency=1';
const DIRECTORY_ENTRIES = [
  ["/api/analytics", 'Analytics endpoint directory'],
  ["/api/analytics/summary", 'Counts of assets, complaints and alerts grouped by type, status and category'],
  ["/api/analytics/readings", 'Per-asset telemetry minimum, average and maximum (optional ?days= and ?assetId=)'],
  ["/api/analytics/villages", 'Per-village asset health and open alert counts'],
  ["/api/analytics/trends", 'Daily alerts, complaints and readings for the last N days (?days=, default 7)']
];
const INDEXES = [
  ['SensorReading', '@@index([recordedAt])', 'indexed SensorReading by recordedAt'],
  ['SensorReading', '@@index([assetId, recordedAt])', 'indexed SensorReading by asset and recordedAt'],
  ['Alert', '@@index([createdAt])', 'indexed Alert by createdAt'],
  ['Complaint', '@@index([createdAt])', 'indexed Complaint by createdAt']
];

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

function insertIntoModel(text, model, line, eol) {
  const match = new RegExp(`^model ${model} \\{[\\s\\S]*?^\\}`, 'm').exec(text);
  if (!match) return null;
  if (match[0].includes(line)) return text;
  const closeAt = match.index + match[0].length - 1;
  return `${text.slice(0, closeAt).replace(/\s*$/, '')}${eol}  ${line}${eol}${text.slice(closeAt)}`;
}

function addIndexes() {
  let text = fs.readFileSync(schemaFile, 'utf8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const done = [];
  for (const [model, line, label] of INDEXES) {
    const next = insertIntoModel(text, model, line, eol);
    if (next === null) return { ok: false, model };
    if (next !== text) done.push(label);
    text = next;
  }
  if (done.length > 0) fs.writeFileSync(schemaFile, text);
  return { ok: true, done };
}

function listInDirectory() {
  const text = fs.readFileSync(apiFile, 'utf8');
  if (text.includes("'/api/analytics'")) return { ok: true, done: [] };

  const pattern = /^(\s*)\{ method: '[A-Z]+', path: '\/api[^']*', description: '[^']*' \},?(?=\r?$)/gm;
  const matches = [...text.matchAll(pattern)];
  if (matches.length === 0) return { ok: false };

  const last = matches[matches.length - 1];
  const indent = last[1];
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const existing = last[0].endsWith(',') ? last[0] : `${last[0]},`;
  const added = DIRECTORY_ENTRIES.map(
    ([route, description], index) =>
      `${indent}{ method: 'GET', path: '${route}', description: '${description}' }${index === DIRECTORY_ENTRIES.length - 1 ? '' : ','}`
  ).join(eol);
  const end = last.index + last[0].length;

  fs.writeFileSync(apiFile, `${text.slice(0, last.index)}${existing}${eol}${added}${text.slice(end)}`);
  return { ok: true, done: [`listed ${DIRECTORY_ENTRIES.length} analytics endpoints in the /api directory`] };
}

function verifyInstall() {
  const text = fs.readFileSync(apiFile, 'utf8');
  const schema = fs.readFileSync(schemaFile, 'utf8');
  const missing = [];
  if (!text.includes("require('./analytics')")) missing.push('the require line in backend/routes/api.js');
  if (!text.includes("'/analytics'")) missing.push('the router.use mount in backend/routes/api.js');
  DIRECTORY_ENTRIES.forEach(([route]) => {
    if (!text.includes(`path: '${route}'`)) missing.push(`${route} in the /api endpoint directory`);
  });
  INDEXES.forEach(([model, line]) => {
    if (!schema.includes(line)) missing.push(`${line} on model ${model}`);
  });
  ['routes/analytics.js', 'utils/analyticsGuard.js'].forEach((file) => {
    if (!fs.existsSync(path.join(target, 'backend', file))) missing.push(`backend/${file}`);
  });
  return missing;
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

if (!fs.existsSync(apiFile) || !fs.existsSync(packageFile) || !fs.existsSync(schemaFile)) {
  stop(`${target} does not look like the JalNavigator repository root (backend/routes/api.js, backend/package.json or backend/prisma/schema.prisma is missing). Run this from the folder that contains backend/ and frontend/, or pass that folder as an argument.`);
}

const copied = [];
copyTree(path.join(source, 'backend'), path.join(target, 'backend'), copied);
copyTree(path.join(source, 'docs'), path.join(target, 'docs'), copied);

const wired = wireRouter();
if (!wired.ok) {
  stop(`the files were copied, but backend/routes/api.js has an unexpected layout. Add these two lines to it by hand:\n  ${REQUIRE_LINE}\n  ${MOUNT_LINE}`);
}

const listed = listInDirectory();
if (!listed.ok) {
  stop('the router was mounted, but the endpoint list in backend/routes/api.js has an unexpected layout. Add the analytics endpoints to that array by hand (see README.md).');
}

const indexed = addIndexes();
if (!indexed.ok) {
  stop(`the files were copied, but backend/prisma/schema.prisma has no "model ${indexed.model}". Add the indexes listed in README.md by hand.`);
}

console.log('Copied:');
copied.forEach((file) => console.log(`  ${file}`));
console.log('backend/routes/api.js:', [...wired.done, ...listed.done].join(', ') || 'already wired and listed, nothing to change');
console.log('backend/prisma/schema.prisma:', indexed.done.length > 0 ? indexed.done.join(', ') : 'already indexed, nothing to change');
console.log('backend/package.json:', configureTestScript());

const missing = verifyInstall();
if (missing.length > 0) {
  stop(`the install did not complete. Still missing:\n  ${missing.join('\n  ')}`);
}
console.log('Checked: the analytics router is required, mounted, listed at /api, and the four indexes are in the schema.');
console.log('Next: cd backend && npx prisma db push   (creates the four indexes), then restart the backend and open /api/analytics');
