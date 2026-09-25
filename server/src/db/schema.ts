import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"

export const tasks = sqliteTable("tasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  title: text("title").notNull(),
  requestedBy: text("requested_by"),
  sendTo: text("send_to"),
  dueDate: text("due_date"),
  priority: text("priority").default("media"),
  description: text("description"),
  status: text("status").default("aberta"),
  createdAt: text("created_at"),
  tipo: text("tipo").default("tarefa"),
  projeto: text("projeto").default(""),
  recorrencia: text("recorrencia").default(""),
  feitoEm: text("feito_em").default(""),
  completedAt: text("completed_at").default(""),
  estimateMin: integer("estimate_min").default(0),
})

export const links = sqliteTable("links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id").notNull(),
  kind: text("kind").notNull(),
  label: text("label"),
  target: text("target").notNull(),
})

export const subtasks = sqliteTable("subtasks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id").notNull(),
  title: text("title").notNull(),
  done: integer("done").default(0),
  position: integer("position").default(0),
})

export const projects = sqliteTable("projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  scope: text("scope").default(""),
  people: text("people").default(""),
  status: text("status").default("ativo"),
  collapsed: integer("collapsed").default(0),
  position: integer("position").default(0),
  createdAt: text("created_at"),
  centralNote: text("central_note").default(""),
  grupo: text("grupo").default(""),
})

export const projectLinks = sqliteTable("project_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  kind: text("kind").notNull(),
  label: text("label"),
  target: text("target").notNull(),
  grupo: text("grupo").default(""),
})

export const projectNotes = sqliteTable("project_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull(),
  title: text("title").default(""),
  body: text("body").default(""),
  position: integer("position").default(0),
  createdAt: text("created_at"),
  updatedAt: text("updated_at"),
})

export const ideaLinks = sqliteTable("idea_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ideaId: integer("idea_id").notNull(),
  targetType: text("target_type").notNull(),
  targetId: integer("target_id").notNull(),
})

export const attachments = sqliteTable("attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ownerType: text("owner_type").notNull(),
  ownerId: integer("owner_id").notNull(),
  filename: text("filename").notNull(),
  key: text("key").notNull(),
  contentType: text("content_type").default(""),
  size: integer("size").default(0),
  createdAt: text("created_at"),
})

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").default(""),
})

export const centralNotes = sqliteTable("central_notes", {
  path: text("path").primaryKey(),
  title: text("title").default(""),
  tipo: text("tipo").default(""),
  area: text("area").default(""),
  produto: text("produto").default(""),
  projeto: text("projeto").default(""),
  status: text("status").default("ativo"),
  updatedAt: text("updated_at").default(""),
  mtime: text("mtime").default(""),
  hash: text("hash").default(""),
  links: text("links").default("[]"),
  scope: text("scope").default(""),
  repositorio: text("repositorio").default(""),
  caminhoLocal: text("caminho_local").default(""),
  activityAt: text("activity_at").default(""),
  activityDetail: text("activity_detail").default(""),
  activityAck: text("activity_ack").default(""),
  ingestedAt: text("ingested_at").default(""),
  deletedAt: text("deleted_at").default(""),
})

export const centralEntries = sqliteTable("central_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  notePath: text("note_path").notNull(),
  kind: text("kind").notNull(),
  text: text("text").notNull(),
  date: text("date").default(""),
  section: text("section").default(""),
  itemHash: text("item_hash").notNull(),
  subtasks: text("subtasks").default("[]"),
})

/** Vinculo entre uma entrada da CENTRAL e a demanda espelhada no Bom Dia. */
export const centralTaskLinks = sqliteTable("central_task_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  taskId: integer("task_id").notNull(),
  notePath: text("note_path").notNull(),
  kind: text("kind").notNull(),
  itemHash: text("item_hash").notNull(),
  state: text("state").default("ativa"),
  text: text("text").default(""),
  section: text("section").default(""),
  entryDate: text("entry_date").default(""),
  subtasks: text("subtasks").default("[]"),
  createdAt: text("created_at").default(""),
  updatedAt: text("updated_at").default(""),
})
