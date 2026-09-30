# Genera los archivos para pegar en un Custom Widget de StreamElements.
# Uso: python tools/build_se.py   ->  streamelements/{html.html, css.css, js.js, fields.json}
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
out = root / "streamelements"
out.mkdir(exist_ok=True)

html = (root / "index.html").read_text(encoding="utf-8")
js = (root / "alerts.js").read_text(encoding="utf-8")

# SE ya pone <html>/<head>/<body>: nos quedamos con fuentes, importmap, markup y el script clásico,
# y el módulo va en línea (SE no puede servir alerts.js como archivo aparte).
fonts = "\n".join(re.findall(r"<link[^>]+(?:fonts\.googleapis|fonts\.gstatic)[^>]*>", html))
importmap = re.search(r'<script type="importmap">.*?</script>', html, re.S).group(0)
body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
body = body.replace('<script type="module" src="alerts.js"></script>', f'<script type="module">\n{js}\n</script>')

(out / "html.html").write_text(f"{fonts}\n{importmap}\n{body.strip()}\n", encoding="utf-8")
(out / "css.css").write_text((root / "style.css").read_text(encoding="utf-8"), encoding="utf-8")
(out / "js.js").write_text("// Todo el código vive en la pestaña HTML (módulo ES con Three.js).\n", encoding="utf-8")

fields = {
    "modelsUrl": {
        "type": "text",
        "label": "URL pública de la carpeta de modelos (.glb)",
        "value": "https://sroy7th.github.io/alertas-3d/models/",
    },
    "volume": {"type": "slider", "label": "Volumen", "value": 60, "min": 0, "max": 100, "step": 1},
    "holdSeconds": {
        "type": "number",
        "label": "Segundos en pantalla por alerta",
        "value": 5,
        "min": 2,
        "max": 15,
    },
    "currency": {"type": "text", "label": "Símbolo de moneda", "value": "$"},
    "look": {
        "type": "dropdown",
        "label": "Estilo de la etiqueta",
        "value": "tema",
        "options": {"tema": "Temática por objeto", "liston": "Listón", "editorial": "Editorial"},
    },
}
(out / "fields.json").write_text(json.dumps(fields, ensure_ascii=False, indent=2), encoding="utf-8")
print("OK", *(p.name for p in out.iterdir()))
