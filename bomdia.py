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
from urllib.parse import urlparse
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "bomdia.db")
PORT = 9463


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
    conn.commit()
    conn.close()


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
    cur = conn.execute(
        """INSERT INTO tasks (title, requested_by, send_to, due_date,
                              priority, description, status, created_at)
           VALUES (?,?,?,?,?,?,?,?)""",
        (
            data.get("title", "").strip() or "Sem titulo",
            data.get("requested_by", "").strip(),
            data.get("send_to", "").strip(),
            data.get("due_date", "").strip(),
            data.get("priority", "media"),
            data.get("description", "").strip(),
            data.get("status", "aberta"),
            datetime.now().isoformat(timespec="seconds"),
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
              "priority", "description", "status"]
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
