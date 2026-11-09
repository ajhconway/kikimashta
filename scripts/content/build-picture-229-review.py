#!/usr/bin/env python3
"""Build the complete picture-artwork review for issue #229 (standard library only)."""

import argparse
from collections import Counter
import hashlib
import html
import json
import os
from pathlib import Path
import re
from urllib.parse import quote


EXPECTED_COUNT = 31
KINDS = {'generated', 'existing-approved', 'shared-new'}
STATUSES = {'pending-generation', 'generated-pending-owner-review', 'existing-approved-reuse'}


def escaped(value):
    return html.escape(str(value), quote=True)


def local_url(path, output):
    return quote(os.path.relpath(path, output.parent).replace(os.sep, '/'), safe='/')


def in_root(root, value, label):
    if not isinstance(value, str) or not value or '\\' in value:
        raise ValueError(f'{label}: expected a repository-relative path.')
    relative = Path(value)
    if relative.is_absolute() or '..' in relative.parts:
        raise ValueError(f'{label}: path must stay inside the repository.')
    path = (root / relative).resolve()
    if not path.is_relative_to(root):
        raise ValueError(f'{label}: resolved path leaves the repository.')
    return path


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def unique_ids(records, label):
    if not isinstance(records, list) or any(not isinstance(record, dict) for record in records):
        raise ValueError(f'{label}: expected a list of records.')
    ids = [record.get('id') for record in records]
    if any(not isinstance(item_id, str) or not item_id for item_id in ids) or len(set(ids)) != len(ids):
        raise ValueError(f'{label}: missing or duplicate IDs.')
    return set(ids)


def load_plan(root, path):
    plan = json.loads(path.read_text(encoding='utf-8'))
    if plan.get('issue') != 229 or plan.get('category') != 'picture' or plan.get('expectedAssetCount') != EXPECTED_COUNT:
        raise ValueError('Expected the issue 229 plan for exactly 31 picture cards.')
    if not isinstance(plan.get('sourceRevision'), str) or not re.fullmatch('[a-f0-9]{40}', plan['sourceRevision']):
        raise ValueError('Plan sourceRevision must be a full 40-character hexadecimal commit.')
    items = plan.get('items')
    selected = unique_ids(items, 'Plan')
    if len(items) != EXPECTED_COUNT or any(item.get('category') != 'picture' for item in items):
        raise ValueError('Every one of the 31 selected cards must have category picture.')
    excluded = plan.get('excludedUpdatedIds')
    if (not isinstance(excluded, list) or any(not isinstance(item_id, str) for item_id in excluded)
            or len(set(excluded)) != len(excluded) or selected.intersection(excluded)):
        raise ValueError('Invalid or overlapping already-updated exclusions.')
    source_path = path.parent / 'sources/suitability-review.json'
    if not source_path.resolve().is_relative_to(root) or digest(source_path) != plan.get('suitabilityReviewSha256'):
        raise ValueError('Frozen suitability review hash mismatch.')
    source = json.loads(source_path.read_text(encoding='utf-8'))
    reviewed = source.get('items')
    unique_ids(reviewed, 'Suitability review')
    picture_items = {item['id']: item for item in reviewed if item.get('category') == 'picture'}
    if plan.get('pictureCardCount') != len(picture_items) or set(excluded) - picture_items.keys():
        raise ValueError('Picture count or exclusions do not match the frozen suitability review.')
    if selected != picture_items.keys() - set(excluded):
        raise ValueError('Plan does not contain exactly the unupdated picture selection.')
    for item in items:
        if item != picture_items[item['id']]:
            raise ValueError(f'{item["id"]}: selected review record differs from the frozen source.')
    return plan


def metadata_links(root, review_folder, revision, output, value):
    """Keep local links portable; pin sources outside the review folder to GitHub."""
    links = {}

    def visit(item):
        if isinstance(item, dict):
            for child in item.values():
                visit(child)
        elif isinstance(item, list):
            for child in item:
                visit(child)
        elif isinstance(item, str):
            if item.startswith('https://github.com/ajhconway/kikimashta/'):
                links[item] = item
            elif item.startswith(('artifacts/', 'content/', 'public/', 'scripts/')):
                candidate = in_root(root, item, 'Provenance')
                if candidate.is_file():
                    if candidate.is_relative_to(review_folder):
                        links[item] = local_url(candidate, output)
                    else:
                        repo_path = quote(candidate.relative_to(root).as_posix(), safe='/')
                        links[item] = f'https://github.com/ajhconway/kikimashta/blob/{revision}/{repo_path}'

    visit(value)
    return ''.join(f'<li><a href="{escaped(url)}" target="_blank" rel="noopener">{escaped(label)}</a></li>'
                   for label, url in links.items())


def build(root, plan_path=None, manifest_path=None, output=None):
    root = root.resolve()
    folder = root / 'artifacts/picture-art-229'
    plan_path = (plan_path or folder / 'plan.json').resolve()
    manifest_path = (manifest_path or folder / 'manifest.json').resolve()
    output = (output or folder / 'index.html').resolve()
    for path in [plan_path, manifest_path, output]:
        if not path.is_relative_to(root):
            raise ValueError('Plan, manifest and output must stay inside the repository.')
    plan = load_plan(root, plan_path)
    review_folder = plan_path.parent
    by_id = {item['id']: item for item in plan['items']}
    has_manifest = manifest_path.is_file()
    if has_manifest:
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        if manifest.get('issue') != 229 or manifest.get('expectedAssetCount') != EXPECTED_COUNT:
            raise ValueError('Expected an issue 229 manifest for exactly 31 assets.')
        assets = manifest.get('assets')
        if unique_ids(assets, 'Manifest') != set(by_id) or len(assets) != EXPECTED_COUNT:
            raise ValueError('Manifest must contain exactly the 31 selected picture IDs.')
    else:
        assets = [{'id': item['id'], 'text': item['japanese'], 'reading': item['reading'],
                   'meaning': item['catalogMeaning'], 'level': item['level'],
                   'sourceKind': 'generated', 'status': 'pending-generation'} for item in plan['items']]
    asset_by_id = {asset['id']: asset for asset in assets}
    ready_paths = {}
    counts = Counter()
    for asset in assets:
        item_id = asset['id']
        original = by_id[item_id]
        for key, source_key in [('text', 'japanese'), ('reading', 'reading'), ('meaning', 'catalogMeaning'), ('level', 'level')]:
            if asset.get(key) != original.get(source_key):
                raise ValueError(f'{item_id}: {key} does not match the frozen selection.')
        kind, status = asset.get('sourceKind'), asset.get('status')
        if kind not in KINDS or status not in STATUSES:
            raise ValueError(f'{item_id}: unknown source kind or review status.')
        if (kind == 'existing-approved') != (status == 'existing-approved-reuse') and status != 'pending-generation':
            raise ValueError(f'{item_id}: inconsistent reuse source kind and status.')
        path = in_root(root, asset['path'], item_id) if asset.get('path') is not None else None
        if path is not None and not path.is_relative_to(review_folder):
            raise ValueError(f'{item_id}: selected image must stay inside the portable review folder.')
        ready = path is not None and path.is_file()
        if status != 'pending-generation' and not ready:
            raise ValueError(f'{item_id}: ready artwork file is missing.')
        if ready:
            if path.suffix.lower() not in {'.png', '.jpg', '.jpeg', '.webp'}:
                raise ValueError(f'{item_id}: unsupported review image format.')
            sha = asset.get('sha256')
            if not isinstance(sha, str) or not re.fullmatch('[a-f0-9]{64}', sha) or digest(path) != sha:
                raise ValueError(f'{item_id}: selected image hash mismatch.')
            if status == 'pending-generation':
                raise ValueError(f'{item_id}: existing selected artwork is still marked pending generation.')
            if kind == 'generated' and not str(asset.get('prompt', '')).strip():
                raise ValueError(f'{item_id}: generated artwork needs its exact prompt.')
            ready_paths[item_id] = path
            counts['ready'] += 1
            counts[kind] += 1
        else:
            counts['pending'] += 1
        if kind == 'shared-new':
            source_id = asset.get('sharedFromId')
            source = asset_by_id.get(source_id)
            if not source or source_id == item_id or source.get('sourceKind') != 'generated':
                raise ValueError(f'{item_id}: shared artwork must identify its generated source card.')
            if ready and (source.get('sha256') != asset.get('sha256') or source.get('status') == 'pending-generation'):
                raise ValueError(f'{item_id}: shared artwork does not match the source selection.')

    cards = []
    for number, original in enumerate(plan['items'], 1):
        item_id = original['id']
        asset = asset_by_id[item_id]
        ready = item_id in ready_paths
        kind = asset['sourceKind']
        label = {'generated': 'New illustration', 'existing-approved': 'Existing approved image · proposed reuse',
                 'shared-new': 'Shared new illustration'}[kind]
        if ready:
            image_url = escaped(local_url(ready_paths[item_id], output))
            media = (f'<a class="preview" href="{image_url}" target="_blank" rel="noopener" '
                     f'aria-label="Open full-size {escaped(asset["meaning"])} artwork">'
                     f'<img src="{image_url}" alt="Proposed artwork for {escaped(asset["meaning"])}" loading="lazy"></a>')
            full_link = f'<a href="{image_url}" target="_blank" rel="noopener">Open full size ↗</a>'
            status = 'Ready for this batch’s owner review'
        else:
            media = '<div class="preview placeholder">Artwork pending generation</div>'
            full_link = ''
            status = 'Pending generation'
        shared = ''
        if kind == 'shared-new':
            source_id = asset['sharedFromId']
            shared = (f'<p class="reuse-note">Shares the same new illustration as '
                      f'<a href="#{escaped(source_id)}" lang="ja">{escaped(by_id[source_id]["japanese"])}</a>.</p>')
        revision_note = asset.get('ownerRevisionNote')
        revision = (f'<p class="reuse-note"><b>Revised concept:</b> {escaped(revision_note)}</p>'
                    if revision_note else '')
        review_notes = ''.join(f'<p><b>{title}:</b> {escaped(original[key])}</p>'
                               for title, key in [('Original picture recommendation' if revision_note else 'Picture choice', 'recommendation'), ('Suitability', 'rationale'),
                                                  ('Existing review note', 'currentVisualReviewNote'), ('Teaching note', 'existingTeachingNote')]
                               if original.get(key))
        if original.get('englishNote'):
            review_notes += f'<p><b>Answer note:</b> {escaped(original["englishNote"])}</p>'
        source_data = {key: asset[key] for key in ['sourceProvenance', 'references', 'versions', 'sharedFromId', 'ownerRevisionNote', 'image', 'sha256', 'status'] if key in asset}
        sources = metadata_links(root, review_folder, plan['sourceRevision'], output, source_data)
        prompt = asset.get('prompt')
        prompt_html = (f'<h3>Exact generation prompt</h3><pre>{escaped(prompt)}</pre>' if prompt else
                       '<p>No new generation prompt for this selected reuse.</p>' if ready else
                       '<p>Generation prompt not recorded yet.</p>')
        metadata = (f'<details><summary>Prompt and source details</summary>{prompt_html}'
                    f'<p class="technical">Stable ID: <code>{escaped(item_id)}</code></p>'
                    + (f'<ul class="source-links">{sources}</ul>' if sources else '')
                    + f'<pre class="technical">{escaped(json.dumps(source_data, ensure_ascii=False, indent=2))}</pre></details>')
        search = escaped(' '.join(str(asset[key]) for key in ['text', 'reading', 'meaning', 'level']))
        cards.append(f'<article class="card" id="{escaped(item_id)}" data-search="{search}" data-kind="{escaped(kind)}">'
                     f'<div class="number">{number:02d} / {EXPECTED_COUNT} · WaniKani level {escaped(asset["level"])}</div>{media}'
                     f'<div class="body"><h2 lang="ja">{escaped(asset["text"])}</h2><p class="reading" lang="ja">{escaped(asset["reading"])}</p>'
                     f'<p class="meaning">{escaped(asset["meaning"])}</p><p class="source-kind">{label}</p>'
                     f'<p class="status">{status}</p>{full_link}{shared}{revision}<details class="review-notes"><summary>Suitability and answer-choice notes</summary>'
                     f'{review_notes}</details>{metadata}</div></article>')

    files = f'<a href="{escaped(local_url(plan_path, output))}" download>Frozen selection plan</a>'
    files += f' · <a href="{escaped(local_url(plan_path.parent / "sources/suitability-review.json", output))}">Original suitability review</a>'
    if has_manifest:
        files += f' · <a href="{escaped(local_url(manifest_path, output))}" download>Artwork manifest</a>'
    page = '''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Picture artwork · Review #229</title><style>
:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;line-height:1.5;color:#352246;background:#faf8fe;color-scheme:light}*{box-sizing:border-box}body{max-width:1600px;margin:auto;padding:28px}header{max-width:1050px;margin-bottom:28px}h1{font-size:clamp(1.8rem,4vw,2.6rem);line-height:1.15;letter-spacing:-.03em;margin:8px 0 16px}p{margin:8px 0}a{color:#65339a;text-underline-offset:3px}a:focus-visible,summary:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #ae6b00;outline-offset:4px}.eyebrow{color:#796385;font-size:.85rem}.notice{border-left:4px solid #dfad38;background:#fff5d8;border-radius:6px;padding:12px 16px;margin:20px 0}.tallies{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.tally{background:#eee5fa;border-radius:20px;padding:7px 14px;font-weight:650;font-size:.9rem}.filters{display:flex;gap:16px;flex-wrap:wrap;margin:20px 0}.filters label{display:flex;flex-direction:column;font-size:.9rem;gap:6px}.filters input,.filters select{font:inherit;color:inherit;border:1px solid #c8b4dc;border-radius:8px;background:white;padding:9px 12px;max-width:100%}.filters input{width:300px}.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:22px}.card{background:white;border:1px solid #dfd3ed;border-radius:18px;overflow:hidden;box-shadow:0 3px 12px #44205a08;scroll-margin-top:20px}.card[hidden]{display:none}.number{padding:10px 16px;font-size:.8rem;font-weight:700;color:#74617c}.preview{display:flex;width:100%;aspect-ratio:1;align-items:center;justify-content:center;background-color:white;background-image:linear-gradient(45deg,#f0eafa 25%,transparent 25%),linear-gradient(-45deg,#f0eafa 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#f0eafa 75%),linear-gradient(-45deg,transparent 75%,#f0eafa 75%);background-size:28px 28px;background-position:0 0,0 14px,14px -14px,-14px 0}.preview img{display:block;width:100%;height:100%;object-fit:contain;padding:14px}.placeholder{font-size:.9rem;color:#75617e;padding:24px;text-align:center}.body{padding:18px}h2{font-size:1.65rem;line-height:1.2;margin:0}.reading{font-size:.92rem;color:#7b6286}.meaning{font-size:1.05rem;font-weight:650}.source-kind{font-size:.85rem;font-weight:650;color:#65477a}.status{display:table;font-size:.78rem;background:#fff1c7;color:#6e4a12;border-radius:8px;padding:5px 9px;margin:12px 0}.reuse-note{font-size:.85rem}details{margin-top:18px;border-top:1px solid #eee6f4;padding-top:12px}summary{cursor:pointer;color:#65477a;font-size:.83rem}details h3{font-size:.88rem}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:.83rem;background:#f6f2fb;padding:12px;border-radius:8px}.review-notes p{font-size:.85rem;margin:12px 0}.technical,.source-links{font-size:.72rem;color:#786480;overflow-wrap:anywhere}.source-links{padding-left:18px}footer{font-size:.85rem;color:#7b6286;margin:28px 0}@media(max-width:600px){body{padding:16px}.gallery{gap:16px}.filters{gap:12px}.filters label{width:100%}.filters input{width:100%}}@media print{.filters,#shown-count{display:none}body{background:white}.gallery{grid-template-columns:repeat(3,1fr)}details{display:none}.card{break-inside:avoid;box-shadow:none}.preview img{padding:8px}}
</style></head><body><header><p class="eyebrow">Kikimashta · Artwork review · Issue #229</p>
<h1>Picture artwork</h1><p>All 31 cards categorized exactly <b>picture</b> in the WaniKani source-level 2–5 suitability review that lacked published updated artwork at the frozen source revision. The 61 already updated picture IDs are excluded.</p>
<div class="notice"><b>Complete batch for owner review.</b> New illustrations, shared images and existing approved reuses are identified separately. Earlier source approval does not approve this batch’s selection or activate artwork, vocabulary or practice cards.</div>
<div class="tallies"><span class="tally">31 selected cards</span><span class="tally">__READY__ ready for review</span><span class="tally">__NEW__ new images</span><span class="tally">__SHARED__ shared new images</span><span class="tally">__REUSED__ existing approved reuses</span><span class="tally">__PENDING__ pending generation</span></div>
<p>Open any picture at full size. Expand its details for exact prompts, source provenance and suitability notes, including overlapping meanings to keep out of competing answer choices.</p><p>__FILES__ · <a href="https://github.com/ajhconway/kikimashta/issues/229">GitHub issue #229</a></p>
<div class="filters"><label>Find a card<input id="search" type="search" placeholder="Japanese, reading, English or level"></label><label>Artwork source<select id="kind"><option value="all">All sources</option><option value="generated">New illustrations</option><option value="shared-new">Shared new illustrations</option><option value="existing-approved">Existing approved reuses</option></select></label></div><p id="shown-count" role="status">Showing 31 of 31 cards</p></header>
<main class="gallery">__CARDS__</main><footer>Source revision: <code>__REVISION__</code>. All 31 selections await owner acceptance for this batch. Review preparation does not change active artwork, audio, vocabulary eligibility or progress.</footer>
<script>const cards=[...document.querySelectorAll('.card')],search=document.querySelector('#search'),kind=document.querySelector('#kind');function filter(){const term=search.value.trim().toLocaleLowerCase();let shown=0;for(const card of cards){card.hidden=!card.dataset.search.toLocaleLowerCase().includes(term)||(kind.value!=='all'&&card.dataset.kind!==kind.value);if(!card.hidden)shown++}document.querySelector('#shown-count').textContent=`Showing ${shown} of ${cards.length} cards`}search.addEventListener('input',filter);kind.addEventListener('change',filter);</script></body></html>'''
    for marker, value in {'__READY__': counts['ready'], '__NEW__': counts['generated'], '__SHARED__': counts['shared-new'],
                          '__REUSED__': counts['existing-approved'], '__PENDING__': counts['pending'], '__FILES__': files,
                          '__CARDS__': ''.join(cards), '__REVISION__': escaped(plan.get('sourceRevision', 'Not recorded'))}.items():
        page = page.replace(marker, str(value))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(page, encoding='utf-8')
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--plan', type=Path)
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    counts = build(args.root, args.plan, args.manifest, args.output)
    print(f'Picture review #229: {counts["ready"]} ready ({counts["generated"]} new, '
          f'{counts["shared-new"]} shared, {counts["existing-approved"]} existing approved reuses); {counts["pending"]} pending generation.')


if __name__ == '__main__':
    main()
