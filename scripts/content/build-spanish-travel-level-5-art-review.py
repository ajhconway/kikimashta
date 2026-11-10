#!/usr/bin/env python3
"""Verify and render the non-production Travel 5 artwork review (#243)."""
import argparse
import hashlib
import html
import json
import os
from pathlib import Path
import re
import struct
import zlib

ROOT = Path(__file__).resolve().parents[2]
DATA = Path('content/spanish-travel-5')
ART = Path('artifacts/spanish-travel-5-art')


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def safe_path(relative, exists=True):
    path = Path(relative)
    if path.is_absolute() or '..' in path.parts or not path.parts:
        raise ValueError(f'Unsafe repository path: {relative}')
    current = ROOT
    for part in path.parts:
        current /= part
        if current.is_symlink():
            raise ValueError(f'Symlink in review path: {relative}')
    if exists and not current.is_file():
        raise ValueError(f'Missing review input: {relative}')
    return current


def load(relative):
    return json.loads(safe_path(relative).read_text())


def verified(relative, expected):
    raw = safe_path(relative).read_bytes()
    if not re.fullmatch(r'[a-f0-9]{64}', expected) or sha(raw) != expected:
        raise ValueError(f'Hash mismatch: {relative}')
    return raw


def png_info(raw, require_alpha=False):
    """Inspect PNG bytes without changing the image or requiring image packages."""
    if raw[:8] != b'\x89PNG\r\n\x1a\n':
        if require_alpha:
            raise ValueError('Generated artwork must be PNG')
        return {'format': 'original-non-PNG'}
    pos, packed, header = 8, bytearray(), None
    ended = False
    while pos < len(raw):
        if pos + 12 > len(raw):
            raise ValueError('Truncated PNG chunk')
        size = struct.unpack('>I', raw[pos:pos + 4])[0]
        kind = raw[pos + 4:pos + 8]
        data = raw[pos + 8:pos + 8 + size]
        if pos + size + 12 > len(raw):
            raise ValueError('Truncated PNG data')
        crc = struct.unpack('>I', raw[pos + size + 8:pos + size + 12])[0]
        if zlib.crc32(kind + data) & 0xffffffff != crc:
            raise ValueError('PNG CRC mismatch')
        if kind == b'IHDR':
            header = struct.unpack('>IIBBBBB', data)
        elif kind == b'IDAT':
            packed.extend(data)
        elif kind == b'IEND':
            ended = True
            break
        pos += size + 12
    if not header or not ended:
        raise ValueError('Incomplete PNG')
    width, height, depth, color, compression, filtering, interlace = header
    if not (0 < width <= 8192 and 0 < height <= 8192):
        raise ValueError('Invalid PNG dimensions')
    info = {'format': 'PNG', 'width': width, 'height': height, 'colorType': color}
    if not require_alpha:
        return info
    if depth != 8 or color not in (4, 6) or (compression, filtering, interlace) != (0, 0, 0):
        raise ValueError('Generated artwork must be non-interlaced, 8-bit PNG with alpha')
    channels = 4 if color == 6 else 2
    stride = width * channels
    unpacked = zlib.decompress(packed)
    if len(unpacked) != height * (stride + 1):
        raise ValueError('PNG scanline size mismatch')
    prior = bytearray(stride)
    transparent = opaque = 0
    for row_index in range(height):
        start = row_index * (stride + 1)
        mode = unpacked[start]
        row = bytearray(unpacked[start + 1:start + stride + 1])
        if mode not in range(5):
            raise ValueError('Unsupported PNG filter')
        if mode:
            for offset, value in enumerate(row):
                left = row[offset - channels] if offset >= channels else 0
                above = prior[offset]
                upper_left = prior[offset - channels] if offset >= channels else 0
                if mode == 1:
                    predictor = left
                elif mode == 2:
                    predictor = above
                elif mode == 3:
                    predictor = (left + above) // 2
                else:
                    estimate = left + above - upper_left
                    distances = (abs(estimate - left), abs(estimate - above), abs(estimate - upper_left))
                    predictor = (left, above, upper_left)[distances.index(min(distances))]
                row[offset] = (value + predictor) & 255
        alpha = row[channels - 1::channels]
        transparent += alpha.count(0)
        opaque += alpha.count(255)
        prior = row
    if not transparent or not opaque:
        raise ValueError('Artwork must contain genuinely transparent and opaque pixels')
    info.update(transparentPixels=transparent, opaquePixels=opaque)
    return info


def unique(rows, key):
    result = {}
    for row in rows:
        value = row[key]
        if value in result:
            raise ValueError(f'Duplicate {key}: {value}')
        result[value] = row
    return result


def write_json(path, value):
    safe_path(path, exists=False).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


def render(draft, selected):
    esc = html.escape
    groups = {group['id']: group['title'] for group in draft['groups']}
    options = ''.join(f'<option value="{esc(key)}">{esc(value)}</option>' for key, value in groups.items())
    cards = []
    for item, selection in zip(draft['items'], selected):
        relative = os.path.relpath(selection['path'], ART) if selection.get('path') else None
        picture = (f'<a class="picture" href="{esc(relative)}" target="_blank" rel="noopener" aria-label="Open full {esc(item["meaning"])} picture"><img src="{esc(relative)}" alt="{esc(item["meaning"])}" width="145" height="145"></a>'
                   if relative else '<div class="picture pending">Pending</div>')
        label = {'generated': f'New artwork · v{selection.get("version", 1)}', 'reuse': 'Existing artwork', 'pending': 'Pending'}[selection['source']]
        search = ' '.join((item['text'], item['meaning'], groups[item['group']]))
        cards.append(f'<article data-group="{esc(item["group"])}" data-search="{esc(search)}">{picture}<h2 lang="es-419">{esc(item["text"])}</h2><p>{esc(item["meaning"])}</p><small>{esc(groups[item["group"]])} · {label}</small></article>')
    counts = {source: sum(row['source'] == source for row in selected) for source in ('generated', 'reuse', 'pending')}
    return '''<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Travel level 5 · Artwork review</title>
<style>
:root{font:16px/1.5 system-ui;color:#382a4a;background:#fffaf3;color-scheme:light}body{max-width:1120px;margin:auto;padding:24px}h1{font-size:1.7rem}h1,h2{color:#5b3979}a{color:#623b86}label{display:inline-block;margin:0 12px 12px 0}input,select{display:block;max-width:100%;font:inherit;border:1px solid #bfaacb;border-radius:8px;background:white;padding:9px;box-sizing:border-box}input{width:280px}#grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:16px}article{background:white;border:1px solid #e1d5e7;border-radius:16px;text-align:center;padding:18px 10px}article[hidden]{display:none}.picture{display:flex;align-items:center;justify-content:center;width:166px;height:166px;margin:auto;border-radius:10px;background-color:#fff;background-image:linear-gradient(45deg,#f0ebf3 25%,transparent 25%),linear-gradient(-45deg,#f0ebf3 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#f0ebf3 75%),linear-gradient(-45deg,transparent 75%,#f0ebf3 75%);background-size:16px 16px;background-position:0 0,0 8px,8px -8px,-8px 0}img{width:auto;height:auto;max-width:145px;max-height:145px;object-fit:contain}h2{font-size:1.2rem;margin:12px 0 2px}article p{margin:0 0 6px}small{font-size:.8rem;color:#675b6f}.pending{color:#675b6f}#count{font-variant-numeric:tabular-nums}@media(max-width:480px){body{padding:14px}#grid{grid-template-columns:1fr}label{display:block}input,select{width:100%}}
</style>
<h1>Travel level 5 · Art, music and culture</h1>
<p>ROUND · 36 words · GENERATED new pictures · REUSED existing pictures · PENDING pending.</p>
<p>Click any picture to inspect the original. Artwork is awaiting your feedback; audio and pack activation follow separately.</p>
<label>Search Spanish or English<input id="search" type="search" placeholder="Search words"></label>
<label>Group<select id="group"><option value="">All groups</option>OPTIONS</select></label>
<p id="count" aria-live="polite">36 of 36 words</p><main id="grid">CARDS</main>
<p><a href="manifest.json">Artwork manifest</a> · <a href="requests.json">Exact generation prompts</a> · <a href="https://github.com/ajhconway/kikimashta/issues/243">Issue #243</a></p>
<script>
const clean=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
const search=document.querySelector('#search'),group=document.querySelector('#group'),cards=[...document.querySelectorAll('article')];
function filter(){const query=clean(search.value.trim());let count=0;for(const card of cards){card.hidden=!(clean(card.dataset.search).includes(query)&&(!group.value||card.dataset.group===group.value));if(!card.hidden)count++;}document.querySelector('#count').textContent=`${count} of ${cards.length} words`;}
search.addEventListener('input',filter);group.addEventListener('change',filter);
</script></html>
'''.replace('ROUND', 'Revised artwork round' if any(row.get('version') == 2 for row in selected) else 'First artwork round').replace('GENERATED', str(counts['generated'])).replace('REUSED', str(counts['reuse'])).replace('PENDING', str(counts['pending'])).replace('OPTIONS', options).replace('CARDS', ''.join(cards))


def build(complete=False):
    draft_path = DATA / 'draft.json'
    draft = load(draft_path)
    draft_hash = sha(safe_path(draft_path).read_bytes())
    approval_path = DATA / 'generation-approval.json'
    approval = load(approval_path)
    request_document = load(ART / 'requests.json')
    if approval.get('draftSha256') != draft_hash or request_document.get('draftSha256') != draft_hash:
        raise ValueError('Generation approval and requests must bind the current draft hash')
    items = unique(draft['items'], 'id')
    slugs = unique(draft['items'], 'slug')
    if len(items) != 36 or len(slugs) != 36:
        raise ValueError('Expected 36 distinct words and slugs')
    groups = unique(draft['groups'], 'id')
    for item in items.values():
        if item['group'] not in groups or not re.fullmatch(r'[a-z0-9-]+', item['slug']):
            raise ValueError('Invalid group or slug')
    requests = unique(request_document['requests'], 'id')
    reuse_file = ART / 'reuse-review.json'
    reuse = unique(load(reuse_file)['items'], 'id') if safe_path(reuse_file, exists=False).exists() else {}
    if set(requests) & set(reuse) or set(requests) | set(reuse) != set(items):
        raise ValueError('Each word must have exactly one generation request or reviewed reuse')
    amendment_path = ART / 'revisions/people-v2-requests.json'
    snapshot_path = ART / 'revisions/before-people-v2-manifest.json'
    amendment_inputs, replacements, snapshot_items = [], {}, {}
    if safe_path(amendment_path, exists=False).exists():
        amendment = load(amendment_path)
        if (amendment.get('issue') != 243 or amendment.get('version') != 2
                or not amendment.get('ownerFeedback')
                or amendment.get('baseDraftSha256') != draft_hash
                or amendment.get('baseRequestsSha256') != sha(safe_path(ART / 'requests.json').read_bytes())):
            raise ValueError('Artwork amendment must bind the original draft and requests')
        snapshot = json.loads(verified(snapshot_path, amendment.get('baseManifestSha256', '')))
        snapshot_items = unique(snapshot['items'], 'id')
        if (set(snapshot_items) != set(items) or snapshot.get('pack') != draft['id']
                or snapshot.get('pendingImages') != 0
                or snapshot['inputHashes'].get(str(draft_path)) != draft_hash
                or snapshot['inputHashes'].get(str(ART / 'requests.json')) != amendment['baseRequestsSha256']):
            raise ValueError('Artwork amendment requires the complete original manifest')
        for historical_path, historical_hash in snapshot['inputHashes'].items():
            verified(historical_path, historical_hash)
        replacements = unique(amendment['requests'], 'id')
        action_ids = {item_id for item_id, item in items.items() if item['group'] == 'actions'}
        if (len(action_ids) != 6 or set(replacements) != action_ids
                or not action_ids <= set(requests)
                or any(request.get('version') != 2 for request in replacements.values())):
            raise ValueError('Artwork amendment may replace exactly the six action pictures at version 2')
        amendment_inputs = [amendment_path, snapshot_path]
    # Preserve verification of historical references as well as new replacements.
    for request in list(requests.values()) + list(replacements.values()):
        for reference in request['references']:
            verified(reference['path'], reference['sha256'])
    requests.update(replacements)
    for item_id, request in requests.items():
        if request['slug'] != items[item_id]['slug'] or request.get('transparent_background') is not True or not request['prompt'].strip():
            raise ValueError('Request identity/transparency mismatch')
        for reference in request['references']:
            verified(reference['path'], reference['sha256'])
    selected = []
    for item_id, item in items.items():
        base = {'id': item_id, 'slug': item['slug'], 'text': item['text'], 'meaning': item['meaning'], 'group': item['group']}
        if item_id in reuse:
            entry = reuse[item_id]
            if entry['slug'] != item['slug'] or not entry.get('evidence'):
                raise ValueError('Reuse requires matching identity and approval evidence')
            raw = verified(entry['path'], entry['sha256'])
            selected.append({**base, 'source': 'reuse', 'path': entry['path'], 'sha256': entry['sha256'], 'bytes': len(raw), 'image': png_info(raw)})
            continue
        version = 2 if item_id in replacements else 1
        record_path = ART / 'records' / f'{item["slug"]}-v{version}.json'
        if not safe_path(record_path, exists=False).exists():
            selected.append({**base, 'source': 'pending', 'version': version})
            continue
        record = load(record_path)
        request = requests[item_id]
        expected_path = f'originals/{item["slug"]}-v{version}.png'
        if (record['id'] != item_id or record['slug'] != item['slug'] or record['version'] != version
                or record['path'] != expected_path or record['tool'] != 'built-in image_gen'
                or record['references'] != request['references']
                or record['promptSha256'] != sha(request['prompt'].encode())):
            raise ValueError(f'Generation record mismatch: {item_id}')
        path = ART / expected_path
        raw = verified(path, record['sha256'])
        image = png_info(raw, require_alpha=True)
        if 'bytes' in record and record['bytes'] != len(raw):
            raise ValueError('Recorded byte count mismatch')
        for key in ('width', 'height'):
            if key in record and record[key] != image[key]:
                raise ValueError(f'Recorded {key} mismatch')
        selected.append({**base, 'source': 'generated', 'version': version, 'path': str(path), 'sha256': record['sha256'], 'bytes': len(raw), 'record': str(record_path), 'image': image})
    if snapshot_items:
        for row in selected:
            if row['id'] not in replacements:
                previous = snapshot_items[row['id']]
                if any(row.get(key) != previous.get(key) for key in ('source', 'path', 'sha256', 'version')):
                    raise ValueError(f'Unaffected artwork changed during action amendment: {row["id"]}')
    pending = sum(row['source'] == 'pending' for row in selected)
    if complete and pending:
        raise ValueError(f'{pending} pictures remain pending')
    # Finish all validation before writing any outputs.
    outputs = [ART / name for name in ('selection.json', 'manifest.json', 'review.html', 'artwork.html')]
    for path in outputs:
        safe_path(path, exists=False)
    selection = {'issue': 243, 'pack': draft['id'], 'items': selected}
    write_json(ART / 'selection.json', selection)
    inputs = [draft_path, approval_path, ART / 'requests.json', *amendment_inputs]
    if safe_path(reuse_file, exists=False).exists():
        inputs.append(reuse_file)
    inputs.extend(Path(row['record']) for row in selected if row['source'] == 'generated')
    manifest = {'issue': 243, 'pack': draft['id'], 'status': 'generated-awaiting-owner-artwork-review' if not pending else 'generation-in-progress', 'words': len(items), 'generatedImages': sum(row['source'] == 'generated' for row in selected), 'reusedImages': sum(row['source'] == 'reuse' for row in selected), 'pendingImages': pending, 'audioGenerationAuthorized': False, 'runtimeActivationAuthorized': False, 'reviewWorkflow': 'complete-pack-before-owner-feedback', 'inputHashes': {str(path): sha(safe_path(path).read_bytes()) for path in inputs}, 'selection': str(ART / 'selection.json'), 'selectionSha256': sha(safe_path(ART / 'selection.json').read_bytes()), 'items': selected}
    write_json(ART / 'manifest.json', manifest)
    page = render(draft, selected)
    for name in ('review.html', 'artwork.html'):
        safe_path(ART / name, exists=False).write_text(page)
    print(f'Artwork review verified: {manifest["generatedImages"]} generated, {manifest["reusedImages"]} reused, {pending} pending / {len(items)} words.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--complete', action='store_true', help='Require all 36 pictures before writing any outputs.')
    args = parser.parse_args()
    try:
        build(complete=args.complete)
    except (KeyError, ValueError, OSError, zlib.error, struct.error) as error:
        parser.exit(1, f'Artwork review failed: {error}\n')
