const { test } = require('node:test');
const assert = require('node:assert/strict');
const { requireTestDatabase } = require('./analyticsTestDatabase');

const url = (name, query = '') => `postgresql://postgres:secret@localhost:5432/${name}${query}`;

test('only a dedicated jalnavigator_test database name is accepted', () => {
  assert.equal(requireTestDatabase(url('jalnavigator_test')), 'jalnavigator_test');
  assert.equal(requireTestDatabase(url('jalnavigator_test_ci', '?schema=public')), 'jalnavigator_test_ci');
  assert.equal(requireTestDatabase(url('jalnavigator_test_2', '?host=/tmp/pgsock')), 'jalnavigator_test_2');
  assert.equal(requireTestDatabase('postgresql://postgres@localhost/jalnavigator_test?host=/tmp/pgsock'), 'jalnavigator_test');
});

test('ordinary databases that merely contain the word test are refused', () => {
  const ordinary = [
    'test',
    'testing',
    'latest',
    'contest_results',
    'jalnavigator',
    'jalnavigator_prod',
    'jalnavigator_testing',
    'jalnavigator_test-backup',
    'jalnavigator_test_prod_',
    'prod_jalnavigator_test',
    'my_test_db',
    'postgres',
    'Jalnavigator_Test',
    'JALNAVIGATOR_TEST',
    'jalnavigator_test_',
    'jalnavigator_test__x',
    'jalnavigator%5Ftest%00prod',
    ''
  ];
  for (const name of ordinary) {
    assert.throws(() => requireTestDatabase(url(name)), /Refusing to run/, name);
  }
});

test('an unreadable URL is refused instead of guessed at', () => {
  for (const bad of ['', 'not a url', undefined, 'postgresql://']) {
    assert.throws(() => requireTestDatabase(bad), /Refusing to run/, String(bad));
  }
});
