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


def task_to_dict(row, links):
    d = dict(row)
    d["links"] = [dict(l) for l in links]
    return d


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
        result.append(task_to_dict(t, links))
    conn.close()
    return result


def create_task(data):
    conn = get_db()
    tipo = data.get("tipo", "tarefa")
    if tipo not in TIPOS:
        tipo = "tarefa"
    projeto = (data.get("projeto") or "").strip()
    cur = conn.execute(
        """INSERT INTO tasks (title, requested_by, send_to, due_date,
                              priority, description, status, created_at, tipo, projeto)
           VALUES (?,?,?,?,?,?,?,?,?,?)""",
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
    conn.commit()
    conn.close()


def delete_task(task_id):
    conn = get_db()
    conn.execute("DELETE FROM links WHERE task_id = ?", (task_id,))
    conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
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
     "projeto": "nome do projeto/cliente a que isso pertence, ou \\"\\" se for avulso",
     "requested_by": "quem pediu, se mencionado, senao \\"\\"",
     "send_to": "para quem enviar, se mencionado, senao \\"\\"",
     "motivo": "1 frase curta explicando a prioridade/urgencia ou o fluxo"}
  ]}
- Duas dimensoes independentes:
  * "tipo" = a natureza: "tarefa" (algo a fazer/entregar), "ideia" (pensamento solto pra depois),
    "rotina" (recorrente/habito).
  * "projeto" = o agrupador. Se a demanda pertence a um projeto ou cliente (ex.: "Dina",
    "Bellelli", "campanha X"), coloque o nome. Elas se cruzam: pode haver uma "ideia" do
    projeto "Dina" (tipo=ideia, projeto=Dina) ou uma "rotina" de um projeto.
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
        clean.append({
            "title": (t.get("title") or "").strip(),
            "description": (t.get("description") or "").strip(),
            "priority": t.get("priority") if t.get("priority") in ("alta", "media", "baixa") else "media",
            "due_date": (t.get("due_date") or "").strip(),
            "tipo": tipo if tipo in TIPOS else "tarefa",
            "projeto": (t.get("projeto") or "").strip(),
            "requested_by": (t.get("requested_by") or "").strip(),
            "send_to": (t.get("send_to") or "").strip(),
            "motivo": (t.get("motivo") or "").strip(),
        })
    return clean


# ----------------------------------------------------------------------------
# Servidor HTTP
# ----------------------------------------------------------------------------
class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=BASE_DIR, **kwargs)

    def log_message(self, *args):
        pass  # silencia o log padrao

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
            return self._json({"tarefas": tarefas})
        return self._json({"error": "rota nao encontrada"}, 404)

    def do_PUT(self):
        parsed = urlparse(self.path)
        parts = parsed.path.strip("/").split("/")
        if len(parts) == 3 and parts[0] == "api" and parts[1] == "tasks":
            update_task(int(parts[2]), self._read_json())
            return self._json({"ok": True})
        return self._json({"error": "rota nao encontrada"}, 404)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        parts = parsed.path.strip("/").split("/")
        if len(parts) == 3 and parts[0] == "api" and parts[1] == "tasks":
            delete_task(int(parts[2]))
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
