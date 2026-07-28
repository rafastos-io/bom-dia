#!/usr/bin/env python3
"""
BOM DIA - organizador pessoal de demandas.
Roda 100% local: servidor Python + banco SQLite no proprio computador.
Sem dependencias externas (so biblioteca padrao).
"""
import http.server
import socketserver
import sqlite3
import json
import os
import sys
import webbrowser
import urllib.request
import urllib.error
from urllib.parse import urlparse
from datetime import datetime, date

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "bomdia.db")
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")
PORT = 9463

NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions"
DEFAULT_MODEL = "meta/llama-3.1-8b-instruct"
TIPOS = ("tarefa", "ideia", "rotina")
RECORRENCIAS = ("diaria", "semanal", "mensal")


# ----------------------------------------------------------------------------
# Banco de dados
# ----------------------------------------------------------------------------
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
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
    cfg = {"name": "", "nvidia_api_key": "", "model": DEFAULT_MODEL}
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            cfg.update(json.load(f))
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    # variavel de ambiente tem prioridade se estiver setada
    env_key = os.environ.get("NVIDIA_API_KEY")
    if env_key:
        cfg["nvidia_api_key"] = env_key
    return cfg


def save_config(data):
    cfg = load_config()
    for k in ("name", "nvidia_api_key", "model"):
        if k in data and data[k] is not None:
            cfg[k] = data[k]
    # nao persiste a chave vinda de env var por engano
    to_save = {"name": cfg.get("name", ""),
               "nvidia_api_key": cfg.get("nvidia_api_key", ""),
               "model": cfg.get("model", DEFAULT_MODEL)}
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(to_save, f, ensure_ascii=False, indent=2)


def api_key_ok(key):
    return bool(key) and key.strip().startswith("nvapi-")


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


def list_tasks():
    conn = get_db()
    tasks = conn.execute(
        "SELECT * FROM tasks ORDER BY "
        "CASE status WHEN 'concluida' THEN 1 ELSE 0 END, "
        "CASE priority WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, "
        "COALESCE(due_date, '9999-12-31') ASC, id DESC"
    ).fetchall()
    result = []
    for t in tasks:
        links = conn.execute(
            "SELECT * FROM links WHERE task_id = ? ORDER BY id", (t["id"],)
        ).fetchall()
        subs = conn.execute(
            "SELECT id, title, done, position FROM subtasks WHERE task_id = ? ORDER BY position, id",
            (t["id"],),
        ).fetchall()
        result.append(task_to_dict(t, links, subs))
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
    conn = get_db()
    conn.execute("DELETE FROM links WHERE task_id = ?", (task_id,))
    conn.execute("DELETE FROM subtasks WHERE task_id = ?", (task_id,))
    conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    conn.commit()
    conn.close()


# ----------------------------------------------------------------------------
# Projetos como entidade (escopo, links fixos, envolvidos)
# ----------------------------------------------------------------------------
def _proj_links(conn, pid):
    return [dict(r) for r in conn.execute(
        "SELECT id, kind, label, target FROM project_links WHERE project_id = ? ORDER BY id", (pid,))]


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
            "INSERT INTO project_links (project_id, kind, label, target) VALUES (?,?,?,?)",
            (pid, l.get("kind", "web"), (l.get("label") or "").strip(), target))


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
    conn = get_db()
    p = conn.execute("SELECT name FROM projects WHERE id = ?", (pid,)).fetchone()
    if p:
        conn.execute("UPDATE tasks SET projeto = '' WHERE projeto = ?", (p["name"],))
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
    """Abre uma pasta (ou arquivo) local no Explorer do Windows."""
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
# Assistente de IA (NVIDIA API Catalog - compativel com OpenAI)
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
- "links": extraia QUALQUER url (http/https) ou caminho de pasta que a pessoa mencionar e coloque
  no campo "links" da tarefa a que pertence. kind="web" para links da internet (ex.: Canva, Drive,
  YouTube), kind="pasta" para caminhos de pasta do PC (ex.: C:\\...). Nunca descarte um link que a
  pessoa passou - ele quase sempre e o material da demanda.
- Prioridade pela urgencia real: prazo curto ou cobranca = alta.
- Resolva datas relativas ("sexta que vem", "amanha", "semana que vem") usando a data de hoje.
- Se o texto tiver varias demandas, separe em varios itens e ordene do mais importante ao menos.
- Escreva em portugues do Brasil.
"""


def call_nvidia(messages, model=None, temperature=0.2, timeout=45):
    cfg = load_config()
    key = cfg.get("nvidia_api_key", "").strip()
    if not api_key_ok(key):
        raise RuntimeError("Chave da NVIDIA nao configurada (esperado algo como nvapi-...).")
    payload = json.dumps({
        "model": model or cfg.get("model", DEFAULT_MODEL),
        "messages": messages,
        "temperature": temperature,
        "max_tokens": 1024,
    }).encode("utf-8")
    req = urllib.request.Request(
        NVIDIA_URL, data=payload, method="POST",
        headers={"Content-Type": "application/json",
                 "Authorization": f"Bearer {key}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "ignore")[:300]
        if e.code in (401, 403):
            raise RuntimeError("Chave da NVIDIA invalida ou sem permissao.") from e
        raise RuntimeError(f"Erro da NVIDIA (HTTP {e.code}): {detail}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"Sem conexao com a NVIDIA: {e.reason}") from e
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
    raw = call_nvidia(messages)
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


def list_projetos():
    """Projetos ja existentes, pra sugerir nas perguntas de lacuna."""
    conn = get_db()
    rows = conn.execute(
        "SELECT DISTINCT projeto FROM tasks WHERE projeto IS NOT NULL AND TRIM(projeto) <> ''"
    ).fetchall()
    conn.close()
    return sorted({(r[0] or "").strip() for r in rows}, key=str.lower)


def build_gaps(task, projetos):
    """O CODIGO decide quais perguntas fazer, olhando os campos vazios.
    Cada 'lacuna' vira um modulo de pergunta com o tipo de resposta certo."""
    gaps = []
    if not (task.get("projeto") or "").strip():
        gaps.append({
            "campo": "projeto", "tipo": "opcoes",
            "pergunta": "A que projeto isso pertence?",
            "opcoes": projetos,
        })
    if not (task.get("due_date") or "").strip():
        gaps.append({
            "campo": "prazo", "tipo": "data",
            "pergunta": "Tem um prazo?",
        })
    if not task.get("links"):
        gaps.append({
            "campo": "links", "tipo": "link",
            "pergunta": "Algum link ou pasta? (Canva, Drive, pasta do PC)",
        })
    return gaps


# ----------------------------------------------------------------------------
# Servidor HTTP
# ----------------------------------------------------------------------------
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def log_message(self, *args):
        pass  # silencia o log padrao

    def end_headers(self):
        # App local de dev/uso pessoal: nunca cachear, pra edicoes aparecerem no refresh.
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        super().end_headers()

    def _json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/tasks":
            return self._json(list_tasks())
        if parsed.path == "/api/projects":
            return self._json(list_projects())
        gparts = parsed.path.strip("/").split("/")
        if len(gparts) == 4 and gparts[0] == "api" and gparts[1] == "projects" and gparts[3] == "notes":
            return self._json(list_notes(int(gparts[2])))
        if parsed.path == "/api/ai/status":
            cfg = load_config()
            return self._json({
                "configured": api_key_ok(cfg.get("nvidia_api_key", "")),
                "model": cfg.get("model", DEFAULT_MODEL),
                "name": cfg.get("name", ""),
            })
        if parsed.path == "/" or parsed.path == "":
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/tasks":
            data = self._read_json()
            tid = create_task(data)
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
            return self._json({"configured": api_key_ok(cfg.get("nvidia_api_key", "")),
                               "name": cfg.get("name", "")})
        if parsed.path == "/api/ai/parse":
            data = self._read_json()
            text = (data.get("text") or "").strip()
            if not text:
                return self._json({"error": "Escreva algo para eu organizar."}, 400)
            try:
                tarefas = ai_parse(text)
            except Exception as e:  # noqa: BLE001
                return self._json({"error": str(e)}, 502)
            projetos = list_projetos()
            for t in tarefas:
                t["perguntas"] = build_gaps(t, projetos)
            return self._json({"tarefas": tarefas, "projetos": projetos})
        return self._json({"error": "rota nao encontrada"}, 404)

    def do_PUT(self):
        parsed = urlparse(self.path)
        parts = parsed.path.strip("/").split("/")
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

    def do_DELETE(self):
        parsed = urlparse(self.path)
        parts = parsed.path.strip("/").split("/")
        if len(parts) == 3 and parts[0] == "api" and parts[1] == "tasks":
            delete_task(int(parts[2]))
            return self._json({"ok": True})
        if len(parts) == 3 and parts[0] == "api" and parts[1] == "projects":
            delete_project(int(parts[2]))
            return self._json({"ok": True})
        if len(parts) == 3 and parts[0] == "api" and parts[1] == "notes":
            delete_note(int(parts[2]))
            return self._json({"ok": True})
        return self._json({"error": "rota nao encontrada"}, 404)


class ThreadingServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


URL = f"http://localhost:{PORT}"


def create_server():
    """Cria o servidor (sem iniciar). Usado pelo app da bandeja."""
    init_db()
    return ThreadingServer(("127.0.0.1", PORT), Handler)


def main():
    init_db()
    url = f"http://localhost:{PORT}"
    print("=" * 48)
    print("  BOM DIA  -  organizador pessoal")
    print("=" * 48)
    print(f"  Rodando em: {url}")
    print(f"  Banco:      {DB_PATH}")
    print("  Para fechar: feche esta janela (ou Ctrl+C)")
    print("=" * 48)
    try:
        webbrowser.open(url)
    except Exception:
        pass
    with ThreadingServer(("127.0.0.1", PORT), Handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nAte amanha. Bom dia!")


if __name__ == "__main__":
    main()
