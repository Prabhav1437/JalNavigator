const fs = require('fs');
const path = require('path');

const source = __dirname;
const target = path.resolve(process.argv[2] || process.cwd());
const apiFile = path.join(target, 'backend', 'routes', 'api.js');
const packageFile = path.join(target, 'backend', 'package.json');
const schemaFile = path.join(target, 'backend', 'prisma', 'schema.prisma');
const serverFile = path.join(target, 'backend', 'server.js');
const complaintsScreen = path.join(target, 'frontend', 'src', 'components', 'Complaints.jsx');
const REQUIRE_LINE = "const farmerRoutes = require('./farmer');";
const MOUNT_LINE = "router.use('/farmer', farmerRoutes);";
const ERRORS_REQUIRE_LINE = "const farmerJsonErrors = require('./utils/farmerJsonErrors');";
const ERRORS_USE_LINE = 'app.use(farmerJsonErrors);';
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

  if (!text.includes("require('./farmer')")) {
    const next = insertAfterLast(text, /^const \w+ = require\('\.\/[\w-]+'\);(?=\r?$)/gm, REQUIRE_LINE);
    if (next === null) return { ok: false };
    text = next;
    done.push('added the farmer require line');
  }

  if (!text.includes("'/farmer'")) {
    const next = insertAfterLast(text, /^router\.use\('\/[\w-]+', \w+\);(?=\r?$)/gm, MOUNT_LINE);
    if (next === null) return { ok: false };
    text = next;
    done.push('mounted /api/farmer');
  }

  if (done.length > 0) fs.writeFileSync(apiFile, text);
  return { ok: true, done };
}

const NEW_MODELS = [
  `model FarmerComplaintAccess {
  id             Int       @id @default(autoincrement())
  complaintId    Int       @unique
  token          String
  idempotencyKey String?   @unique
  requestHash    String?
  createdAt      DateTime  @default(now())
  complaint      Complaint @relation(fields: [complaintId], references: [id], onDelete: Cascade)
}`,
  `model FarmerRateLimit {
  key     String   @id
  count   Int
  resetAt DateTime

  @@index([resetAt])
}`
];

function insertIntoModel(text, model, marker, line, eol) {
  const match = new RegExp(`^model ${model} \\{[\\s\\S]*?^\\}`, 'm').exec(text);
  if (!match) return null;
  if (match[0].includes(marker)) return text;
  const closeAt = match.index + match[0].length - 1;
  return `${text.slice(0, closeAt).replace(/\s*$/, '')}${eol}  ${line}${eol}${text.slice(closeAt)}`;
}

function patchSchema() {
  let text = fs.readFileSync(schemaFile, 'utf8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const done = [];
  const edits = [
    ['Complaint', 'farmerAccess', 'farmerAccess FarmerComplaintAccess?', 'linked Complaint to FarmerComplaintAccess'],
    ['SensorReading', 'recordedAt(sort: Desc)', '@@index([assetId, recordedAt(sort: Desc), id(sort: Desc)])', 'indexed SensorReading for latest-reading lookups'],
    ['Alert', '@@index([assetId, createdAt])', '@@index([assetId, createdAt])', 'indexed Alert for open-alert lookups']
  ];
  for (const [model, marker, line, label] of edits) {
    const next = insertIntoModel(text, model, marker, line, eol);
    if (next === null) return { ok: false, model };
    if (next !== text) done.push(label);
    text = next;
  }
  const names = ['FarmerComplaintAccess', 'FarmerRateLimit'];
  NEW_MODELS.forEach((block, index) => {
    if (!new RegExp(`^model ${names[index]}\\b`, 'm').test(text)) {
      text = `${text.replace(/\s*$/, '')}${eol}${eol}${block.replace(/\n/g, eol)}${eol}`;
      done.push(`added model ${names[index]}`);
    }
  });
  if (done.length > 0) fs.writeFileSync(schemaFile, text);
  return { ok: true, done };
}

function patchServer() {
  let text = fs.readFileSync(serverFile, 'utf8');
  if (text.includes('farmerJsonErrors')) return { ok: true, done: [] };
  const withRequire = insertAfterLast(text, /^const \w+ = require\('[^']+'\);(?=\r?$)/gm, ERRORS_REQUIRE_LINE);
  const withUse = withRequire && insertAfterLast(withRequire, /^app\.use\(express\.json\([^)]*\)\);(?=\r?$)/gm, ERRORS_USE_LINE);
  if (!withUse) return { ok: false };
  fs.writeFileSync(serverFile, withUse);
  return { ok: true, done: ['added the JSON error handler'] };
}

function patchComplaintsScreen() {
  if (!fs.existsSync(complaintsScreen)) return 'not found, skipped';
  const text = fs.readFileSync(complaintsScreen, 'utf8');
  const before = 'item.latitude && item.longitude';
  const after = 'item.latitude != null && item.longitude != null';
  if (text.includes(after)) return 'already shows 0,0 locations';
  if (!text.includes(before)) {
    return `could not find "${before}"; change it to "${after}" by hand so a latitude or longitude of 0 still shows`;
  }
  fs.writeFileSync(complaintsScreen, text.replace(before, after));
  return 'now shows locations on the equator and the prime meridian';
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

if (!fs.existsSync(schemaFile) || !fs.existsSync(serverFile)) {
  stop(`${target} does not look like the JalNavigator repository root (backend/prisma/schema.prisma or backend/server.js is missing). Nothing was changed.`);
}

const copied = [];
copyTree(path.join(source, 'backend'), path.join(target, 'backend'), copied);
copyTree(path.join(source, 'docs'), path.join(target, 'docs'), copied);

const wired = wireRouter();
if (!wired.ok) {
  stop(`the files were copied, but backend/routes/api.js has an unexpected layout. Add these two lines to it by hand:\n  ${REQUIRE_LINE}\n  ${MOUNT_LINE}`);
}

const schema = patchSchema();
if (!schema.ok) {
  stop(`the files were copied, but backend/prisma/schema.prisma has no "model ${schema.model}". Add the Farmer models and indexes from README.md by hand.`);
}
const server = patchServer();
if (!server.ok) {
  stop(`the files were copied, but backend/server.js has an unexpected layout. Add these lines to it by hand:\n  ${ERRORS_REQUIRE_LINE}\n  ${ERRORS_USE_LINE}   (right after app.use(express.json());)`);
}

console.log('Copied:');
copied.forEach((file) => console.log(`  ${file}`));
console.log('backend/routes/api.js:', wired.done.length > 0 ? wired.done.join(', ') : 'already wired, nothing to change');
console.log('backend/prisma/schema.prisma:', schema.done.length > 0 ? schema.done.join(', ') : 'already up to date');
console.log('backend/server.js:', server.done.length > 0 ? server.done.join(', ') : 'already up to date');
console.log('backend/package.json:', configureTestScript());
console.log('frontend Complaints screen:', patchComplaintsScreen());
console.log('Next: cd backend && npx prisma db push   (creates 2 tables and 2 indexes), then restart the backend and open /api/farmer');
