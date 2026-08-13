import Database from 'better-sqlite3'

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS memories (
    id          TEXT PRIMARY KEY,
    content     TEXT NOT NULL,
    type        TEXT NOT NULL DEFAULT 'general',
    tags        TEXT NOT NULL DEFAULT '[]',
    project     TEXT NOT NULL DEFAULT '',
    scope       TEXT NOT NULL DEFAULT 'project',
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    access_count INTEGER NOT NULL DEFAULT 0,
    last_accessed INTEGER,
    embedding   BLOB -- Float32Array
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id          TEXT PRIMARY KEY,
    project     TEXT NOT NULL DEFAULT '',
    summary     TEXT NOT NULL,
    started_at  INTEGER NOT NULL,
    ended_at    INTEGER NOT NULL
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
    id UNINDEXED,
    content,
    tags,
    type,
    content='memories',
    content_rowid='rowid'
  );

  CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts(rowid, id, content, tags, type)
    VALUES (new.rowid, new.id, new.content, new.tags, new.type);
  END;

  CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, id, content, tags, type)
    VALUES ('delete', old.rowid, old.id, old.content, old.tags, old.type);
  END;

  CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, id, content, tags, type)
    VALUES ('delete', old.rowid, old.id, old.content, old.tags, old.type);
    INSERT INTO memories_fts(rowid, id, content, tags, type)
    VALUES (new.rowid, new.id, new.content, new.tags, new.type);
  END;
`

let _db: Database.Database | null = null

export function openDb(dbPath: string): Database.Database {
  if (_db) return _db
  _db = new Database(dbPath)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  // run schema statements one by one (better-sqlite3 exec handles multi-statement)
  _db.exec(SCHEMA)
  return _db
}

export function closeDb(): void {
  if (_db) {
    _db.close()
    _db = null
  }
}

export function getDb(): Database.Database {
  if (!_db) throw new Error('DB not initialized — call openDb() first')
  return _db
}
