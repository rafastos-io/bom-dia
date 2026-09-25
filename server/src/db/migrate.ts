import type { Client } from "@libsql/client"

export const CREATE_SQL = `
CREATE TABLE IF NOT EXISTS tasks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  requested_by TEXT,
  send_to      TEXT,
  due_date     TEXT,
  priority     TEXT DEFAULT 'media',
  description  TEXT,
  status       TEXT DEFAULT 'aberta',
  created_at   TEXT,
  tipo         TEXT DEFAULT 'tarefa',
  projeto      TEXT DEFAULT '',
  recorrencia  TEXT DEFAULT '',
  feito_em     TEXT DEFAULT '',
  completed_at TEXT DEFAULT '',
  estimate_min INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS links (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id  INTEGER NOT NULL,
  kind     TEXT NOT NULL,
  label    TEXT,
  target   TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS subtasks (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id  INTEGER NOT NULL,
  title    TEXT NOT NULL,
  done     INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS projects (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  scope      TEXT DEFAULT '',
  people     TEXT DEFAULT '',
  status     TEXT DEFAULT 'ativo',
  collapsed  INTEGER DEFAULT 0,
  position   INTEGER DEFAULT 0,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS project_links (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  kind       TEXT NOT NULL,
  label      TEXT,
  target     TEXT NOT NULL,
  grupo      TEXT DEFAULT '',
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS project_notes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  title      TEXT DEFAULT '',
  body       TEXT DEFAULT '',
  position   INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS idea_links (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  idea_id     INTEGER NOT NULL,
  target_type TEXT NOT NULL,
  target_id   INTEGER NOT NULL,
  FOREIGN KEY (idea_id) REFERENCES tasks(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS attachments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type   TEXT NOT NULL,
  owner_id     INTEGER NOT NULL,
  filename     TEXT NOT NULL,
  key          TEXT NOT NULL,
  content_type TEXT DEFAULT '',
  size         INTEGER DEFAULT 0,
  created_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_attachments_owner ON attachments(owner_type, owner_id);
CREATE INDEX IF NOT EXISTS idx_tasks_projeto ON tasks(projeto);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_links_task ON links(task_id);
CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);
CREATE INDEX IF NOT EXISTS idx_notes_project ON project_notes(project_id);
CREATE INDEX IF NOT EXISTS idx_idea_links_idea ON idea_links(idea_id);
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS central_notes (
  path        TEXT PRIMARY KEY,
  title       TEXT DEFAULT '',
  tipo        TEXT DEFAULT '',
  area        TEXT DEFAULT '',
  produto     TEXT DEFAULT '',
  projeto     TEXT DEFAULT '',
  status      TEXT DEFAULT 'ativo',
  updated_at  TEXT DEFAULT '',
  mtime       TEXT DEFAULT '',
  hash        TEXT DEFAULT '',
  links       TEXT DEFAULT '[]',
  ingested_at TEXT DEFAULT '',
  deleted_at  TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS central_entries (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  note_path TEXT NOT NULL,
  kind      TEXT NOT NULL,
  text      TEXT NOT NULL,
  date      TEXT DEFAULT '',
  section   TEXT DEFAULT '',
  item_hash TEXT NOT NULL,
  UNIQUE (note_path, item_hash)
);
CREATE INDEX IF NOT EXISTS idx_central_entries_kind ON central_entries(kind, date);
CREATE INDEX IF NOT EXISTS idx_central_entries_note ON central_entries(note_path);
CREATE TABLE IF NOT EXISTS central_task_links (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER NOT NULL,
  note_path  TEXT NOT NULL,
  kind       TEXT NOT NULL,
  item_hash  TEXT NOT NULL,
  state      TEXT DEFAULT 'ativa',
  text       TEXT DEFAULT '',
  section    TEXT DEFAULT '',
  entry_date TEXT DEFAULT '',
  subtasks   TEXT DEFAULT '[]',
  created_at TEXT DEFAULT '',
  updated_at TEXT DEFAULT '',
  UNIQUE (note_path, item_hash)
);
CREATE INDEX IF NOT EXISTS idx_central_task_links_task ON central_task_links(task_id);
CREATE INDEX IF NOT EXISTS idx_central_task_links_note ON central_task_links(note_path, state);
`

/** Colunas adicionadas depois da v3.0 (migracoes idempotentes). */
export const COLUMN_MIGRATIONS: Array<{ table: string; column: string; ddl: string }> = [
  { table: "tasks", column: "completed_at", ddl: "completed_at TEXT DEFAULT ''" },
  { table: "tasks", column: "estimate_min", ddl: "estimate_min INTEGER DEFAULT 0" },
  { table: "projects", column: "central_note", ddl: "central_note TEXT DEFAULT ''" },
  { table: "projects", column: "grupo", ddl: "grupo TEXT DEFAULT ''" },
  { table: "central_notes", column: "scope", ddl: "scope TEXT DEFAULT ''" },
  { table: "central_notes", column: "repositorio", ddl: "repositorio TEXT DEFAULT ''" },
  { table: "central_notes", column: "caminho_local", ddl: "caminho_local TEXT DEFAULT ''" },
  { table: "central_notes", column: "activity_at", ddl: "activity_at TEXT DEFAULT ''" },
  { table: "central_notes", column: "activity_detail", ddl: "activity_detail TEXT DEFAULT ''" },
  { table: "central_notes", column: "activity_ack", ddl: "activity_ack TEXT DEFAULT ''" },
  { table: "central_entries", column: "subtasks", ddl: "subtasks TEXT DEFAULT '[]'" },
]

/** Indices que dependem de colunas adicionadas depois da v3.0. */
const INDEX_MIGRATIONS = [
  "CREATE INDEX IF NOT EXISTS idx_projects_central_note ON projects(central_note)",
]

async function ensureColumn(
  client: Client,
  table: string,
  column: string,
  ddl: string,
): Promise<void> {
  const info = await client.execute(`PRAGMA table_info(${table})`)
  const names = info.rows.map((row) => String((row as Record<string, unknown>).name))
  if (!names.includes(column)) {
    await client.execute(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
  }
}

/** Cria o schema (se preciso) e aplica as migrações de coluna. */
export async function ensureSchema(client: Client): Promise<void> {
  for (const statement of CREATE_SQL.split(";")) {
    const sql = statement.trim()
    if (sql) await client.execute(`${sql};`)
  }
  for (const migration of COLUMN_MIGRATIONS) {
    await ensureColumn(client, migration.table, migration.column, migration.ddl)
  }
  for (const statement of INDEX_MIGRATIONS) {
    await client.execute(statement)
  }
}
