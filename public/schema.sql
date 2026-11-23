CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, role TEXT, clearance INTEGER,
  salt TEXT, verifier TEXT, wrapped_vault TEXT, created TEXT);
CREATE TABLE IF NOT EXISTS categories(name TEXT PRIMARY KEY, prefix TEXT);
CREATE TABLE IF NOT EXISTS records(
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, title TEXT, category TEXT,
  clearance INTEGER, tags TEXT, body_enc TEXT, source TEXT, author TEXT, created TEXT, updated TEXT);
CREATE TABLE IF NOT EXISTS attachments(
  id INTEGER PRIMARY KEY AUTOINCREMENT, record_id INTEGER, filename TEXT,
  r2key TEXT, sha256 TEXT, size INTEGER);
CREATE TABLE IF NOT EXISTS journal(id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, op TEXT, action TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, name TEXT, vault_key TEXT, expires INTEGER);
INSERT OR IGNORE INTO categories VALUES('ДОСЬЕ','ДОС'),('АНОМАЛИЯ','АНО'),('АРТЕФАКТ','АРТ'),('ПРОТОКОЛ','ПРТ'),('ЛОКАЦИЯ','ЛОК'),('ЗНАНИЕ','ЗНН');
