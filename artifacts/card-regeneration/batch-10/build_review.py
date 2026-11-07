from pathlib import Path
import json,html
root=Path(__file__).resolve().parents[3];folder=root/'artifacts/card-regeneration/batch-10'
scope=json.loads((folder/'scope.json').read_text())
cards={c['id']:c for c in json.loads((root/'content/card-regeneration/prompts.json').read_text())['cards']}
assets={}
for f in sorted((root/'artifacts/card-regeneration').glob('batch-*/manifest.json')):
 m=json.loads(f.read_text())
 for n,a in enumerate(m['assets'],m.get('numberStart',1)):assets[a['id']]={'number':n,**a}
manifest=json.loads((folder/'manifest.json').read_text())
references=manifest.get('approvedReferenceRevisions', [])+manifest.get('referenceRevisions', [])
for candidate in references:
 assets[candidate['id']]=candidate
style='''*{box-sizing:border-box}body{margin:0;padding:24px;color:#3f2468;background:#faf8fc;font:16px system-ui}main{max-width:1200px;margin:auto}section{padding:24px;background:#fff;margin-bottom:24px}h1{margin:0 0 10px;font-size:28px}h2{margin:0 0 12px;font-size:22px}p{line-height:1.5;max-width:1000px}.grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:20px}figure{margin:0;min-width:0}img{display:block;width:100%;height:auto}figcaption{font-size:14px;line-height:1.5;margin-top:6px}figcaption b,figcaption span,figcaption small{display:block}small{color:#66517d}.alpha-grid{grid-template-columns:repeat(5,145px);gap:20px}.alpha-grid img{width:145px;height:145px}@media(max-width:700px){body{padding:10px}section{padding:12px}.grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.alpha-grid{grid-template-columns:repeat(2,145px)}h1{font-size:24px}}'''
pending_references=len(manifest.get('referenceRevisions', []))
reference_count=len(references)
approved=all(a.get('status') in ('approved','accepted-with-known-issue') for a in manifest['assets']+references)
new_count=len(manifest['assets'])
approved_count=len(scope['records'])-new_count-reference_count
review_summary=(f'{new_count} new cards (136–168) and {reference_count} earlier-card revisions are approved.' if approved else f'{new_count} new cards (136–168) and {pending_references} earlier-card revisions await feedback.')
rows=[f'<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Numerical card families</title><style>'+style+f'</style><main><h1>Numbers, things and day numbers</h1><p>{review_summary} {approved_count} approved cards are included for comparison. Original card numbers are retained. Both 10,000 entries share one illustration. Currency and other object-counter families retain their separate designs.</p><p>Illustrated PNG style, slightly lighter badge lettering and nine pool balls generated from exact SVG circle templates. Green6retains its clean earlier PNGafter transparency artifacts in the SVG-guided attempts. Labels use K from 1000 and M from 1000000. Colors follow actual values: pool balls 1–15; lavender 16–99; pink 100–999; sky blue 1000–9999; gold 10000+. Original prompts, feedback and rejected variants remain archived.</p>']
for group,title in [('numbers','Numbers'),('things','Numbers of things'),('dates','Day numbers')]:
 rows.append(f'<section data-family="{group}"><h2>{title}</h2><div class="grid">')
 for r in scope['records']:
  if r['category']!=group:continue
  a=assets[r['id']];c=cards[r['id']];new=a['path'].startswith('artifacts/card-regeneration/batch-10/')
  src='../'+Path(a['path']).parent.name+'/'+Path(a['path']).name
  label=f"{a['number']} · {c['meaning']}"
  status=('Approved revision' if a.get('revisionRound') else 'Approved new card') if new and a.get('status') in ('approved','accepted-with-known-issue') else (('Revised · awaiting feedback' if a.get('revisionRound') else 'New · awaiting feedback') if new else 'Previously approved reference')
  rows.append(f'<figure data-id="{r["id"]}" data-new="{str(new).lower()}"><a href="{html.escape(src)}"><img src="{html.escape(src)}" alt="{html.escape(c["meaning"])}"></a><figcaption><b>{html.escape(label)}</b><span lang="ja">{html.escape(c["japanese"])}</span><small>{status}</small></figcaption></figure>')
 rows.append('</div></section>')
rows.append('</main></html>')
(folder/'family-review.html').write_text(''.join(rows))
manifest=json.loads((folder/'manifest.json').read_text())
rows=['<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Numerical alpha review</title><style>'+style+'</style><main><h1>New numerical cards at 145px</h1>']
for color,value in [('white','#ffffff'),('yellow','#fff2c5'),('pink','#fff0f5'),('lavender','#f6efff')]:
 rows.append(f'<section data-color="{color}" style="background:{value}"><h2>{color} · {value}</h2><div class="grid alpha-grid">')
 for n,a in list(enumerate(manifest['assets'],136))+[(a['number'],a) for a in references]:rows.append(f'<figure><img src="{Path(a["path"]).name}" alt="{html.escape(cards[a["id"]]["meaning"])}"><figcaption>{n} · {html.escape(cards[a["id"]]["meaning"])}</figcaption></figure>')
 rows.append('</div></section>')
rows.append('</main></html>')
(folder/'alpha-review.html').write_text(''.join(rows))
print(f'Built {len(scope["records"])} family panels and {4*(new_count+reference_count)} alpha previews, including {reference_count} earlier-card revisions.')
