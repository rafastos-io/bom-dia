"""
BOM DIA - versao bandeja (system tray).
Roda sem janela de terminal. Aparece um icone de sol ao lado do relogio.
Clique com o botao direito: Abrir Bom Dia / Sair.
Clique duplo no icone: abre o app.
"""
import os
import sys
import math
import threading
import webbrowser

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)

import bomdia  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402
import pystray  # noqa: E402
from pystray import MenuItem as Item, Menu  # noqa: E402


def make_icon_image():
    """Desenha um solzinho laranja (nascer do dia) para a bandeja."""
    size = 64
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cx, cy, r = 32, 34, 13
    orange = (224, 117, 45, 255)
    # raios
    for i in range(12):
        a = math.radians(i * 30)
        x1 = cx + math.cos(a) * (r + 5)
        y1 = cy + math.sin(a) * (r + 5)
        x2 = cx + math.cos(a) * (r + 12)
        y2 = cy + math.sin(a) * (r + 12)
        d.line([(x1, y1), (x2, y2)], fill=orange, width=4)
    # disco do sol
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(240, 160, 70, 255))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=orange, width=3)
    return img


class App:
    def __init__(self):
        # Se a porta ja estiver em uso, provavelmente ja existe uma instancia
        # rodando: nesse caso seguimos so com o icone, sem subir outro servidor.
        try:
            self.httpd = bomdia.create_server()
        except OSError:
            self.httpd = None

    def start(self):
        if self.httpd is not None:
            threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        menu = Menu(
            Item("Abrir Bom Dia", self.on_open, default=True),
            Item("Sair", self.on_quit),
        )
        self.icon = pystray.Icon(
            "bomdia", make_icon_image(), "Bom Dia", menu=menu
        )
        # abre o navegador na primeira vez
        self.on_open()
        self.icon.run()

    def on_open(self, *args):
        webbrowser.open(bomdia.URL)

    def on_quit(self, *args):
        try:
            if self.httpd is not None:
                self.httpd.shutdown()
        except Exception:
            pass
        self.icon.stop()


if __name__ == "__main__":
    App().start()
