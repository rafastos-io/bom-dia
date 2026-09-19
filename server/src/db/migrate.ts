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
  feito_em     TEXT DEFAULT ''
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
`

export async function ensureSchema(execute: (sql: string) => Promise<unknown>) {
  for (const statement of CREATE_SQL.split(";")) {
    const sql = statement.trim()
    if (sql) await execute(`${sql};`)
  }
}
