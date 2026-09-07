// expo-sqlite in-memory shim,作為 manual mock(放在 __mocks__/ 下會被 jest 自動辨識)。
// jest.setup.js 裡的 jest.mock('expo-sqlite', ...) 不需要再 require 這個檔 —
// Jest 自己會從 __mocks__/ 找。
//
// 極簡實作:支援 CREATE TABLE / CREATE INDEX / PRAGMA(忽略) / INSERT / UPDATE / DELETE / SELECT。
// 不支援 transaction / 多 statement exec 之外的 PRAGMA / FK — 那些在 store 已被避掉。

const TABLES = new Map();
const SCHEMA = new Set();

function reset() {
  TABLES.clear();
  SCHEMA.clear();
}

function rowsFor(table) {
  if (!TABLES.has(table)) TABLES.set(table, []);
  return TABLES.get(table);
}

function execAsync(sql) {
  for (const stmtRaw of sql.split(';')) {
    const stmt = stmtRaw.trim();
    if (!stmt) continue;
    const m = stmt.match(/^CREATE TABLE IF NOT EXISTS (\w+)/i);
    if (m) {
      SCHEMA.add(m[1]);
      continue;
    }
    if (/^CREATE INDEX/i.test(stmt)) continue;
    if (/^PRAGMA/i.test(stmt)) continue;
    throw new Error(`execAsync 不支援: ${stmt.slice(0, 60)}`);
  }
  return Promise.resolve();
}

function runAsync(sql, params = []) {
  const tableMatch = sql.match(/(?:INSERT INTO|UPDATE|DELETE FROM)\s+(\w+)/i);
  if (!tableMatch) return Promise.resolve({ changes: 0 });
  const table = tableMatch[1];

  if (/^INSERT INTO/i.test(sql)) {
    const cols = sql.match(/\(([^)]+)\)\s*VALUES/i)[1].split(',').map((s) => s.trim());
    const row = {};
    cols.forEach((c, i) => {
      row[c] = params[i];
    });
    rowsFor(table).push(row);
    return Promise.resolve({ changes: 1, lastInsertRowId: rowsFor(table).length });
  }

  if (/^DELETE FROM/i.test(sql)) {
    const whereCol = sql.match(/WHERE\s+(\w+)/i)[1];
    const rows = rowsFor(table);
    const kept = rows.filter((r) => r[whereCol] !== params[0]);
    const removed = rows.length - kept.length;
    TABLES.set(table, kept);
    return Promise.resolve({ changes: removed });
  }

  if (/^UPDATE/i.test(sql)) {
    const setPart = sql.match(/SET\s+(.+?)\s+WHERE/i)[1];
    const assignments = setPart.split(',').map((s) => s.trim());
    const whereCol = sql.match(/WHERE\s+(\w+)/i)[1];
    const whereVal = params[params.length - 1];
    let changes = 0;
    for (const row of rowsFor(table)) {
      if (row[whereCol] === whereVal) {
        assignments.forEach((assign, i) => {
          const [col] = assign.split('=').map((s) => s.trim());
          row[col] = params[i];
        });
        changes++;
      }
    }
    return Promise.resolve({ changes });
  }

  throw new Error(`runAsync 不支援: ${sql.slice(0, 60)}`);
}

function getAllAsync(sql, params = []) {
  const tableMatch = sql.match(/FROM\s+(\w+)/i);
  if (!tableMatch) return Promise.resolve([]);
  const table = tableMatch[1];

  let rows = rowsFor(table).slice();

  const where = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
  if (where) {
    const col = where[1];
    rows = rows.filter((r) => r[col] === params[0]);
  }

  const order = sql.match(/ORDER BY\s+(\w+)\s+(ASC|DESC)/i);
  if (order) {
    const [, col, dir] = order;
    rows.sort((a, b) => (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0));
    if (dir === 'DESC') rows.reverse();
  }

  return Promise.resolve(rows);
}

const db = {
  execAsync,
  runAsync,
  getAllAsync,
  __reset: reset,
  __tables: () => TABLES,
  __schema: () => SCHEMA,
};

module.exports = {
  openDatabaseAsync: jest.fn(() => Promise.resolve(db)),
  __db: db,
};
