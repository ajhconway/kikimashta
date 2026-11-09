#!/usr/bin/env python3
"""Build the artwork review for issue #213 using only the standard library."""

import argparse
from collections import Counter
import html
import hashlib
import json
import os
from pathlib import Path
from urllib.parse import quote


def escaped(value):
    return html.escape(str(value), quote=True)


def local_url(path, output):
    return quote(os.path.relpath(path, output.parent).replace(os.sep, '/'), safe='/')


def image_path_in_root(root, path, item_id):
    if path is None:
        return None
    if not isinstance(path, str) or not path:
        raise ValueError(f'{item_id}: path must be null or a repository-relative string.')
    candidate = Path(path)
    if candidate.is_absolute() or '..' in candidate.parts:
        raise ValueError(f'{item_id}: image path must stay inside the repository.')
    image_path = (root / candidate).resolve()
    if not image_path.is_relative_to(root):
        raise ValueError(f'{item_id}: resolved image path leaves the repository.')
    return image_path


def approved_artwork(asset, image_path):
    approval = asset.get('approval')
    if approval is None and asset.get('status') != 'approved':
        return False
    if not isinstance(approval, dict) or image_path is None or not image_path.is_file():
        raise ValueError(f'{asset["id"]}: approval requires an existing selected image and approval record.')
    digest = hashlib.sha256(image_path.read_bytes()).hexdigest()
    version = asset.get('selectedVersion')
    if (approval.get('sha256') != digest or asset.get('sha256') != digest or
            type(version) is not int or version < 1 or
            type(approval.get('selectedVersion')) is not int or approval['selectedVersion'] != version):
        raise ValueError(f'{asset["id"]}: stale approval digest or selected version.')
    if approval.get('scope') != 'artwork only' or any(
            not isinstance(approval.get(key), str) or not approval[key].strip()
            for key in ['ownerStatement', 'date']):
        raise ValueError(f'{asset["id"]}: approval must record artwork-only scope, owner statement and date.')
    if 'versions' in asset:
        matching = [item for item in asset['versions'] if item.get('version') == version and
                    item.get('path') == asset.get('path') and item.get('sha256') == digest]
        if len(matching) != 1:
            raise ValueError(f'{asset["id"]}: selected version record does not match approved artwork.')
    return asset.get('status') == 'approved'


def build(root, manifest_path, output, expected_count=None):
    root = root.resolve()
    manifest_path = manifest_path.resolve()
    output = output.resolve()
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if manifest.get('issue') != 213:
        raise ValueError('Expected issue 213 manifest.')
    if expected_count is None:
        expected_count = manifest.get('expectedAssetCount', 20)
    if type(expected_count) is not int or expected_count < 1:
        raise ValueError('Expected asset count must be a positive integer.')
    assets = manifest.get('assets')
    if not isinstance(assets, list) or len(assets) != expected_count:
        raise ValueError(f'Expected exactly {expected_count} assets.')
    ids = [asset.get('id') for asset in assets]
    if any(not isinstance(item, str) or not item for item in ids) or len(set(ids)) != len(ids):
        raise ValueError('Asset IDs must be nonempty and unique.')
    excluded = manifest.get('excludedUpdatedIds', [])
    if not isinstance(excluded, list) or any(not isinstance(item, str) for item in excluded):
        raise ValueError('excludedUpdatedIds must be a list of IDs.')
    if set(ids).intersection(excluded):
        raise ValueError('Batch includes an already updated excluded ID.')
    cards = []
    counts = Counter()
    for number, asset in enumerate(assets, 1):
        for key in ['text', 'reading', 'meaning', 'prompt']:
            if not isinstance(asset.get(key), str) or not asset[key].strip():
                raise ValueError(f'{asset["id"]}: missing {key}.')
        image_path = image_path_in_root(root, asset.get('path'), asset['id'])
        ready = image_path is not None and image_path.is_file()
        approved = approved_artwork(asset, image_path)
        counts['approved' if approved else 'unapproved'] += 1
        counts['reviewPending'] += bool(ready and not approved)
        counts['generated' if ready else 'pending'] += 1
        if ready:
            image_url = escaped(local_url(image_path, output))
            media = (f'<a class="preview" href="{image_url}" target="_blank" rel="noopener" '
                     f'aria-label="Open full-size {escaped(asset["meaning"])} artwork">'
                     f'<img src="{image_url}" alt="{ "Approved" if approved else "Proposed" } artwork for {escaped(asset["meaning"])}" '
                     'loading="lazy"></a>')
            status = 'Approved artwork' if approved else 'Generated · pending owner review'
            full_link = f'<a href="{image_url}" target="_blank" rel="noopener">Open full size ↗</a>'
        else:
            media = '<div class="preview placeholder">Artwork pending generation</div>'
            status = 'Pending generation'
            full_link = ''
        comparisons = asset.get('comparisons', [])
        if not isinstance(comparisons, list):
            raise ValueError(f'{asset["id"]}: comparisons must be a list.')
        comparison_html = []
        for comparison in comparisons:
            if not isinstance(comparison, dict) or not isinstance(comparison.get('label'), str) or not comparison['label'].strip():
                raise ValueError(f'{asset["id"]}: comparison needs a nonempty label.')
            if 'path' not in comparison:
                raise ValueError(f'{asset["id"]}: comparison needs a path or null.')
            label = escaped(comparison['label'])
            alternate = image_path_in_root(root, comparison['path'], asset['id'])
            if alternate is not None and alternate.is_file():
                alternate_url = escaped(local_url(alternate, output))
                preview = (f'<a class="preview" href="{alternate_url}" target="_blank" rel="noopener" '
                           f'aria-label="Open full-size alternative: {label}">'
                           f'<img src="{alternate_url}" alt="Alternative artwork: {label}" loading="lazy"></a>'
                           f'<a href="{alternate_url}" target="_blank" rel="noopener">Open alternative full size ↗</a>')
            else:
                preview = '<div class="preview placeholder">Alternative artwork pending generation</div>'
            comparison_html.append(f'<figure class="comparison"><figcaption>{label}</figcaption>{preview}</figure>')
        alternatives = ('<section class="comparisons"><h3>Alternative artwork · not selected</h3>'
                        '<p class="technical">The current image remains selected. Alternatives require explicit owner selection.</p>'
                        + ''.join(comparison_html) + '</section>') if comparison_html else ''
        metadata = f'<p class="technical">Stable ID: <code>{escaped(asset["id"])}</code></p>'
        if asset.get('sha256'):
            metadata += f'<p class="technical">SHA-256: <code>{escaped(asset["sha256"])}</code></p>'
        if asset.get('status'):
            metadata += f'<p class="technical">Manifest status: {escaped(asset["status"])}</p>'
        if approved:
            approval = asset['approval']
            metadata += (f'<p class="technical">Artwork approval: {escaped(approval["date"])} · '
                         f'version {escaped(approval["selectedVersion"])} · '
                         f'{escaped(approval["ownerStatement"])}</p>')
        cards.append(
            f'<article class="card" id="{escaped(asset["id"])}">'
            f'<div class="number">{number:02d} / {expected_count}</div>{media}'
            f'<div class="body"><h2 lang="ja">{escaped(asset["text"])}</h2>'
            f'<p class="reading" lang="ja">{escaped(asset["reading"])}</p>'
            f'<p class="meaning">{escaped(asset["meaning"])}</p>'
            f'<p class="status{ " approved" if approved else "" }">{status}</p>{full_link}{alternatives}'
            f'<details><summary>Exact generation prompt and source details</summary>'
            f'<pre>{escaped(asset["prompt"])}</pre>{metadata}</details></div></article>'
        )
    manifest_url = escaped(local_url(manifest_path, output))
    revision = escaped(manifest.get('sourceRevision', 'Not recorded'))
    page = '''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Visual-reference artwork · Review #213</title>
<style>
:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;line-height:1.5;color:#352246;background:#faf8fe;color-scheme:light}
*{box-sizing:border-box}body{max-width:1600px;margin:auto;padding:28px}header{max-width:1000px;margin-bottom:28px}h1{font-size:clamp(1.8rem,4vw,2.6rem);line-height:1.15;letter-spacing:-.03em;margin:8px 0 16px}p{margin:8px 0}a{color:#65339a;text-underline-offset:3px}a:focus-visible,summary:focus-visible{outline:3px solid #ae6b00;outline-offset:4px}.eyebrow{color:#796385;font-size:.85rem}.notice{border-left:4px solid #dfad38;background:#fff5d8;border-radius:6px;padding:12px 16px;margin:20px 0}.tallies{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.tally{background:#eee5fa;border-radius:20px;padding:7px 14px;font-weight:650;font-size:.9rem}.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:22px}.card{background:white;border:1px solid #dfd3ed;border-radius:18px;overflow:hidden;box-shadow:0 3px 12px #44205a08}.number{padding:10px 16px;font-size:.8rem;font-weight:700;color:#74617c}.preview{display:flex;width:100%;aspect-ratio:1;align-items:center;justify-content:center;background-color:white;background-image:linear-gradient(45deg,#f0eafa 25%,transparent 25%),linear-gradient(-45deg,#f0eafa 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#f0eafa 75%),linear-gradient(-45deg,transparent 75%,#f0eafa 75%);background-size:28px 28px;background-position:0 0,0 14px,14px -14px,-14px 0}.preview img{display:block;width:100%;height:100%;object-fit:contain;padding:14px}.placeholder{font-size:.9rem;color:#75617e;padding:24px;text-align:center}.body{padding:18px}h2{font-size:1.65rem;line-height:1.2;margin:0}.reading{font-size:.92rem;color:#7b6286}.meaning{font-size:1.05rem;font-weight:650}.status{display:table;font-size:.78rem;background:#fff1c7;color:#6e4a12;border-radius:8px;padding:5px 9px;margin:12px 0}details{margin-top:18px;border-top:1px solid #eee6f4;padding-top:12px}summary{cursor:pointer;color:#65477a;font-size:.83rem}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:.83rem;background:#f6f2fb;padding:12px;border-radius:8px}.technical{font-size:.72rem;color:#786480;overflow-wrap:anywhere}footer{font-size:.85rem;color:#7b6286;margin:28px 0}@media(max-width:600px){body{padding:16px}.gallery{gap:16px;grid-template-columns:repeat(auto-fill,minmax(250px,1fr))}}@media print{body{background:white}.gallery{grid-template-columns:repeat(3,1fr)}details{display:none}.card{break-inside:avoid;box-shadow:none}.preview img{padding:8px}}
.comparisons{border-top:1px solid #eee6f4;margin-top:18px;padding-top:10px}.comparisons h3{font-size:.9rem;margin:4px 0}.comparison{margin:14px 0 0}.comparison figcaption{font-weight:650;font-size:.85rem;margin:8px 0}.comparison .preview{border:1px solid #e4d9ef;border-radius:10px;overflow:hidden}.comparison>a:last-child{font-size:.8rem}
.status.approved{background:#e1f2e7;color:#245e3b}
</style></head><body><header><p class="eyebrow">Kikimashta · Artwork review · Issue #213</p>
<h1>Visual-reference artwork</h1>
<p>The original 20 visual-reference cards at WaniKani source levels 2–5, with owner-requested entrance additions and exit revisions. Any alternative artwork is shown alongside the current selection for comparison.</p>
<div class="notice"><b>Artwork approval: __APPROVED__ of __TOTAL__.</b> __REVIEW_PENDING__ generated assets await owner review; __PENDING__ await generation. Approved labels apply only to the exact selected artwork. Generation, browsing and artwork approval do not activate vocabulary or practice cards.</div>
<div class="tallies"><span class="tally">__TOTAL__ expected assets</span><span class="tally">__READY__ generated</span><span class="tally">__APPROVED__ approved artwork</span><span class="tally">__REVIEW_PENDING__ pending owner review</span><span class="tally">__PENDING__ pending generation</span><span class="tally">__EXCLUDED__ already updated IDs excluded</span></div>
<p>Open any image to inspect the original at full size. Expand its details to read the exact generation prompt.</p>
<p><a href="__MANIFEST__" download>Download manifest</a> · <a href="https://github.com/ajhconway/kikimashta/issues/213">GitHub issue #213</a></p></header>
<main class="gallery">__CARDS__</main><footer>Source revision: <code>__REVISION__</code>. __APPROVED__ selected artworks have matching owner approvals; __UNAPPROVED__ remain unapproved. Alternatives are not selected or approved. Approval covers artwork only and does not imply runtime activation.</footer></body></html>'''
    for marker, value in {
        '__TOTAL__': expected_count, '__READY__': counts['generated'], '__PENDING__': counts['pending'],
        '__APPROVED__': counts['approved'], '__UNAPPROVED__': counts['unapproved'],
        '__REVIEW_PENDING__': counts['reviewPending'],
        '__EXCLUDED__': len(set(excluded)), '__MANIFEST__': manifest_url,
        '__REVISION__': revision, '__CARDS__': ''.join(cards),
    }.items():
        page = page.replace(marker, str(value))
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(page, encoding='utf-8')
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    parser.add_argument('--manifest', type=Path, help='Defaults to the artwork manifest under --root.')
    parser.add_argument('--output', type=Path, help='Defaults to index.html beside the manifest.')
    parser.add_argument('--expected-count', type=int, help='Override manifest.expectedAssetCount (legacy default: 20).')
    args = parser.parse_args()
    manifest = args.manifest or args.root / 'artifacts/visual-reference-art-213/manifest.json'
    output = args.output or manifest.parent / 'index.html'
    counts = build(args.root, manifest, output, args.expected_count)
    print(f'Wrote {output}: {counts["generated"]} generated, {counts["approved"]} artwork approved, '
          f'{counts["reviewPending"]} pending owner review, {counts["pending"]} pending generation.')


if __name__ == '__main__':
    main()
