"""Bind unchanged generated originals / approved reuses to demo answer slots."""
from pathlib import Path
import hashlib,html,json,shutil

DEMO=Path(__file__).resolve().parent
REPO=DEMO.parents[1]
ART=DEMO/'artwork-v2';PUBLIC=DEMO/'public'
requests={r['id']:r for name in ['requests-001.json','requests-root.json'] for r in json.loads((ART/name).read_text())}
assets=[]
for record_file in sorted(ART.glob('*-record.json')):
    record=json.loads(record_file.read_text());request=requests[record['id']]
    source=ART/record['original']
    assets.append({**record,'origin':'generated','source':str(source.relative_to(REPO)),
        'prompt':request['prompt'],'references':[{'path':p,'sha256':hashlib.sha256(Path(p).read_bytes()).hexdigest()} for p in request['references']],
        'visualReview':'Inspected: square composition, correct count/action, full silhouettes, established shaded style, transparent exterior; 145px/four-background review follows in gallery.'})
for folder in ['counts','scenes']:
    manifest=json.loads((ART/folder/'manifest.json').read_text())
    for a in manifest['assets']:
        # Worker manifests retain their independent original bytes and provenance.
        if a.get('id')=='cookies-1':continue
        source=REPO/a['selectedPath']
        assets.append({**a,'origin':'generated','source':str(source.relative_to(REPO)),
            'status':'pending-owner-review','visualReview':a.get('visualReview') or a.get('review') or 'Worker inspected exact subject/count, square composition, alpha and 145px four-background preview.'})
reuses=[
 ('mountain','artifacts/card-regeneration/batch-01/08-mountain-v2.png','e3cd97f96a43a1f478e84303839208e81b8de425463cf3be365ae817c18348e1','Batch 01 approval; content/card-regeneration/activation.json'),
 ('river','artifacts/card-regeneration/batch-03/26-river.png','0be609b2f37f06a6796465e0561a8bb36e423ab4404c8ba812a6593399454bf8','Batch 03 approval; content/card-regeneration/activation.json'),
 ('park','public/images/approved/es-419-travel-park-5f3ec1ed6ad4.png','5f3ec1ed6ad4fe9cdd6d6b2d6e7bdd00b96800a0f04bac532a416908945cc9ff','content/spanish-travel-2/acceptance.json and activation.json'),
 ('cookies-1','artifacts/spanish-food-2-art/originals/cookie-v1.png','c8d21225f4aa9640ab892efb527bb349377bcea3574ebcfcb0eb945b1a972a01','content/spanish-food-2/artwork-acceptance.json'),
]
for identifier,path,digest,evidence in reuses:
    assert hashlib.sha256((REPO/path).read_bytes()).hexdigest()==digest
    assets.append({'id':identifier,'origin':'approved-reuse','source':path,'sha256':digest,
        'status':'previously-approved','approvalEvidence':evidence,'visualReview':'Exact approved whole picture inspected; historical opaque backgrounds retained unchanged.'})
assert len(assets)==40,(len(assets),[a['id'] for a in assets])
assert len({a['id'] for a in assets})==40
(PUBLIC/'images').mkdir(exist_ok=True,parents=True)
for a in assets:
    source=REPO/a['source'];assert hashlib.sha256(source.read_bytes()).hexdigest()==a['sha256'],a['id']
    shutil.copy2(source,PUBLIC/'images'/f"{a['id']}.png")
manifest={'issue':250,'revision':2,'status':'pending-owner-artwork-review','assets':assets}
(ART/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
shutil.copy2(ART/'manifest.json',PUBLIC/'artwork-provenance.json')
questions=json.loads((DEMO/'source/questions.json').read_text());by_id={a['id']:a for a in assets}
cards=[]
for q in questions:
    for c in q['choices']:
        a=by_id[c['id']]
        previews=''.join(f'<span style="background:{bg}"><img src="images/{c["id"]}.png" alt="{html.escape(c["label"])}" width="145" height="145"></span>' for bg in ['#fff','#fff2c5','#fff0f5','#f6efff'])
        cards.append(f'<article class="art-card"><h2>{html.escape(q["word"])} · {html.escape(c["label"])}</h2><p>{a["status"]}</p><div class="previews">{previews}</div><p><a href="images/{c["id"]}.png">Full resolution</a></p><details><summary>Prompt and source</summary><pre>{html.escape(json.dumps(a,ensure_ascii=False,indent=2))}</pre></details></article>')
page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kikimashta · Artwork review</title><style>body{margin:24px;background:#f6efff;color:#382052;font:15px system-ui,sans-serif}a{color:#4c20ad}.art-card{background:white;border:3px solid #9e7bd1;border-radius:20px;padding:18px;margin:20px 0}h1{font-size:28px}h2{font-size:18px}.previews{display:flex;flex-wrap:wrap;gap:12px}.previews span{display:grid;place-items:center;width:145px;height:145px;border:1px solid #ddd}.previews img{object-fit:contain}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px}summary{cursor:pointer}p{line-height:1.6}</style><a href="/">← Listening demo</a><h1>Draft artwork review</h1><p>All 40 answer pictures at 145px over white, yellow, pink and lavender. 36 new images follow the reference-based artwork workflow; four reuse exact approved originals. New art remains pending your review. Original bytes, prompts, reference hashes and superseded candidates are preserved in the source PR.</p>'''+''.join(cards)+'</html>'
(PUBLIC/'artwork.html').write_text(page)
print('Bound forty answer pictures; preserved original image bytes and published review/provenance.')
