"""Build the local artwork review gallery and readable dependency graph (#72)."""
import hashlib
import html
import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'content/card-regeneration'


def render_graph(cards, graph):
    lookup = {c['id']: c for c in cards}
    lines = ['# Card generation dependency graph', '',
             'Tracked in [issue #72](https://github.com/ajhconway/kikimashta/issues/72). Arrows mean “establish before using as a reference.” Visual dependencies and semantic answer exclusions are separate.', '',
             '```mermaid', 'flowchart TD',
             '  S[Shared flat cartoon style] --> B[Batch 01: ten foundation cards]',
             '  B --> F[User feedback and revisions]',
             '  F --> A[Approved reference assets]',
             '  A --> O[Objects, counts and comparisons]',
             '  A --> P[People, body parts and actions]',
             '  A --> L[Landscapes and settings]',
             '  S --> C[Shared prompt conventions: calendars, arrows, boxes, buildings]',
             '  C --> R[Establish and review support references]',
             '  R --> N[Later card batches]', '  O --> N', '  P --> N', '  L --> N',
             '  N --> G[Feedback gate after every batch]', '```', '',
             '## Reusable components', '', '| Component | Seed card | Reference status | Dependent cards |',
             '| --- | --- | --- | ---: |']
    for comp in (n for n in graph['nodes'] if n['kind'] == 'component'):
        name = comp['id'].split(':', 1)[1]
        seed = comp['seedCard']
        label = f"{lookup[seed]['japanese']} / {lookup[seed]['meaning']} (`{seed}`)" if seed else 'Prompt convention; support reference still to be established'
        count = sum(comp['id'] in c['dependsOn'] for c in cards)
        lines.append(f'| {name} | {label} | {comp["status"]} | {count} |')
    style_nodes = [n for n in graph['nodes'] if n['kind'] == 'style' and n['id'] != 'style']
    if style_nodes:
        section = ['## Scoped style trials', '', '| Profile | Reference | Status | Cards |', '| --- | --- | --- | ---: |']
        for style in style_nodes:
            count = sum(c.get('styleNode') == style['id'] for c in cards)
            section.append(f'| {style["id"]} | [{Path(style["referencePath"]).name}](../../{style["referencePath"]}) | {style["status"]} | {count} |')
        section += ['', 'A style trial is an independent root in the generation graph. It replaces the previous style only for its assigned cards until user review.', '']
        position = lines.index('## Reusable components')
        lines[position:position] = section
    families = [node for node in graph['nodes'] if node['kind'] == 'family']
    if families:
        lines += ['', '## Shared design families', '', '| Family | Status | Reference | Guidance |', '| --- | --- | --- | --- |']
        for family in families:
            ref = f'[{Path(family["referencePath"]).name}](../../{family["referencePath"]})' if family.get('referencePath') else 'Prompt convention'
            lines.append(f'| {family["id"]} | {family["status"]} | {ref} | {family["guidance"]} |')
    lines += ['', '## Generation and feedback rules', '',
              '1. Generate batch 01 from scratch. The apple is a provisional style-only reference within this first batch.',
              '2. Review all ten cards together, including their appearance at 145px. Wait for user feedback.',
              '3. Record feedback; revise the shared style, affected prompts and artwork before continuing. Invalidate references affected by those revisions.',
              '4. Only approved seed artwork becomes a downstream object/character reference. Match geometry, colors and proportions; never add the reference object to an unrelated scene.',
              '5. Unseeded components are shared prompt conventions, with no visual reference claimed. Establish and review a support reference before depending on a precise recurring design.',
              '6. Pick up to 25 cards whose reference dependencies are ready (the first six reviewed batches retain ten each). The later order in batches.json is provisional; regroup after feedback if necessary.',
              '7. Record exact generation prompts and reference paths in each batch manifest. Repeat the feedback gate after each batch.',
              '8. Semantic exclusions and previous review restrictions remain. App integration and real-device checks are separate work before activation.', '',
              '## Per-card dependencies', '',
              'Complete machine-readable nodes and directed edges: `graph.json`. Each card inherits its assigned style profile. Foundation seeds establish their own components directly from style.', '',
              '| Card ID | Japanese | Meaning | Shared components |', '| --- | --- | --- | --- |']
    for card in cards:
        dependencies = ', '.join(card['components']) or 'style only'
        if card.get('styleNode'):
            dependencies += '; ' + card['styleNode']
        lines.append(f"| {card['id']} | {card['japanese']} | {card['meaning']} | {dependencies} |")
    (DATA / 'dependency-graph.md').write_text('\n'.join(lines) + '\n')


def render_batch(path, lookup):
    manifest = json.loads(path.read_text())
    batch_label = 'Batch ' + path.parent.name.split('-')[-1]
    first_number = manifest.get('numberStart', 1)
    panels, mini, details, feedback = [], [], [], []
    revised_panels = []
    revised_numbers = []
    for index, asset in enumerate(manifest['assets'], first_number):
        card = lookup[asset['id']]
        file = ROOT / asset['path']
        raw = file.read_bytes()
        assert raw[:8] == b'\x89PNG\r\n\x1a\n'
        asset.update(width=struct.unpack('>I', raw[16:20])[0], height=struct.unpack('>I', raw[20:24])[0],
                     bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
        src = html.escape(file.name)
        name = html.escape(card['meaning'])
        jp = html.escape(card['japanese'])
        number = f'{index:02}'
        status = ('Accepted · needs improvement' if asset.get('acceptedWithKnownIssue') else 'Approved') if asset['status'] == 'approved' else ('Revised · awaiting feedback' if asset.get('revisionRound') else 'Awaiting feedback')
        if asset.get('conventionUpdated') and asset['status'] != 'approved':
            status = 'Convention updated · awaiting feedback'
        caption = f'<b>{number} · {name}</b><span lang="ja">{jp}</span><small>{status}</small>'
        panel = f'<figure><a href="{src}"><img src="{src}" alt="{name}" width="{asset["width"]}" height="{asset["height"]}"></a><figcaption>{caption}</figcaption></figure>'
        panels.append(panel)
        if ((asset.get('revisionRound') or asset.get('conventionUpdated')) and asset['status'] != 'approved'
                and (manifest.get('currentRevisionRound') is None
                     or asset.get('revisionRound') == manifest['currentRevisionRound'])):
            revised_panels.append(panel)
            revised_numbers.append(number)
        mini.append(f'<figure><img src="{src}" alt="{name}" width="145" height="145"><figcaption>{number} · {name}</figcaption></figure>')
        previous = asset.get('previousVersions', [])
        previous_links = ' '.join(f'<a href="{html.escape(Path(old["path"]).name)}">Previous version {i+1}</a>' for i, old in enumerate(previous))
        details.append(f'<details><summary>{number} · {name} — prompt and review notes</summary><p>{html.escape(asset["visualReview"])}</p><p>{previous_links}</p><pre>{html.escape(asset["prompt"])}</pre></details>')
        feedback += [f'## {number} · {card["meaning"]} / {card["japanese"]}', '', f'ID: `{card["id"]}`', '', 'User feedback: pending.', '']
    gallery = '''<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kikimashta · Card review · Batch 01</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#faf8fc;color:#3f2468;font:16px system-ui,sans-serif}
main{max-width:1200px;margin:auto;padding:28px}h1{font-size:28px;margin:0 0 8px}p{line-height:1.5;max-width:850px}
.contact-sheet{padding:24px;background:#fff}.grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:20px}
figure{margin:0;min-width:0}img{display:block;width:100%;height:auto;background:#fff}figcaption{padding:8px 0;line-height:1.4;font-size:14px}figcaption b,figcaption span,figcaption small{display:block}figcaption small{color:#66517d;margin-top:4px}
.revision-sheet{padding:24px;background:#fff;margin-bottom:28px}.revisions{display:grid;grid-template-columns:repeat(var(--revision-columns,4),minmax(0,1fr));gap:20px}
.small{display:grid;grid-template-columns:repeat(5,145px);gap:24px;overflow:auto;padding:16px;background:#fff}.small img{width:145px;height:145px}
details{padding:12px 0;border-bottom:1px solid #ded5eb}summary{cursor:pointer}pre{white-space:pre-wrap;line-height:1.5;font-size:13px}a{color:inherit}
@media(max-width:700px){main{padding:12px}.contact-sheet,.revision-sheet{padding:14px}.grid,.revisions{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}h1{font-size:24px}.small{grid-template-columns:repeat(2,145px);gap:12px;padding:0}}
</style><main><section class="contact-sheet"><h1>Card review · Batch 01</h1>
<p>Ten reusable foundations · Awaiting your feedback. Reply with card numbers and any changes to shape, color, line weight, detail or spacing.</p><div class="grid">'''
    approved_count = sum(a['status'] == 'approved' for a in manifest['assets'])
    gallery = gallery.replace('Batch 01', batch_label)
    if manifest['status'] == 'approved':
        gallery = gallery.replace('Ten reusable foundations · Awaiting your feedback.', 'Batch accepted. Any remaining improvement notes are recorded below.')
    elif not revised_panels:
        gallery = gallery.replace('Ten reusable foundations · Awaiting your feedback.', f'Cards {first_number:02}–{first_number+len(manifest["assets"])-1:02} · Awaiting your feedback.')
    if revised_panels:
        gallery = gallery.replace('Ten reusable foundations · Awaiting your feedback.', f'{approved_count} approved · {len(revised_panels)} revised cards awaiting your feedback.')
    if manifest.get('comparisonGallery'):
        comparison = html.escape(manifest['comparisonGallery'])
        label = html.escape(manifest.get('comparisonLabel', 'Compare the previous style'))
        prefix = '' if manifest.get('comparisonLabel') else 'Cat PNG style trial · '
        gallery = gallery.replace('<div class="grid">', f'<p>{prefix}<a href="{comparison}">{label}</a></p><div class="grid">', 1)
    gallery += ''.join(panels) + '</div></section>'
    if revised_panels:
        numbers = ', '.join(revised_numbers)
        summary = html.escape(manifest.get('revisionSummary', 'Updated artwork awaiting your feedback.'))
        sheet_style = ' style="max-width:900px"' if len(revised_panels) <= 2 else ''
        columns = min(len(revised_panels), 4)
        gallery += f'<section class="revision-sheet"{sheet_style}><h2>Revised cards · {numbers}</h2><p>{summary}</p><div class="revisions" style="--revision-columns:{columns}">' + ''.join(revised_panels) + '</div></section>'
    gallery += '<h2>At quiz size · 145px</h2><div class="small">' + ''.join(mini) + '</div>'
    gallery += '<h2>Review notes</h2>' + ''.join('<p>' + html.escape(note) + '</p>' for note in manifest.get('reviewNotes', []))
    gallery += ''.join(details) + '</main></html>'
    # Display prompts without trailing whitespace; exact generation text stays in the manifest.
    (path.parent / 'review.html').write_text('\n'.join(line.rstrip() for line in gallery.split('\n')))
    path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    feedback_path = path.parent / 'feedback.md'
    if not feedback_path.exists():
        feedback_path.write_text(f'# {batch_label} feedback\n\nStatus: awaiting user feedback. Later batches remain blocked.\n\nGlobal feedback: pending.\n\n' + '\n'.join(feedback))


if __name__ == '__main__':
    cards = json.loads((DATA / 'prompts.json').read_text())['cards']
    graph = json.loads((DATA / 'graph.json').read_text())
    render_graph(cards, graph)
    for path in sorted((ROOT / 'artifacts/card-regeneration').glob('batch-*/manifest.json')):
        render_batch(path, {c['id']: c for c in cards})
    print('Built readable dependency graph and local batch galleries; recorded PNG dimensions and hashes.')
