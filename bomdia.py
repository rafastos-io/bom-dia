#!/usr/bin/env python3
"""
BOM DIA - organizador pessoal de demandas.
Backend em Python puro (biblioteca padrao) + SQLite.

Roda em dois modos, decididos por variaveis de ambiente:
  - local     (default): Windows/uso pessoal. Banco na pasta do projeto,
              bind em 127.0.0.1, abre o navegador sozinho.
  - production (VPS/Docker/Coolify): banco em DATA_DIR (volume persistente),
              bind em 0.0.0.0, NAO abre navegador, recursos de desktop
              (abrir pasta no Explorer) ficam desativados com aviso amigavel.

Variaveis de ambiente reconhecidas:
  APP_ENV        local | production        (default: local)
  HOST           IP de bind               (default: 127.0.0.1 local / 0.0.0.0 prod)
  PORT           porta HTTP               (default: 9463)
  DATA_DIR       pasta de dados/banco     (default: pasta do projeto)
  OPENAI_API_KEY chave da OpenAI          (prioridade sobre config.json; nunca gravada em disco)
  OPENAI_MODEL   modelo do chat           (default: gpt-4.1-mini)
  APP_NAME       nome exibido nos logs    (default: Bom Dia)
"""
import http.server
import socketserver
import sqlite3
import json
import os
import sys
import mimetypes
import webbrowser
import hashlib
import hmac
import secrets
import time
import urllib.request
import urllib.error
from http.cookies import SimpleCookie
from urllib.parse import parse_qs, urlparse, unquote, quote
from datetime import datetime, date

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def _env(name, default=""):
    return (os.environ.get(name) or "").strip() or default


# ----------------------------------------------------------------------------
# Ambiente (local x producao) e caminhos
# ----------------------------------------------------------------------------
APP_ENV = _env("APP_ENV", "local").lower()
IS_LOCAL = APP_ENV != "production"          # producao e o unico modo "nao-local"
APP_NAME = _env("APP_NAME", "Bom Dia")

# Barreira temporaria de acesso. A senha padrao nao fica em texto puro no
# repositorio; so o SHA-256 e comparado. AUTH_PASSWORD permite troca imediata
# pelo painel de ambiente do Coolify, sem alterar codigo.
AUTH_USER = _env("AUTH_USER", "Rafastos")
AUTH_PASSWORD = _env("AUTH_PASSWORD")
AUTH_PASSWORD_SHA256 = _env(
    "AUTH_PASSWORD_SHA256",
    "51864e438afd0b48904b9c95892c5f6ac6646ee3670ddee63d81db991982034f",
).lower()
AUTH_SECRET = _env("AUTH_SECRET") or secrets.token_hex(32)
AUTH_COOKIE = "bomdia_session"
AUTH_TTL_SECONDS = 60 * 60 * 24 * 7

# DATA_DIR: onde vivem banco e config. Default = pasta do projeto (modo local
# intocado). Em producao, aponte para o volume persistente (ex.: /data).
DATA_DIR = _env("DATA_DIR") or BASE_DIR
DB_PATH = os.path.join(DATA_DIR, "bomdia.db")
CONFIG_PATH = os.path.join(DATA_DIR, "config.json")

HOST = _env("HOST") or ("127.0.0.1" if IS_LOCAL else "0.0.0.0")
try:
    PORT = int(_env("PORT", "9463"))
except ValueError:
    PORT = 9463

OPENAI_URL = "https://api.openai.com/v1/chat/completions"
DEFAULT_MODEL = _env("OPENAI_MODEL", "gpt-4.1-mini")
TIPOS = ("tarefa", "ideia", "rotina")
RECORRENCIAS = ("diaria", "semanal", "mensal")
IDEA_TARGET_TIPOS = ("projeto", "rotina", "tarefa")

# Armazenamento de arquivos (Cloudflare R2, S3-compativel). As credenciais vem
# das Shared Variables do Coolify (escopo Team): R2_ENDPOINT, R2_BUCKET,
# R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY. Nunca sao gravadas em disco.
# Convencao de pasta por projeto no bucket unico: rafastos-storage/bomdia/...
R2_ENDPOINT = _env("R2_ENDPOINT")            # https://<accountid>.r2.cloudflarestorage.com
R2_BUCKET = _env("R2_BUCKET")                # rafastos-storage
R2_ACCESS_KEY_ID = _env("R2_ACCESS_KEY_ID")
R2_SECRET_ACCESS_KEY = _env("R2_SECRET_ACCESS_KEY")
R2_PREFIX = _env("R2_PREFIX", "bomdia")      # pasta deste projeto dentro do bucket
R2_REGION = "auto"                           # R2 assina como regiao "auto"
MAX_UPLOAD_MB = int(_env("MAX_UPLOAD_MB", "25"))
MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024

# Arquivos que o servidor PODE entregar ao navegador. Tudo o que nao estiver
# aqui (codigo .py, banco .db, config.json, .vbs/.bat, etc.) e negado.
PUBLIC_FILES = {"index.html", "login.html", "styles.css", "app.js", "favicon.ico", "robots.txt"}
PUBLIC_DIRS = ("assets",)


def log(msg):
    """Log simples em stdout (aparece no Coolify/Docker logs). Nunca logar segredos."""
    print(f"[bomdia] {msg}", flush=True)


def _auth_password_digest():
    """Digest da credencial ativa, usado tanto na validacao quanto na sessao."""
    if AUTH_PASSWORD:
        return hashlib.sha256(AUTH_PASSWORD.encode("utf-8")).hexdigest()
    return AUTH_PASSWORD_SHA256


def _valid_credentials(username, password):
    username_ok = hmac.compare_digest(username, AUTH_USER)
    supplied = hashlib.sha256(password.encode("utf-8")).hexdigest()
    password_ok = hmac.compare_digest(supplied, _auth_password_digest())
    return username_ok and password_ok


def _new_session_token():
    expires = int(time.time()) + AUTH_TTL_SECONDS
    payload = f"{AUTH_USER}|{expires}|{_auth_password_digest()}"
    signature = hmac.new(
        AUTH_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return f"{expires}.{signature}"


def _valid_session_token(token):
    try:
        expires_raw, supplied_signature = token.split(".", 1)
        expires = int(expires_raw)
    except (AttributeError, TypeError, ValueError):
        return False
    if expires < int(time.time()):
        return False
    payload = f"{AUTH_USER}|{expires}|{_auth_password_digest()}"
    expected = hmac.new(
        AUTH_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(supplied_signature, expected)


# ----------------------------------------------------------------------------
# Banco de dados
# ----------------------------------------------------------------------------
def get_db():
    # timeout: espera ate 10s se outro request estiver escrevendo (ThreadingServer).
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.execute("PRAGMA busy_timeout = 10000")
    return conn


def init_db():
    # Garante a pasta de dados (volume persistente em producao). Idempotente:
    # nunca apaga nada; CREATE TABLE IF NOT EXISTS + migracoes incrementais.
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = get_db()
    # WAL: melhor concorrencia leitura/escrita para o ThreadingServer.
    try:
        conn.execute("PRAGMA journal_mode = WAL")
    except sqlite3.Error as e:
        log(f"aviso: nao consegui ativar WAL ({e})")
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS tasks (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            title        TEXT NOT NULL,
            requested_by TEXT,
            send_to      TEXT,
            due_date     TEXT,
            priority     TEXT DEFAULT 'media',
            description  TEXT,
            status       TEXT DEFAULT 'aberta',
            created_at   TEXT
        );
        CREATE TABLE IF NOT EXISTS links (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id  INTEGER NOT NULL,
            kind     TEXT NOT NULL,          -- 'web' ou 'pasta'
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
            grupo      TEXT DEFAULT '',        -- categoria/pasta (ex.: Leads, Visitas)
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
            target_type TEXT NOT NULL,     -- 'projeto' | 'rotina' | 'tarefa'
            target_id   INTEGER NOT NULL,  -- projects.id ou tasks.id
            FOREIGN KEY (idea_id) REFERENCES tasks(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS attachments (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            owner_type   TEXT NOT NULL,     -- 'task' | 'project'
            owner_id     INTEGER NOT NULL,  -- tasks.id ou projects.id
            filename     TEXT NOT NULL,     -- nome original exibido ao usuario
            key          TEXT NOT NULL,     -- caminho do objeto no R2 (bomdia/...)
            content_type TEXT DEFAULT '',
            size         INTEGER DEFAULT 0,
            created_at   TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_attachments_owner
            ON attachments(owner_type, owner_id);
        """
    )
    # Migracoes incrementais (idempotentes)
    cols = [r["name"] for r in conn.execute("PRAGMA table_info(tasks)")]
    if "area" not in cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN area TEXT DEFAULT 'hoje'")
        conn.execute("UPDATE tasks SET area = 'hoje' WHERE area IS NULL")
        cols.append("area")
    # Novo modelo: 'tipo' (natureza) + 'projeto' (agrupador), substituem o uso de 'area'
    if "tipo" not in cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN tipo TEXT DEFAULT 'tarefa'")
        conn.execute("UPDATE tasks SET tipo = 'ideia'  WHERE area = 'ideias'")
        conn.execute("UPDATE tasks SET tipo = 'rotina' WHERE area = 'rotina'")
        conn.execute("UPDATE tasks SET tipo = 'tarefa' WHERE tipo IS NULL OR tipo = ''")
    if "projeto" not in cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN projeto TEXT DEFAULT ''")
        conn.execute("UPDATE tasks SET projeto = '' WHERE projeto IS NULL")
    # Rotinas (fase 2): recorrencia + check do periodo atual (sem historico)
    if "recorrencia" not in cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN recorrencia TEXT DEFAULT ''")
        conn.execute("UPDATE tasks SET recorrencia = '' WHERE recorrencia IS NULL")
    if "feito_em" not in cols:
        conn.execute("ALTER TABLE tasks ADD COLUMN feito_em TEXT DEFAULT ''")
        conn.execute("UPDATE tasks SET feito_em = '' WHERE feito_em IS NULL")
    # Categoria/pasta nos links do projeto (agrupador visual na aba Links)
    plcols = [r["name"] for r in conn.execute("PRAGMA table_info(project_links)")]
    if "grupo" not in plcols:
        conn.execute("ALTER TABLE project_links ADD COLUMN grupo TEXT DEFAULT ''")
        conn.execute("UPDATE project_links SET grupo = '' WHERE grupo IS NULL")
    # Projetos viram entidade: semeia a tabela projects a partir dos nomes ja usados
    existentes = {r["name"] for r in conn.execute("SELECT name FROM projects")}
    for r in conn.execute("SELECT DISTINCT projeto FROM tasks WHERE TRIM(COALESCE(projeto,'')) <> ''"):
        nome = (r["projeto"] or "").strip()
        if nome and nome not in existentes:
            conn.execute("INSERT INTO projects (name, created_at) VALUES (?,?)",
                         (nome, datetime.now().isoformat(timespec="seconds")))
            existentes.add(nome)
    conn.commit()
    conn.close()


# ----------------------------------------------------------------------------
# Configuracao (chave da API etc.) - fica so no back-end, fora do git
# ----------------------------------------------------------------------------
def load_config():
    cfg = {"name": "", "openai_api_key": "", "model": DEFAULT_MODEL}
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            # compat: aceita chave antiga 'nvidia_api_key' se ainda existir no arquivo
            if "openai_api_key" not in data and "nvidia_api_key" in data:
                data["openai_api_key"] = data.pop("nvidia_api_key")
            cfg.update(data)
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    # variaveis de ambiente tem prioridade (producao): chave e modelo.
    env_key = os.environ.get("OPENAI_API_KEY")
    if env_key:
        cfg["openai_api_key"] = env_key.strip()
    env_model = os.environ.get("OPENAI_MODEL")
    if env_model and env_model.strip():
        cfg["model"] = env_model.strip()
    return cfg


def save_config(data):
    # Le direto do arquivo (nao via load_config) para nao arrastar a chave de
    # ambiente para dentro do que sera gravado em disco.
    cfg = {"name": "", "openai_api_key": "", "model": DEFAULT_MODEL}
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            disk = json.load(f)
            if "openai_api_key" not in disk and "nvidia_api_key" in disk:
                disk["openai_api_key"] = disk.pop("nvidia_api_key")
            cfg.update({k: disk[k] for k in ("name", "openai_api_key", "model") if k in disk})
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    # aceita o campo novo e, por compat, o antigo vindo do front
    if "nvidia_api_key" in data and "openai_api_key" not in data:
        data["openai_api_key"] = data["nvidia_api_key"]
    for k in ("name", "openai_api_key", "model"):
        if k in data and data[k] is not None:
            cfg[k] = data[k]
    # Se a chave veio do ambiente, ela manda em runtime e NUNCA e gravada em disco.
    key_to_save = "" if os.environ.get("OPENAI_API_KEY") else cfg.get("openai_api_key", "")
    to_save = {"name": cfg.get("name", ""),
               "openai_api_key": key_to_save,
               "model": cfg.get("model", DEFAULT_MODEL)}
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(to_save, f, ensure_ascii=False, indent=2)
    except OSError as e:
        log(f"erro ao gravar config: {e}")
        raise


def api_key_ok(key):
    return bool(key) and key.strip().startswith("sk-")


def periodo_atual(recorrencia):
    """Identificador do periodo corrente, conforme a recorrencia.
    O check da rotina guarda este valor em feito_em: quando o periodo vira,
    a comparacao deixa de bater e a rotina 'reseta' sozinha (sem historico)."""
    hoje = date.today()
    if recorrencia == "diaria":
        return hoje.isoformat()
    if recorrencia == "semanal":
        iso = hoje.isocalendar()
        return f"{iso.year}-W{iso.week:02d}"
    if recorrencia == "mensal":
        return f"{hoje.year}-{hoje.month:02d}"
    return ""


def task_to_dict(row, links, subtasks):
    d = dict(row)
    d["links"] = [dict(l) for l in links]
    d["subtasks"] = [dict(s) for s in subtasks]
    rec = d.get("recorrencia") or ""
    d["feita"] = bool(rec) and (d.get("feito_em") or "") == periodo_atual(rec)
    return d


def _replace_subtasks(conn, task_id, items):
    """Substitui todas as subtarefas de uma tarefa. Aceita strings ou dicts."""
    conn.execute("DELETE FROM subtasks WHERE task_id = ?", (task_id,))
    for i, s in enumerate(items or []):
        if isinstance(s, str):
            title, done = s.strip(), 0
        elif isinstance(s, dict):
            title = (s.get("title") or "").strip()
            done = 1 if s.get("done") else 0
        else:
            continue
        if not title:
            continue
        conn.execute(
            "INSERT INTO subtasks (task_id, title, done, position) VALUES (?,?,?,?)",
            (task_id, title, done, i),
        )


# ----------------------------------------------------------------------------
# Vinculos de ideia (fase 3): uma ideia liga a VÁRIOS alvos (projeto/rotina/tarefa)
# ----------------------------------------------------------------------------
def _idea_links(conn, idea_id):
    """Vinculos da ideia, resolvidos com rotulo vivo (nome do projeto / titulo da tarefa)."""
    rows = conn.execute(
        "SELECT id, target_type, target_id FROM idea_links WHERE idea_id = ? ORDER BY id",
        (idea_id,)).fetchall()
    out = []
    for r in rows:
        d = {"id": r["id"], "target_type": r["target_type"], "target_id": r["target_id"]}
        if r["target_type"] == "projeto":
            p = conn.execute("SELECT name FROM projects WHERE id = ?", (r["target_id"],)).fetchone()
            if not p:
                continue  # alvo pendurado (limpeza acontece nos deletes)
            d["label"] = p["name"]
        else:
            t = conn.execute("SELECT title, tipo FROM tasks WHERE id = ?", (r["target_id"],)).fetchone()
            if not t:
                continue
            d["label"] = t["title"]
            d["target_tipo"] = t["tipo"]  # tipo vivo do alvo (p/ icone certo no front)
        out.append(d)
    return out


def _replace_idea_links(conn, idea_id, items):
    """Substitui todos os vinculos da ideia (mesma semantica de links/subtasks)."""
    conn.execute("DELETE FROM idea_links WHERE idea_id = ?", (idea_id,))
    seen = set()
    for l in items or []:
        if not isinstance(l, dict):
            continue
        tt = l.get("target_type")
        try:
            tid = int(l.get("target_id"))
        except (TypeError, ValueError):
            continue
        if tt not in IDEA_TARGET_TIPOS or tid == idea_id:
            continue
        key = (tt, tid)
        if key in seen:
            continue
        seen.add(key)
        conn.execute("INSERT INTO idea_links (idea_id, target_type, target_id) VALUES (?,?,?)",
                     (idea_id, tt, tid))


def list_tasks():
    conn = get_db()
    tasks = conn.execute(
        "SELECT * FROM tasks ORDER BY "
        "CASE status WHEN 'concluida' THEN 1 ELSE 0 END, "
        "CASE priority WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, "
        "COALESCE(due_date, '9999-12-31') ASC, id DESC"
    ).fetchall()
    # Contagem de anexos por tarefa numa unica query (evita N+1).
    att_counts = {r["owner_id"]: r["n"] for r in conn.execute(
        "SELECT owner_id, COUNT(*) AS n FROM attachments WHERE owner_type = 'task' GROUP BY owner_id")}
    result = []
    for t in tasks:
        links = conn.execute(
            "SELECT * FROM links WHERE task_id = ? ORDER BY id", (t["id"],)
        ).fetchall()
        subs = conn.execute(
            "SELECT id, title, done, position FROM subtasks WHERE task_id = ? ORDER BY position, id",
            (t["id"],),
        ).fetchall()
        d = task_to_dict(t, links, subs)
        d["idea_links"] = _idea_links(conn, t["id"]) if (t["tipo"] or "") == "ideia" else []
        d["attach_count"] = att_counts.get(t["id"], 0)
        result.append(d)
    conn.close()
    return result


def _clean_recorrencia(data, tipo=None):
    rec = (data.get("recorrencia") or "").strip()
    if rec not in RECORRENCIAS:
        rec = ""
    # recorrencia so faz sentido em rotina
    if tipo is not None and tipo != "rotina":
        rec = ""
    return rec


def create_task(data):
    conn = get_db()
    tipo = data.get("tipo", "tarefa")
    if tipo not in TIPOS:
        tipo = "tarefa"
    projeto = (data.get("projeto") or "").strip()
    recorrencia = _clean_recorrencia(data, tipo)
    cur = conn.execute(
        """INSERT INTO tasks (title, requested_by, send_to, due_date,
                              priority, description, status, created_at, tipo, projeto,
                              recorrencia, feito_em)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        (
            data.get("title", "").strip() or "Sem titulo",
            data.get("requested_by", "").strip(),
            data.get("send_to", "").strip(),
            data.get("due_date", "").strip(),
            data.get("priority", "media"),
            data.get("description", "").strip(),
            data.get("status", "aberta"),
            datetime.now().isoformat(timespec="seconds"),
            tipo,
            projeto,
            recorrencia,
            periodo_atual(recorrencia) if data.get("feita") and recorrencia else "",
        ),
    )
    task_id = cur.lastrowid
    for link in data.get("links", []):
        target = (link.get("target") or "").strip()
        if not target:
            continue
        conn.execute(
            "INSERT INTO links (task_id, kind, label, target) VALUES (?,?,?,?)",
            (task_id, link.get("kind", "web"), (link.get("label") or "").strip(), target),
        )
    _replace_subtasks(conn, task_id, data.get("subtasks", []))
    if tipo == "ideia":
        _replace_idea_links(conn, task_id, data.get("idea_links", []))
    _ensure_project(conn, projeto)
    conn.commit()
    conn.close()
    return task_id


def update_task(task_id, data):
    conn = get_db()
    fields = ["title", "requested_by", "send_to", "due_date",
              "priority", "description", "status", "tipo", "projeto"]
    sets, values = [], []
    for f in fields:
        if f in data:
            sets.append(f"{f} = ?")
            values.append(data[f])
    # recorrencia: valida e, se mudou, zera o check (periodo novo nao conversa com o antigo)
    if "recorrencia" in data or "tipo" in data:
        atual = conn.execute("SELECT tipo, recorrencia FROM tasks WHERE id = ?", (task_id,)).fetchone()
        if atual:
            tipo_final = data.get("tipo", atual["tipo"])
            if tipo_final not in TIPOS:
                tipo_final = "tarefa"
            rec_final = _clean_recorrencia(data, tipo_final) if "recorrencia" in data \
                else ((atual["recorrencia"] or "") if tipo_final == "rotina" else "")
            if "recorrencia" in data or rec_final != (atual["recorrencia"] or ""):
                sets.append("recorrencia = ?")
                values.append(rec_final)
                if rec_final != (atual["recorrencia"] or ""):
                    sets.append("feito_em = ?")
                    values.append("")
    if sets:
        values.append(task_id)
        conn.execute(f"UPDATE tasks SET {', '.join(sets)} WHERE id = ?", values)
    # Se o payload trouxer links, substitui todos.
    if "links" in data:
        conn.execute("DELETE FROM links WHERE task_id = ?", (task_id,))
        for link in data["links"]:
            target = (link.get("target") or "").strip()
            if not target:
                continue
            conn.execute(
                "INSERT INTO links (task_id, kind, label, target) VALUES (?,?,?,?)",
                (task_id, link.get("kind", "web"), (link.get("label") or "").strip(), target),
            )
    # Se o payload trouxer subtasks, substitui todas.
    if "subtasks" in data:
        _replace_subtasks(conn, task_id, data["subtasks"])
    # Vinculos de ideia: se o tipo final nao e mais 'ideia', limpa; senao, substitui se veio no payload
    tipo_row = conn.execute("SELECT tipo FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if tipo_row and (tipo_row["tipo"] or "") != "ideia":
        conn.execute("DELETE FROM idea_links WHERE idea_id = ?", (task_id,))
    elif "idea_links" in data:
        _replace_idea_links(conn, task_id, data["idea_links"])
    if "projeto" in data:
        _ensure_project(conn, data["projeto"])
    conn.commit()
    conn.close()


def update_subtask(sub_id, data):
    conn = get_db()
    if "done" in data:
        conn.execute("UPDATE subtasks SET done = ? WHERE id = ?",
                     (1 if data["done"] else 0, sub_id))
    if "title" in data:
        conn.execute("UPDATE subtasks SET title = ? WHERE id = ?",
                     ((data["title"] or "").strip(), sub_id))
    conn.commit()
    conn.close()


def set_routine_done(task_id, done):
    """Marca/desmarca a rotina como feita NO PERIODO ATUAL (quem calcula o periodo e o codigo)."""
    conn = get_db()
    row = conn.execute("SELECT recorrencia FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if row and (row["recorrencia"] or ""):
        val = periodo_atual(row["recorrencia"]) if done else ""
        conn.execute("UPDATE tasks SET feito_em = ? WHERE id = ?", (val, task_id))
        conn.commit()
    conn.close()


def delete_task(task_id):
    delete_attachments_for("task", task_id)  # remove anexos do R2 antes de apagar a tarefa
    conn = get_db()
    conn.execute("DELETE FROM links WHERE task_id = ?", (task_id,))
    conn.execute("DELETE FROM subtasks WHERE task_id = ?", (task_id,))
    # vinculos de ideia: a tarefa pode ser a IDEIA ou o ALVO (rotina/tarefa)
    conn.execute("DELETE FROM idea_links WHERE idea_id = ?", (task_id,))
    conn.execute("DELETE FROM idea_links WHERE target_type IN ('rotina','tarefa') AND target_id = ?",
                 (task_id,))
    conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()


# ----------------------------------------------------------------------------
# Projetos como entidade (escopo, links fixos, envolvidos)
# ----------------------------------------------------------------------------
def _proj_links(conn, pid):
    return [dict(r) for r in conn.execute(
        "SELECT id, kind, label, target, COALESCE(grupo,'') AS grupo "
        "FROM project_links WHERE project_id = ? ORDER BY id", (pid,))]


def _ensure_project(conn, name):
    """Garante que exista um projeto-entidade com esse nome (cria se preciso)."""
    name = (name or "").strip()
    if not name:
        return
    row = conn.execute("SELECT 1 FROM projects WHERE LOWER(name) = LOWER(?)", (name,)).fetchone()
    if not row:
        conn.execute("INSERT INTO projects (name, created_at) VALUES (?,?)",
                     (name, datetime.now().isoformat(timespec="seconds")))


def _replace_project_links(conn, pid, links):
    conn.execute("DELETE FROM project_links WHERE project_id = ?", (pid,))
    for l in links or []:
        target = (l.get("target") or "").strip()
        if not target:
            continue
        conn.execute(
            "INSERT INTO project_links (project_id, kind, label, target, grupo) VALUES (?,?,?,?,?)",
            (pid, l.get("kind", "web"), (l.get("label") or "").strip(), target,
             (l.get("grupo") or "").strip()))


def list_projects():
    conn = get_db()
    rows = conn.execute("SELECT * FROM projects ORDER BY position, LOWER(name)").fetchall()
    result = []
    for p in rows:
        d = dict(p)
        d["links"] = _proj_links(conn, p["id"])
        cnt = conn.execute(
            "SELECT COUNT(*) AS total, "
            "SUM(CASE WHEN status = 'concluida' THEN 0 ELSE 1 END) AS ativas "
            "FROM tasks WHERE projeto = ?", (p["name"],)).fetchone()
        d["task_total"] = cnt["total"] or 0
        d["task_ativas"] = cnt["ativas"] or 0
        result.append(d)
    conn.close()
    return result


def create_project(data):
    conn = get_db()
    name = (data.get("name") or "").strip()
    if not name:
        conn.close()
        raise ValueError("Nome do projeto vazio")
    row = conn.execute("SELECT id FROM projects WHERE LOWER(name) = LOWER(?)", (name,)).fetchone()
    if row:
        pid = row["id"]
        conn.execute("UPDATE projects SET scope = ?, people = ? WHERE id = ?",
                     ((data.get("scope") or "").strip(), (data.get("people") or "").strip(), pid))
    else:
        cur = conn.execute(
            "INSERT INTO projects (name, scope, people, created_at) VALUES (?,?,?,?)",
            (name, (data.get("scope") or "").strip(), (data.get("people") or "").strip(),
             datetime.now().isoformat(timespec="seconds")))
        pid = cur.lastrowid
    _replace_project_links(conn, pid, data.get("links", []))
    conn.commit()
    conn.close()
    return pid


def update_project(pid, data):
    conn = get_db()
    old = conn.execute("SELECT name FROM projects WHERE id = ?", (pid,)).fetchone()
    if not old:
        conn.close()
        return
    sets, vals = [], []
    for f in ("name", "scope", "people", "status"):
        if f in data:
            sets.append(f"{f} = ?")
            vals.append((data[f] or "").strip())
    if "collapsed" in data:
        sets.append("collapsed = ?")
        vals.append(1 if data["collapsed"] else 0)
    if sets:
        vals.append(pid)
        conn.execute(f"UPDATE projects SET {', '.join(sets)} WHERE id = ?", vals)
    # Renomeou? propaga o novo nome pras tarefas (projeto e chave por nome)
    new_name = (data.get("name") or "").strip()
    if new_name and new_name != old["name"]:
        conn.execute("UPDATE tasks SET projeto = ? WHERE projeto = ?", (new_name, old["name"]))
    if "links" in data:
        _replace_project_links(conn, pid, data["links"])
    conn.commit()
    conn.close()


def delete_project(pid):
    delete_attachments_for("project", pid)  # remove anexos do R2 antes de apagar o projeto
    conn = get_db()
    p = conn.execute("SELECT name FROM projects WHERE id = ?", (pid,)).fetchone()
    if p:
        conn.execute("UPDATE tasks SET projeto = '' WHERE projeto = ?", (p["name"],))
    conn.execute("DELETE FROM idea_links WHERE target_type = 'projeto' AND target_id = ?", (pid,))
    conn.execute("DELETE FROM project_links WHERE project_id = ?", (pid,))
    conn.execute("DELETE FROM project_notes WHERE project_id = ?", (pid,))
    conn.execute("DELETE FROM projects WHERE id = ?", (pid,))
    conn.commit()
    conn.close()


# ----------------------------------------------------------------------------
# Anotacoes do projeto (bloco de notas, separado por "arquivos")
# ----------------------------------------------------------------------------
def list_notes(project_id):
    conn = get_db()
    rows = conn.execute(
        "SELECT id, project_id, title, body, position, updated_at "
        "FROM project_notes WHERE project_id = ? ORDER BY position, id", (project_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def create_note(project_id, data):
    conn = get_db()
    now = datetime.now().isoformat(timespec="seconds")
    cur = conn.execute(
        "INSERT INTO project_notes (project_id, title, body, created_at, updated_at) VALUES (?,?,?,?,?)",
        (project_id, (data.get("title") or "Nova anotação").strip() or "Nova anotação",
         data.get("body") or "", now, now))
    nid = cur.lastrowid
    conn.commit()
    conn.close()
    return nid


def update_note(note_id, data):
    conn = get_db()
    sets, vals = [], []
    if "title" in data:
        sets.append("title = ?")
        vals.append((data["title"] or "").strip() or "Sem título")
    if "body" in data:
        sets.append("body = ?")
        vals.append(data["body"] or "")
    if sets:
        sets.append("updated_at = ?")
        vals.append(datetime.now().isoformat(timespec="seconds"))
        vals.append(note_id)
        conn.execute(f"UPDATE project_notes SET {', '.join(sets)} WHERE id = ?", vals)
    conn.commit()
    conn.close()


def delete_note(note_id):
    conn = get_db()
    conn.execute("DELETE FROM project_notes WHERE id = ?", (note_id,))
    conn.commit()
    conn.close()


def open_folder(path):
    """Abre uma pasta (ou arquivo) local no Explorer do Windows.

    Recurso exclusivo do modo LOCAL: na VPS nao existe desktop nem acesso ao
    computador do usuario, entao respondemos com um aviso amigavel em vez de
    tentar (e falhar) abrir algo no servidor."""
    if not IS_LOCAL:
        return False, ("Abrir pasta local so funciona na versao instalada no seu "
                       "computador. Na versao hospedada, use links da web.")
    path = os.path.normpath(path.strip().strip('"'))
    if not os.path.exists(path):
        return False, f"Caminho nao encontrado: {path}"
    try:
        if sys.platform.startswith("win"):
            os.startfile(path)  # noqa: type
        elif sys.platform == "darwin":
            os.system(f'open "{path}"')
        else:
            os.system(f'xdg-open "{path}"')
        return True, "ok"
    except Exception as e:  # noqa: BLE001
        return False, str(e)


# ----------------------------------------------------------------------------
# Assistente de IA (OpenAI - chat/completions)
# ----------------------------------------------------------------------------
SYSTEM_PROMPT = """Voce e o assistente do "Bom Dia", um organizador pessoal de demandas.
Sua personalidade: um secretario discreto, inteligente e confiavel. Fala de forma curta,
pessoal e leve - nunca corporativa.

Sua tarefa: ler o texto solto que a pessoa escreveu (pensamentos, recados, conversa) e
transformar em uma ou mais demandas organizadas.

Regras:
- Responda APENAS com JSON valido, sem texto antes ou depois, sem markdown.
- Formato exato:
  {"tarefas": [
    {"title": "titulo curto e direto",
     "description": "resumo util em 1-2 frases, com detalhes que importam",
     "priority": "alta" | "media" | "baixa",
     "due_date": "AAAA-MM-DD" ou "" se nao houver prazo,
     "tipo": "tarefa" | "ideia" | "rotina",
     "recorrencia": "diaria" | "semanal" | "mensal" (SO se tipo="rotina" e o texto indicar
       frequencia, ex.: "todo dia", "toda semana", "mensalmente"; senao ""),
     "projeto": "nome do projeto/cliente a que isso pertence, ou \\"\\" se for avulso",
     "requested_by": "quem pediu, se mencionado, senao \\"\\"",
     "send_to": "para quem enviar, se mencionado, senao \\"\\"",
     "subtasks": ["passo 1", "passo 2"]  (lista de passos desta MESMA demanda; [] se nao houver),
     "links": [{"kind": "web" ou "pasta", "label": "apelido curto", "target": "url ou caminho"}]  ([] se nao houver),
     "motivo": "1 frase curta explicando a prioridade/urgencia ou o fluxo"}
  ]}
- Duas dimensoes independentes:
  * "tipo" = a natureza: "tarefa" (algo a fazer/entregar), "ideia" (pensamento solto pra depois),
    "rotina" (recorrente/habito).
  * "projeto" = o agrupador. Use SO quando houver demandas realmente independentes do mesmo
    cliente/iniciativa (ex.: "Dina", "Bellelli", "campanha X"). Elas se cruzam: pode haver uma
    "ideia" do projeto "Dina" (tipo=ideia, projeto=Dina) ou uma "rotina" de um projeto.
- REGRA IMPORTANTE sobre subtasks vs projeto: se o texto descreve UM entregavel unico com varios
  passos, gere UMA tarefa com esses passos em "subtasks" - NUNCA varias tarefas, e NUNCA invente
  um projeto so pra segurar os passos. Ex.: "preciso finalizar a apresentacao pro Danilo Nunes:
  montar os slides, revisar os numeros e ensaiar" -> UMA tarefa {"title": "Finalizar apresentacao
  pro Danilo Nunes", "projeto": "", "subtasks": ["Montar os slides", "Revisar os numeros",
  "Ensaiar"]}. So separe em varias tarefas quando forem entregas de fato independentes.
- REGRA sobre PROJETO EXPLICITO: quando a pessoa ANUNCIA um projeto - "vou comecar um (novo)
  projeto chamado X", "projeto X:", "novo projeto: X", "iniciar o projeto X" - isso DEFINE UM
  UNICO projeto. TODAS as demandas desse texto recebem "projeto": "X". NUNCA crie dois ou mais
  nomes de projeto a partir de um texto assim - o singular "um projeto" e literal. So use nomes
  de projeto diferentes quando a pessoa citar, ela mesma, iniciativas/clientes claramente
  distintos no mesmo texto.
- HIERARQUIA em 3 niveis: PROJETO (o agrupador) > TAREFA (entregavel/marco que faz sentido
  concluir sozinho e pode ter prazo/responsavel proprio) > SUBTASK (passo de execucao de UMA
  tarefa, sem sentido isolado). Teste rapido: se o item poderia ter prazo proprio e ser
  entregue sozinho, e TAREFA; se so existe pra tocar outra tarefa, e SUBTASK. Nao promova a
  projeto o que e tarefa, nem a tarefa o que e subtask.
- Exemplo do caso "um projeto com varias tarefas": "Vou comecar um novo projeto chamado Aurora.
  Preciso fechar o briefing com o cliente, montar a identidade visual e programar o site." ->
  {"tarefas": [
    {"title": "Fechar briefing com o cliente", "projeto": "Aurora", "tipo": "tarefa", "subtasks": []},
    {"title": "Montar a identidade visual", "projeto": "Aurora", "tipo": "tarefa", "subtasks": []},
    {"title": "Programar o site", "projeto": "Aurora", "tipo": "tarefa", "subtasks": []}
  ]}. Repare: UM projeto ("Aurora") em TODAS, TRES tarefas - nunca dois projetos.
- "links": extraia QUALQUER url (http/https) ou caminho de pasta que a pessoa mencionar e coloque
  no campo "links" da tarefa a que pertence. kind="web" para links da internet (ex.: Canva, Drive,
  YouTube), kind="pasta" para caminhos de pasta do PC (ex.: C:\\...). Nunca descarte um link que a
  pessoa passou - ele quase sempre e o material da demanda.
- Prioridade pela urgencia real: prazo curto ou cobranca = alta.
- Resolva datas relativas ("sexta que vem", "amanha", "semana que vem") usando a data de hoje.
- Se o texto tiver varias demandas, separe em varios itens e ordene do mais importante ao menos.
- Escreva em portugues do Brasil.
"""


def call_openai(messages, model=None, temperature=0.2, timeout=45, json_mode=True):
    cfg = load_config()
    key = cfg.get("openai_api_key", "").strip()
    if not api_key_ok(key):
        raise RuntimeError("Chave da OpenAI nao configurada (esperado algo como sk-...).")
    body = {
        "model": model or cfg.get("model", DEFAULT_MODEL),
        "messages": messages,
        "temperature": temperature,
        "max_tokens": 1024,
    }
    # json_mode=True forca resposta em JSON (usado pelo parser). O recado do WhatsApp
    # e texto corrido, entao chama com json_mode=False.
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    payload = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        OPENAI_URL, data=payload, method="POST",
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {key}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "ignore")[:300]
        if e.code in (401, 403):
            raise RuntimeError("Chave da OpenAI invalida ou sem permissao.") from e
        raise RuntimeError(f"Erro da OpenAI (HTTP {e.code}): {detail}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Sem conexao com a OpenAI: {e.reason}") from e
    return body["choices"][0]["message"]["content"]


def _extract_json(text):
    """Extrai o primeiro objeto JSON de uma resposta, mesmo se vier cercado de texto."""
    text = text.strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lstrip().lower().startswith("json"):
            text = text.lstrip()[4:]
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("Resposta da IA nao continha JSON.")
    return json.loads(text[start:end + 1])


def ai_parse(text):
    hoje = date.today().isoformat()
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT + f"\nHoje e {hoje}."},
        {"role": "user", "content": text.strip()},
    ]
    raw = call_openai(messages)
    data = _extract_json(raw)
    tarefas = data.get("tarefas", []) if isinstance(data, dict) else []
    # sanitiza cada tarefa
    clean = []
    for t in tarefas:
        if not isinstance(t, dict) or not (t.get("title") or "").strip():
            continue
        tipo = t.get("tipo", "tarefa")
        # subtarefas: aceita lista de strings ou de dicts {title}
        subs = []
        for s in (t.get("subtasks") or []):
            if isinstance(s, str) and s.strip():
                subs.append(s.strip())
            elif isinstance(s, dict) and (s.get("title") or "").strip():
                subs.append(s["title"].strip())
        # links: extrai url/pasta que a IA identificou
        links = []
        for l in (t.get("links") or []):
            if not isinstance(l, dict):
                continue
            target = (l.get("target") or "").strip()
            if not target:
                continue
            kind = l.get("kind") if l.get("kind") in ("web", "pasta") else "web"
            links.append({"kind": kind, "label": (l.get("label") or "").strip(), "target": target})
        clean.append({
            "title": (t.get("title") or "").strip(),
            "description": (t.get("description") or "").strip(),
            "priority": t.get("priority") if t.get("priority") in ("alta", "media", "baixa") else "media",
            "due_date": (t.get("due_date") or "").strip(),
            "tipo": tipo if tipo in TIPOS else "tarefa",
            "recorrencia": _clean_recorrencia(t, tipo if tipo in TIPOS else "tarefa"),
            "projeto": (t.get("projeto") or "").strip(),
            "requested_by": (t.get("requested_by") or "").strip(),
            "send_to": (t.get("send_to") or "").strip(),
            "subtasks": subs,
            "links": links,
            "motivo": (t.get("motivo") or "").strip(),
        })
    return clean


# ----------------------------------------------------------------------------
# Recado de WhatsApp (IA) - texto pronto pra copiar e mandar
# ----------------------------------------------------------------------------
PRIO_TXT = {"alta": "alta", "media": "media", "baixa": "baixa"}


def _fmt_data_br(iso):
    """AAAA-MM-DD -> DD/MM/AAAA (deixa o resto passar como veio)."""
    iso = (iso or "").strip()
    try:
        d = datetime.strptime(iso, "%Y-%m-%d").date()
        return d.strftime("%d/%m/%Y")
    except ValueError:
        return iso


def _wa_contexto(task):
    """Monta um bloco de contexto legivel a partir do dict da tarefa (o que a IA le)."""
    linhas = []
    add = linhas.append
    titulo = (task.get("title") or "").strip()
    add(f"Titulo: {titulo}")
    tipo = (task.get("tipo") or "tarefa").strip()
    if tipo and tipo != "tarefa":
        add(f"Tipo: {tipo}")
    if (task.get("description") or "").strip():
        add(f"Descricao: {task['description'].strip()}")
    if (task.get("projeto") or "").strip():
        add(f"Projeto: {task['projeto'].strip()}")
    if (task.get("proj_scope") or "").strip():
        add(f"Escopo do projeto: {task['proj_scope'].strip()}")
    if (task.get("proj_people") or "").strip():
        add(f"Envolvidos no projeto: {task['proj_people'].strip()}")
    if (task.get("priority") or "").strip():
        add(f"Prioridade: {PRIO_TXT.get(task['priority'], task['priority'])}")
    if (task.get("due_date") or "").strip():
        add(f"Prazo: {_fmt_data_br(task['due_date'])}")
    if (task.get("requested_by") or "").strip():
        add(f"Quem pediu: {task['requested_by'].strip()}")
    if (task.get("send_to") or "").strip():
        add(f"Para enviar a: {task['send_to'].strip()}")
    if (task.get("status") or "").strip():
        add(f"Status: {task['status'].strip()}")
    # subtarefas com andamento
    subs = task.get("subtasks") or []
    norm = []
    for s in subs:
        if isinstance(s, str):
            norm.append({"title": s.strip(), "done": 0})
        elif isinstance(s, dict) and (s.get("title") or "").strip():
            norm.append({"title": s["title"].strip(), "done": 1 if s.get("done") else 0})
    if norm:
        feito = sum(1 for s in norm if s["done"])
        pct = round(feito * 100 / len(norm))
        add(f"Subtarefas ({feito}/{len(norm)} feitas, {pct}%):")
        for s in norm:
            add(f"  [{'x' if s['done'] else ' '}] {s['title']}")
    # links
    links = task.get("links") or []
    if links:
        add("Links:")
        for l in links:
            if not isinstance(l, dict):
                continue
            target = (l.get("target") or "").strip()
            if not target:
                continue
            label = (l.get("label") or "").strip()
            add(f"  - {label + ': ' if label else ''}{target}")
    return "\n".join(linhas)


WA_SYSTEM_DELEGAR = """Voce e o secretario do "Bom Dia". Sua tarefa: escrever UMA mensagem de
WhatsApp para DELEGAR esta demanda a alguem do time.

Estilo: claro, organizado e completo, mas humano (nada robotico). Escreva em portugues do Brasil.
Estruture com rotulos curtos e quebras de linha, mais ou menos assim:
- 1 linha de abertura pedindo pra assumir a demanda;
- *Tarefa:* o que precisa ser feito;
- *Contexto:* detalhes que importam (projeto, quem pediu) - so se existirem;
- *Prazo:* se houver;
- *Passos:* liste as subtarefas pendentes (as ja feitas pode marcar como ok);
- *Links:* cole os links/pastas, se houver;
- 1 linha curta de fechamento.

Regras:
- Use SO as informacoes fornecidas. NUNCA invente dados, nomes, prazos ou links.
- Se algum item nao existir, simplesmente omita o rotulo.
- Pode usar *negrito* do WhatsApp (asteriscos) nos rotulos. Emojis com muita moderacao.
- Responda APENAS com o texto da mensagem, sem aspas, sem comentarios antes ou depois."""

WA_SYSTEM_AVISAR = """Voce e o Poohzera, secretario simpatico do "Bom Dia". Sua tarefa: escrever
UMA mensagem de WhatsApp curta pra AVISAR quem pediu a demanda sobre o andamento (um update).

Estilo: leve, pessoal e breve (3 a 5 linhas no maximo). Portugues do Brasil. Emojis discretos, ok.
Traga: uma saudacao curta, em que pe esta a coisa (use o andamento/porcentagem das subtarefas ou o
status), o prazo se houver, e 1 linha de proximo passo. Se houver quem pediu, pode falar direto com
essa pessoa pelo nome.

Regras:
- Use SO as informacoes fornecidas. NUNCA invente dados, prazos ou links.
- Nao vire uma lista longa nem cole todos os links - e so um update rapido.
- Responda APENAS com o texto da mensagem, sem aspas, sem comentarios antes ou depois."""


def ai_whatsapp(task, modo="avisar"):
    if modo not in ("delegar", "avisar"):
        modo = "avisar"
    system = WA_SYSTEM_DELEGAR if modo == "delegar" else WA_SYSTEM_AVISAR
    hoje = date.today().isoformat()
    contexto = _wa_contexto(task)
    messages = [
        {"role": "system", "content": system + f"\nHoje e {hoje}."},
        {"role": "user", "content": "Dados da demanda:\n" + contexto},
    ]
    raw = call_openai(messages, json_mode=False, temperature=0.4)
    return (raw or "").strip()


def list_projetos():
    """Projetos ja existentes, pra sugerir nas perguntas de lacuna."""
    conn = get_db()
    rows = conn.execute(
        "SELECT DISTINCT projeto FROM tasks WHERE projeto IS NOT NULL AND TRIM(projeto) <> ''"
    ).fetchall()
    conn.close()
    return sorted({(r[0] or "").strip() for r in rows}, key=str.lower)


def build_gaps(task, projetos):
    """O CODIGO decide quais perguntas fazer, conforme o TIPO e os campos vazios.
    Cada 'lacuna' vira um modulo de pergunta com o tipo de resposta certo."""
    tipo = task.get("tipo") or "tarefa"
    sem_projeto = not (task.get("projeto") or "").strip()
    sem_link = not task.get("links")
    proj_q = {"campo": "projeto", "tipo": "opcoes", "opcoes": projetos}
    link_q = {"campo": "links", "tipo": "link",
              "pergunta": "Algum link ou pasta? (Canva, Drive, pasta do PC)"}
    gaps = []

    if tipo == "rotina":
        # Rotina precisa de recorrencia; prazo nao faz sentido (ela se repete).
        if not (task.get("recorrencia") or "").strip():
            gaps.append({"campo": "recorrencia", "tipo": "recorrencia",
                         "pergunta": "Com que frequencia isso se repete?"})
        if sem_projeto:
            gaps.append({**proj_q, "pergunta": "De qual projeto e essa rotina?"})
        if sem_link:
            gaps.append(link_q)
    elif tipo == "ideia":
        # Ideia: o forte e o vinculo (projeto/rotina/tarefa). Sem prazo obrigatorio.
        gaps.append({"campo": "vinculos", "tipo": "vinculos",
                     "pergunta": "Quer amarrar essa ideia a um projeto, rotina ou tarefa?"})
        if sem_projeto:
            gaps.append({**proj_q, "pergunta": "E de algum projeto?"})
        if sem_link:
            gaps.append(link_q)
    else:  # tarefa
        if sem_projeto:
            gaps.append({**proj_q, "pergunta": "A que projeto isso pertence?"})
        if not (task.get("due_date") or "").strip():
            gaps.append({"campo": "prazo", "tipo": "data", "pergunta": "Tem um prazo?"})
        if sem_link:
            gaps.append(link_q)
    return gaps


# ----------------------------------------------------------------------------
# Armazenamento de arquivos: cliente Cloudflare R2 (S3 SigV4, biblioteca padrao)
# ----------------------------------------------------------------------------
# R2 e compativel com S3. Assinamos as requisicoes com AWS Signature v4 usando
# apenas hmac/hashlib — sem boto3, sem dependencias. Mantem o Dockerfile limpo.
def r2_enabled():
    """True apenas quando as quatro variaveis do R2 estao presentes."""
    return all((R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY))


def _sha256_hex(data):
    return hashlib.sha256(data).hexdigest()


def _hmac_sha256(key, msg):
    return hmac.new(key, msg.encode("utf-8"), hashlib.sha256).digest()


def _r2_signing_key(date_stamp):
    k_date = _hmac_sha256(("AWS4" + R2_SECRET_ACCESS_KEY).encode("utf-8"), date_stamp)
    k_region = _hmac_sha256(k_date, R2_REGION)
    k_service = _hmac_sha256(k_region, "s3")
    return _hmac_sha256(k_service, "aws4_request")


def _r2_request(method, key, data=None, content_type=None):
    """Assina e executa uma requisicao S3 path-style no R2.
    Retorna a resposta do urllib (streamable). Quem chama deve fechar/ler."""
    if not r2_enabled():
        raise RuntimeError("R2 nao configurado")
    endpoint = R2_ENDPOINT.rstrip("/")
    host = urlparse(endpoint).netloc
    # Cada segmento do path e URI-encodado, mantendo as barras.
    canonical_key = "/".join(quote(seg, safe="") for seg in key.split("/"))
    canonical_uri = f"/{quote(R2_BUCKET, safe='')}/{canonical_key}"
    url = f"{endpoint}{canonical_uri}"
    payload = data if data is not None else b""
    payload_hash = _sha256_hex(payload)

    now = time.gmtime()
    amz_date = time.strftime("%Y%m%dT%H%M%SZ", now)
    date_stamp = time.strftime("%Y%m%d", now)

    headers = {
        "host": host,
        "x-amz-content-sha256": payload_hash,
        "x-amz-date": amz_date,
    }
    if content_type:
        headers["content-type"] = content_type

    signed_keys = sorted(headers)
    canonical_headers = "".join(f"{k}:{headers[k]}\n" for k in signed_keys)
    signed_headers = ";".join(signed_keys)
    canonical_request = "\n".join(
        [method, canonical_uri, "", canonical_headers, signed_headers, payload_hash]
    )
    scope = f"{date_stamp}/{R2_REGION}/s3/aws4_request"
    string_to_sign = "\n".join(
        ["AWS4-HMAC-SHA256", amz_date, scope, _sha256_hex(canonical_request.encode("utf-8"))]
    )
    signature = hmac.new(
        _r2_signing_key(date_stamp), string_to_sign.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    authorization = (
        f"AWS4-HMAC-SHA256 Credential={R2_ACCESS_KEY_ID}/{scope}, "
        f"SignedHeaders={signed_headers}, Signature={signature}"
    )
    req_headers = dict(headers)
    req_headers["Authorization"] = authorization
    body = payload if method in ("PUT", "POST") else None
    req = urllib.request.Request(url, data=body, method=method, headers=req_headers)
    return urllib.request.urlopen(req, timeout=60)


def r2_put(key, data, content_type):
    resp = _r2_request("PUT", key, data=data, content_type=content_type)
    try:
        resp.read()
    finally:
        resp.close()


def r2_delete(key):
    try:
        resp = _r2_request("DELETE", key)
        try:
            resp.read()
        finally:
            resp.close()
    except urllib.error.HTTPError as e:
        # 404 = objeto ja nao existe; tratamos como sucesso idempotente.
        if e.code not in (200, 204, 404):
            raise


def _safe_name(filename):
    """Higieniza o nome do arquivo para exibicao e para compor a chave no R2."""
    base = os.path.basename((filename or "").replace("\\", "/")) or "arquivo"
    limpo = "".join(ch if (ch.isalnum() or ch in ".-_ ") else "_" for ch in base)
    limpo = limpo.strip() or "arquivo"
    return limpo[:120]


def _build_key(owner_type, owner_id, filename):
    """Caminho unico no bucket: bomdia/<tipo>/<id>/<aleatorio>-<nome>."""
    uid = secrets.token_hex(8)
    return f"{R2_PREFIX}/{owner_type}/{int(owner_id)}/{uid}-{_safe_name(filename)}"


# ----------------------------------------------------------------------------
# Anexos (metadados no banco; bytes no R2)
# ----------------------------------------------------------------------------
_ATT_PUBLIC_COLS = ("id", "owner_type", "owner_id", "filename", "content_type", "size", "created_at")


def _public_att(row):
    """Expoe o anexo ao front SEM revelar a chave interna do R2."""
    if not row:
        return None
    d = dict(row)
    return {k: d.get(k) for k in _ATT_PUBLIC_COLS}


def list_attachments(owner_type, owner_id):
    conn = get_db()
    rows = conn.execute(
        "SELECT id, owner_type, owner_id, filename, content_type, size, created_at "
        "FROM attachments WHERE owner_type = ? AND owner_id = ? ORDER BY id DESC",
        (owner_type, int(owner_id))).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_attachment(att_id):
    conn = get_db()
    row = conn.execute("SELECT * FROM attachments WHERE id = ?", (int(att_id),)).fetchone()
    conn.close()
    return dict(row) if row else None


def create_attachment(owner_type, owner_id, filename, key, content_type, size):
    conn = get_db()
    now = datetime.now().isoformat(timespec="seconds")
    cur = conn.execute(
        "INSERT INTO attachments (owner_type, owner_id, filename, key, content_type, size, created_at) "
        "VALUES (?,?,?,?,?,?,?)",
        (owner_type, int(owner_id), filename, key, content_type, int(size), now))
    conn.commit()
    att_id = cur.lastrowid
    conn.close()
    return att_id


def delete_attachment(att_id):
    """Apaga o objeto no R2 (best-effort) e o registro no banco."""
    att = get_attachment(att_id)
    if not att:
        return False
    if r2_enabled():
        try:
            r2_delete(att["key"])
        except Exception as e:  # noqa: BLE001
            log(f"aviso: falha ao apagar do R2 {att['key']}: {e}")
    conn = get_db()
    conn.execute("DELETE FROM attachments WHERE id = ?", (int(att_id),))
    conn.commit()
    conn.close()
    return True


def delete_attachments_for(owner_type, owner_id):
    """Remove todos os anexos de uma tarefa/projeto (R2 + banco). Best-effort no R2."""
    conn = get_db()
    rows = conn.execute("SELECT id, key FROM attachments WHERE owner_type = ? AND owner_id = ?",
                        (owner_type, int(owner_id))).fetchall()
    conn.close()
    if not rows:
        return
    if r2_enabled():
        for r in rows:
            try:
                r2_delete(r["key"])
            except Exception as e:  # noqa: BLE001
                log(f"aviso: falha ao apagar do R2 {r['key']}: {e}")
    conn = get_db()
    conn.execute("DELETE FROM attachments WHERE owner_type = ? AND owner_id = ?",
                 (owner_type, int(owner_id)))
    conn.commit()
    conn.close()


# ----------------------------------------------------------------------------
# Servidor HTTP
# ----------------------------------------------------------------------------
class Handler(http.server.BaseHTTPRequestHandler):
    """Handler proprio (nao herda SimpleHTTPRequestHandler): entregamos SO os
    arquivos da allowlist publica, nunca o diretorio inteiro. Isso impede que
    codigo (.py), banco (.db), config.json ou scripts (.vbs/.bat) vazem."""

    server_version = "BomDia"

    def log_message(self, fmt, *args):
        # Log enxuto so para erros de servidor (5xx); 2xx/4xx ficam silenciosos.
        return

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "same-origin")
        super().end_headers()

    def _redirect(self, location, status=303):
        self.send_response(status)
        self.send_header("Location", location)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _read_form(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length <= 0 or length > 16_384:
            return {}
        raw = self.rfile.read(length).decode("utf-8", errors="replace")
        return {key: values[-1] for key, values in parse_qs(raw).items() if values}

    def _is_authenticated(self):
        raw_cookie = self.headers.get("Cookie", "")
        if not raw_cookie:
            return False
        try:
            cookies = SimpleCookie()
            cookies.load(raw_cookie)
            morsel = cookies.get(AUTH_COOKIE)
            return bool(morsel and _valid_session_token(morsel.value))
        except Exception:  # cookie malformado simplesmente nao autentica
            return False

    def _serve_login(self, error=False):
        path = os.path.join(BASE_DIR, "login.html")
        try:
            with open(path, "r", encoding="utf-8") as f:
                page = f.read()
        except OSError:
            return self._json({"error": "pagina de login indisponivel"}, 500)
        message = (
            '<p class="login-error" role="alert">Usuário ou senha incorretos.</p>'
            if error else ""
        )
        body = page.replace("{{ERROR}}", message).encode("utf-8")
        self.send_response(401 if error else 200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        data = json.loads(raw) if raw.strip() else {}
        if not isinstance(data, dict):
            raise ValueError("JSON invalido (esperado objeto).")
        return data

    # -- Upload (multipart/form-data parseado a mao) -------------------------
    @staticmethod
    def _disp_param(header, key):
        """Extrai um parametro entre aspas de um Content-Disposition (name, filename)."""
        token = key + '="'
        i = header.find(token)
        if i < 0:
            return None
        i += len(token)
        j = header.find('"', i)
        return header[i:j] if j >= 0 else None

    def _read_multipart(self):
        """Parser minimo de multipart/form-data. Retorna (campos, arquivos).
        arquivos = lista de {name, filename, content_type, data(bytes)}."""
        ctype = self.headers.get("Content-Type", "")
        if "multipart/form-data" not in ctype.lower():
            return {}, []
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length <= 0:
            return {}, []
        if length > MAX_UPLOAD_BYTES + 1_000_000:
            raise ValueError(f"envio acima do limite de {MAX_UPLOAD_MB} MB")
        boundary = ""
        for token in ctype.split(";"):
            token = token.strip()
            if token.lower().startswith("boundary="):
                boundary = token[len("boundary="):].strip().strip('"')
        if not boundary:
            raise ValueError("multipart sem boundary")
        body = self.rfile.read(length)
        delimiter = b"--" + boundary.encode("utf-8")
        fields, files = {}, []
        for part in body.split(delimiter):
            if part in (b"", b"--", b"--\r\n", b"\r\n"):
                continue
            if part.startswith(b"\r\n"):
                part = part[2:]
            if part.endswith(b"\r\n"):
                part = part[:-2]
            header_blob, sep, content = part.partition(b"\r\n\r\n")
            if not sep:
                continue
            disp, part_ctype = "", ""
            for line in header_blob.decode("utf-8", "replace").split("\r\n"):
                low = line.lower()
                if low.startswith("content-disposition:"):
                    disp = line
                elif low.startswith("content-type:"):
                    part_ctype = line.split(":", 1)[1].strip()
            name = self._disp_param(disp, "name")
            filename = self._disp_param(disp, "filename")
            if filename is not None:
                files.append({"name": name, "filename": filename,
                              "content_type": part_ctype, "data": content})
            elif name is not None:
                fields[name] = content.decode("utf-8", "replace")
        return fields, files

    def _download_attachment(self, att_id):
        """Baixa o objeto do R2 e o repassa ao navegador (proxy). O bucket segue
        privado: so quem tem sessao valida chega aqui (gate global em _dispatch)."""
        att = get_attachment(att_id)
        if not att:
            return self._json({"error": "anexo nao encontrado"}, 404)
        if not r2_enabled():
            return self._json({"error": "armazenamento indisponivel"}, 503)
        try:
            resp = _r2_request("GET", att["key"])
        except urllib.error.HTTPError as e:
            log(f"erro download R2 {att['key']}: HTTP {e.code}")
            return self._json({"error": "arquivo indisponivel"}, 502)
        except Exception as e:  # noqa: BLE001
            log(f"erro download R2 {att['key']}: {e}")
            return self._json({"error": "arquivo indisponivel"}, 502)
        try:
            ctype = att.get("content_type") or "application/octet-stream"
            # Imagens (menos SVG) podem abrir inline; o resto forca download.
            inline_ok = ctype.startswith("image/") and ctype != "image/svg+xml"
            disp = "inline" if inline_ok else "attachment"
            fname = (att.get("filename") or "arquivo").replace('"', "")
            length = resp.headers.get("Content-Length")
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header(
                "Content-Disposition",
                f"{disp}; filename=\"{fname}\"; filename*=UTF-8''{quote(att.get('filename') or 'arquivo')}")
            if length:
                self.send_header("Content-Length", length)
            self.end_headers()
            if self.command != "HEAD":
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
        finally:
            resp.close()

    # -- Static (allowlist) --------------------------------------------------
    def _resolve_public(self, url_path):
        """Mapeia a URL para um arquivo publico seguro ou retorna None.
        Bloqueia path traversal e qualquer arquivo fora da allowlist."""
        rel = unquote(url_path).lstrip("/")
        if rel in ("", "/"):
            rel = "index.html"
        # normaliza e rejeita tentativas de subir de diretorio
        rel = rel.replace("\\", "/")
        if ".." in rel.split("/"):
            return None
        top = rel.split("/", 1)[0]
        if rel in PUBLIC_FILES or top in PUBLIC_DIRS:
            full = os.path.normpath(os.path.join(BASE_DIR, rel))
            # garante que o caminho resolvido continua dentro de BASE_DIR
            if os.path.commonpath([full, BASE_DIR]) != BASE_DIR:
                return None
            if os.path.isfile(full):
                return full
        return None

    def _serve_static(self, url_path):
        full = self._resolve_public(url_path)
        if not full:
            return self._json({"error": "nao encontrado"}, 404)
        ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
        if full.lower().endswith(".woff2"):
            ctype = "font/woff2"
        try:
            with open(full, "rb") as f:
                data = f.read()
        except OSError:
            return self._json({"error": "nao encontrado"}, 404)
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    # -- Dispatch com tratamento de erro central -----------------------------
    def do_GET(self):
        self._dispatch(self._route_get)

    def do_HEAD(self):
        self._dispatch(self._route_get)

    def do_POST(self):
        self._dispatch(self._route_post)

    def do_PUT(self):
        self._dispatch(self._route_put)

    def do_DELETE(self):
        self._dispatch(self._route_delete)

    def _dispatch(self, route):
        """Um erro em um request nunca derruba o servidor: vira 400/500 JSON."""
        try:
            path = urlparse(self.path).path
            public = path in (
                "/health", "/api/health", "/login", "/assets/InterVariable.woff2"
            )
            if not public and not self._is_authenticated():
                if path.startswith("/api/"):
                    return self._json({"error": "autenticacao necessaria"}, 401)
                return self._redirect("/login")
            route()
        except (ValueError, json.JSONDecodeError) as e:
            # IDs invalidos, JSON malformado, etc. -> erro do cliente.
            self._json({"error": f"requisicao invalida: {e}"}, 400)
        except BrokenPipeError:
            pass  # cliente desconectou; nada a fazer
        except Exception as e:  # noqa: BLE001
            log(f"erro interno em {self.command} {self.path}: {type(e).__name__}: {e}")
            try:
                self._json({"error": "erro interno do servidor"}, 500)
            except Exception:  # noqa: BLE001
                pass

    def _route_get(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path in ("/health", "/api/health"):
            return self._json({"status": "ok"})
        if path == "/login":
            if self._is_authenticated():
                return self._redirect("/")
            return self._serve_login()
        if path == "/api/tasks":
            return self._json(list_tasks())
        if path == "/api/projects":
            return self._json(list_projects())
        if path == "/api/attachments":
            qs = parse_qs(parsed.query)
            ot = (qs.get("owner_type", [""])[0]).strip()
            oid = (qs.get("owner_id", [""])[0]).strip()
            if ot not in ("task", "project") or not oid.isdigit():
                return self._json({"error": "parametros invalidos"}, 400)
            return self._json({"attachments": list_attachments(ot, int(oid))})
        gparts = path.strip("/").split("/")
        if len(gparts) == 4 and gparts[0] == "api" and gparts[1] == "attachments" and gparts[3] == "download":
            return self._download_attachment(int(gparts[2]))
        if len(gparts) == 4 and gparts[0] == "api" and gparts[1] == "projects" and gparts[3] == "notes":
            return self._json(list_notes(int(gparts[2])))
        if path == "/api/ai/status":
            cfg = load_config()
            return self._json({
                "configured": api_key_ok(cfg.get("openai_api_key", "")),
                "model": cfg.get("model", DEFAULT_MODEL),
                "name": cfg.get("name", ""),
                "env": APP_ENV,
                "local": IS_LOCAL,
                "storage": r2_enabled(),
                "max_upload_mb": MAX_UPLOAD_MB,
            })
        if path.startswith("/api/"):
            return self._json({"error": "rota nao encontrada"}, 404)
        return self._serve_static(path)

    def _route_post(self):
        parsed = urlparse(self.path)
        if parsed.path == "/login":
            form = self._read_form()
            if not _valid_credentials(form.get("username", ""), form.get("password", "")):
                return self._serve_login(error=True)
            self.send_response(303)
            cookie = f"{AUTH_COOKIE}={_new_session_token()}; Path=/; HttpOnly; SameSite=Lax; Max-Age={AUTH_TTL_SECONDS}"
            if not IS_LOCAL:
                cookie += "; Secure"
            self.send_header("Set-Cookie", cookie)
            self.send_header("Location", "/")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if parsed.path == "/logout":
            self.send_response(303)
            cookie = f"{AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0"
            if not IS_LOCAL:
                cookie += "; Secure"
            self.send_header("Set-Cookie", cookie)
            self.send_header("Location", "/login")
            self.send_header("Content-Length", "0")
            self.end_headers()
            return
        if parsed.path == "/api/tasks":
            tid = create_task(self._read_json())
            return self._json({"id": tid}, 201)
        if parsed.path == "/api/projects":
            try:
                pid = create_project(self._read_json())
            except ValueError as e:
                return self._json({"error": str(e)}, 400)
            return self._json({"id": pid}, 201)
        pparts = parsed.path.strip("/").split("/")
        if len(pparts) == 4 and pparts[0] == "api" and pparts[1] == "projects" and pparts[3] == "notes":
            nid = create_note(int(pparts[2]), self._read_json())
            return self._json({"id": nid}, 201)
        if len(pparts) == 4 and pparts[0] == "api" and pparts[1] == "tasks" and pparts[3] == "feito":
            data = self._read_json()
            set_routine_done(int(pparts[2]), bool(data.get("done")))
            return self._json({"ok": True})
        if parsed.path == "/api/open":
            data = self._read_json()
            ok, msg = open_folder(data.get("path", ""))
            return self._json({"ok": ok, "message": msg}, 200 if ok else 400)
        if parsed.path == "/api/ai/config":
            save_config(self._read_json())
            cfg = load_config()
            return self._json({"configured": api_key_ok(cfg.get("openai_api_key", "")),
                               "name": cfg.get("name", "")})
        if parsed.path == "/api/ai/parse":
            data = self._read_json()
            text = (data.get("text") or "").strip()
            if not text:
                return self._json({"error": "Escreva algo para eu organizar."}, 400)
            try:
                tarefas = ai_parse(text)
            except Exception as e:  # noqa: BLE001
                log(f"erro OpenAI (parse): {e}")
                return self._json({"error": str(e)}, 502)
            projetos = list_projetos()
            for t in tarefas:
                t["perguntas"] = build_gaps(t, projetos)
            return self._json({"tarefas": tarefas, "projetos": projetos})
        if parsed.path == "/api/ai/whatsapp":
            data = self._read_json()
            task = data.get("task") or {}
            if not (task.get("title") or "").strip():
                return self._json({"error": "Preciso de uma tarefa com titulo pra montar o recado."}, 400)
            try:
                mensagem = ai_whatsapp(task, data.get("modo", "avisar"))
            except Exception as e:  # noqa: BLE001
                log(f"erro OpenAI (whatsapp): {e}")
                return self._json({"error": str(e)}, 502)
            return self._json({"mensagem": mensagem})
        if parsed.path == "/api/attachments":
            if not r2_enabled():
                return self._json({"error": "Armazenamento de arquivos nao configurado no servidor."}, 503)
            fields, files = self._read_multipart()
            owner_type = (fields.get("owner_type") or "").strip()
            owner_id = (fields.get("owner_id") or "").strip()
            if owner_type not in ("task", "project") or not owner_id.isdigit():
                return self._json({"error": "destino invalido"}, 400)
            enviados = [f for f in files if (f.get("filename") or "").strip() and f.get("data")]
            if not enviados:
                return self._json({"error": "Nenhum arquivo recebido."}, 400)
            salvos = []
            for f in enviados:
                if len(f["data"]) > MAX_UPLOAD_BYTES:
                    return self._json(
                        {"error": f"'{f['filename']}' passa de {MAX_UPLOAD_MB} MB."}, 413)
                ctype = (f.get("content_type") or "").strip() \
                    or mimetypes.guess_type(f["filename"])[0] or "application/octet-stream"
                key = _build_key(owner_type, int(owner_id), f["filename"])
                try:
                    r2_put(key, f["data"], ctype)
                except Exception as e:  # noqa: BLE001
                    log(f"erro upload R2: {e}")
                    return self._json({"error": "Falha ao enviar ao armazenamento."}, 502)
                att_id = create_attachment(owner_type, int(owner_id),
                                           _safe_name(f["filename"]), key, ctype, len(f["data"]))
                salvos.append(_public_att(get_attachment(att_id)))
            return self._json({"attachments": salvos}, 201)
        return self._json({"error": "rota nao encontrada"}, 404)

    def _route_put(self):
        parts = urlparse(self.path).path.strip("/").split("/")
        if len(parts) == 3 and parts[0] == "api" and parts[1] == "tasks":
            update_task(int(parts[2]), self._read_json())
            return self._json({"ok": True})
        if len(parts) == 3 and parts[0] == "api" and parts[1] == "subtasks":
            update_subtask(int(parts[2]), self._read_json())
            return self._json({"ok": True})
        if len(parts) == 3 and parts[0] == "api" and parts[1] == "projects":
            update_project(int(parts[2]), self._read_json())
            return self._json({"ok": True})
        if len(parts) == 3 and parts[0] == "api" and parts[1] == "notes":
            update_note(int(parts[2]), self._read_json())
            return self._json({"ok": True})
        return self._json({"error": "rota nao encontrada"}, 404)

    def _route_delete(self):
        parts = urlparse(self.path).path.strip("/").split("/")
        if len(parts) == 3 and parts[0] == "api" and parts[1] == "tasks":
            delete_task(int(parts[2]))
            return self._json({"ok": True})
        if len(parts) == 3 and parts[0] == "api" and parts[1] == "projects":
            delete_project(int(parts[2]))
            return self._json({"ok": True})
        if len(parts) == 3 and parts[0] == "api" and parts[1] == "notes":
            delete_note(int(parts[2]))
            return self._json({"ok": True})
        if len(parts) == 3 and parts[0] == "api" and parts[1] == "attachments":
            delete_attachment(int(parts[2]))
            return self._json({"ok": True})
        return self._json({"error": "rota nao encontrada"}, 404)


class ThreadingServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


URL = f"http://localhost:{PORT}"


def create_server(host=None):
    """Cria o servidor (sem iniciar). Usado pelo app da bandeja (modo local)."""
    init_db()
    return ThreadingServer((host or HOST, PORT), Handler)


def main():
    init_db()
    log(f"{APP_NAME} iniciando")
    log(f"ambiente: {APP_ENV} (local={IS_LOCAL})")
    log(f"escutando em: http://{HOST}:{PORT}")
    log(f"banco:  {DB_PATH}")
    log(f"config: {CONFIG_PATH}")
    log(f"login temporario ativo para: {AUTH_USER}")
    if not os.environ.get("AUTH_SECRET"):
        log("aviso: AUTH_SECRET nao definido; sessoes serao encerradas no proximo restart")
    cfg = load_config()
    log(f"OpenAI configurada: {api_key_ok(cfg.get('openai_api_key', ''))} | modelo: {cfg.get('model', DEFAULT_MODEL)}")
    # Navegador so abre no modo local (na VPS nao ha desktop).
    if IS_LOCAL:
        try:
            webbrowser.open(f"http://localhost:{PORT}")
        except Exception:  # noqa: BLE001
            pass
    with ThreadingServer((HOST, PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            log("encerrando. Ate amanha, bom dia!")


if __name__ == "__main__":
    main()
