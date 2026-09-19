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
