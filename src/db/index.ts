import * as SQLite from 'expo-sqlite';

const DB_NAME = 'nosurprice.db';

let _db: SQLite.SQLiteDatabase | null = null;
let _initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  // ponytail: PRAGMA journal_mode = WAL 暫時拿掉。expo-sqlite 的 execAsync 在
  // 多 statement 中夾帶會回傳值的 PRAGMA,行為不一致(SDK 57),容易炸。
  // 單人單機 local-first 不需要 read/write 並行,MVP 跳過。
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS sessions (
      id        TEXT PRIMARY KEY,
      createdAt TEXT NOT NULL,
      storeName TEXT,
      note      TEXT
    );

    CREATE TABLE IF NOT EXISTS items (
      id            TEXT PRIMARY KEY,
      sessionId     TEXT NOT NULL,
      name          TEXT NOT NULL,
      expectedPrice INTEGER,
      quantity      INTEGER NOT NULL DEFAULT 1,
      labelPhotos   TEXT NOT NULL DEFAULT '[]',
      extraPhotos   TEXT NOT NULL DEFAULT '[]',
      note          TEXT,
      capturedAt    TEXT NOT NULL,
      FOREIGN KEY (sessionId) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_items_sessionId ON items(sessionId);
  `);

  // ponytail: 老 DB(沒 quantity 欄位)升級路徑。CREATE TABLE IF NOT EXISTS 對已存在
  // 的舊表完全不會動,新欄位不會自己長出來。ADD COLUMN 既有 NULL 的列會吃 DEFAULT 1,
  // 現有資料不會壞。try/catch 包起來:沒舊表的全新安裝會丟「duplicate column」丟了就丟。
  try {
    await db.execAsync(`ALTER TABLE items ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1;`);
  } catch {
    // ignore — fresh install or mock DB
  }
}

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  if (!_initPromise) {
    _initPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await initSchema(db);
      _db = db;
      return db;
    })().catch((err) => {
      // 失敗時清掉 promise,下次呼叫才會重試
      _initPromise = null;
      throw err;
    });
  }
  return _initPromise;
}
