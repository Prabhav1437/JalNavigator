const TEST_DATABASE_NAME = /^jalnavigator_test(_[a-z0-9]+)*$/;

function requireTestDatabase(url) {
  let name;
  try {
    name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch (err) {
    throw new Error('Refusing to run: the analytics test database URL could not be read.');
  }
  if (!TEST_DATABASE_NAME.test(name)) {
    throw new Error(
      `Refusing to run: the database name "${name}" is not a dedicated test database. ` +
        'These tests delete every row, so the name must be "jalnavigator_test" or start with "jalnavigator_test_" ' +
        '(for example jalnavigator_test_ci). Create that database and point ANALYTICS_TEST_DATABASE_URL at it.'
    );
  }
  return name;
}

module.exports = { requireTestDatabase, TEST_DATABASE_NAME };
