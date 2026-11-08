"""Build the four-background, quiz-size artwork review for batch11 (#72)."""
from pathlib import Path
import html
import json
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'scripts/cards'))
from render_review import asset_status_label, disposition_summary

folder=Path(__file__).resolve().parent
manifest=json.loads((folder/'manifest.json').read_text())
style='''*{box-sizing:border-box}body{font:16px system-ui;color:#3f2468;margin:0;padding:20px;background:#faf8fc}section{padding:20px;margin:0 0 24px;max-width:950px}.grid{display:grid;grid-template-columns:repeat(5,145px);gap:20px}figure{margin:0}img{display:block;width:145px;height:145px;background:transparent}figcaption{font-size:12px;line-height:1.5}h1,h2{margin:0 0 18px}@media(max-width:800px){.grid{grid-template-columns:repeat(2,145px);gap:12px}body{padding:8px}section{padding:10px}}'''
parts=['<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Batch11 alpha review</title><style>'+style+'</style><h1>Cards169–193 · at145px</h1><p>'+html.escape(disposition_summary(manifest))+'</p>']
for name,color in [('white','#ffffff'),('yellow','#fff2c5'),('pink','#fff0f5'),('lavender','#f6efff')]:
    parts.append(f'<section data-color="{name}" style="background:{color}"><h2>{name} · {color}</h2><div class="grid">')
    for number,asset in enumerate(manifest['assets'],manifest['numberStart']):
        label=html.escape(asset['meaning'])
        status=html.escape(asset_status_label(asset))
        parts.append(f'<figure><img src="{Path(asset["path"]).name}" alt="{label}"><figcaption>{number} · {label}<br>{status}</figcaption></figure>')
    parts.append('</div></section>')
parts.append('</html>')
(folder/'alpha-review.html').write_text(''.join(parts))
print(f'Built{len(manifest["assets"])*4}alpha previews.')
