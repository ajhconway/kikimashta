"""Validate staged card content and its generation DAG (#72)."""
import json
from artwork_source import source_file
import hashlib
import struct
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict, deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / 'content/card-regeneration'


def validate_reference_selection(candidate, approved):
    """A pending revision cannot replace a selection; promotion retains its history."""
    assert candidate['id'] == approved['id']
    assert approved['status'] == 'approved'
    if candidate['status'] == 'approved':
        assert approved['path'] == candidate['promotedPath']
        assert approved['sha256'] == candidate['sha256']
        assert any(old['path'] == candidate['approvedSourcePath']
                   and old['sha256'] == candidate['approvedSourceSha256']
                   for old in approved.get('previousVersions', [])), 'Promotion lost the previous approved artwork'
    else:
        assert candidate['status'] == 'awaiting-user-feedback'
        assert approved['path'] == candidate['approvedSourcePath']
        assert approved['sha256'] == candidate['approvedSourceSha256']


def validate_svg_asset(asset):
    source = ROOT / asset['sourceSvgPath']
    raw = source.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == asset['sourceSvgSha256']
    svg = ET.fromstring(raw)
    ns = {'svg': 'http://www.w3.org/2000/svg'}
    assert svg.attrib['viewBox'] == '0 0 256 256'
    assert svg.attrib['data-label'] == asset['displayLabel']
    assert int(svg.attrib['data-value']) == asset['numericValue']
    assert not svg.findall('.//svg:ellipse', ns), 'Number badge must be a circle'
    assert not svg.findall('.//svg:text', ns), 'Saved SVG lettering must be self-contained'
    circle = next(n for n in svg.findall('svg:circle', ns) if n.attrib.get('data-role') == 'outline')
    assert [circle.attrib[k] for k in ['cx', 'cy', 'r', 'stroke-width']] == ['128', '128', '108', '7']
    assert 'transform' not in circle.attrib, 'Circle geometry must not be stretched'
    assert (ROOT / asset['renderSpecification']).is_file()


def validate():
    source = json.loads((DATA / 'source-prompts.json').read_text())['records']
    review = json.loads((ROOT / 'artifacts/card-review/review-data.json').read_text())
    cards = json.loads((DATA / 'prompts.json').read_text())['cards']
    graph = json.loads((DATA / 'graph.json').read_text())
    batches = json.loads((DATA / 'batches.json').read_text())['batches']
    exclusions = json.loads((DATA / 'semantic-exclusions.json').read_text())['groups']
    ids = [c['id'] for c in cards]
    assert len(ids) == len(set(ids)) == 445, 'Expected 445 stable unique IDs'
    assert set(ids) == {c['id'] for c in review['cards']} == {c['id'] for c in source}
    by_id = {c['id']: c for c in cards}
    feedback_path = DATA / 'user-feedback.json'
    feedback = json.loads(feedback_path.read_text()) if feedback_path.exists() else {}
    for item_id, concept in feedback.get('conceptOverrides', {}).items():
        assert by_id[item_id]['concept'] == concept, 'User feedback was lost during preparation'
    for card in cards:
        for component in card['components']:
            guidance = feedback.get('componentGuidance', {}).get(component)
            if guidance:
                assert guidance in card['prompt'], 'Shared feedback missing from a dependent prompt'
    originals = {c['id']: c for c in source}
    overrides = json.loads((DATA / 'source-prompts.json').read_text())['reviewOverrides']
    for item_id, override in overrides.items():
        if 'visualGroup' in override:
            assert by_id[item_id]['visualGroup'] == override['visualGroup']
        if 'teachingNote' in override:
            assert by_id[item_id]['teachingNote'] == override['teachingNote']
            assert override['teachingNote'] in by_id[item_id]['prompt']
    for c in cards:
        assert c['prompt'].strip() and c['concept'].strip()
        assert c['originalConcept'] == originals[c['id']]['concept']
        assert c['practiceStatus'] == 'staged-for-review'
        if originals[c['id']]['reviewRequired']:
            assert c['reviewRequired'] and not c['pictureOnlyEligible']
        if c['requiresContext']:
            assert not c['pictureOnlyEligible']
    for f in review['findings']:
        affected = {c['id'] for c in cards if any(r['reference'] == f['reference'] for r in c['reviewFindings'])}
        assert affected == set(f['ids']), f'Missing/misapplied finding {f["reference"]}'
        for item_id in affected:
            card = by_id[item_id]
            constraint = next(x for x in card['generationConstraints'] if x['reference'] == f['reference'])
            assert constraint['instruction'] in card['prompt']
    node_ids = [n['id'] for n in graph['nodes']]
    assert len(node_ids) == len(set(node_ids))
    nodes = set(node_ids)
    incoming = Counter({n: 0 for n in nodes})
    children = defaultdict(list)
    for edge in graph['edges']:
        a, b = edge['from'], edge['to']
        assert a in nodes and b in nodes
        incoming[b] += 1
        children[a].append(b)
    ready = deque(n for n in nodes if incoming[n] == 0)
    visited = []
    while ready:
        n = ready.popleft()
        visited.append(n)
        for child in children[n]:
            incoming[child] -= 1
            if incoming[child] == 0:
                ready.append(child)
    assert len(visited) == len(nodes), 'Generation graph contains a cycle'
    graph_parents = defaultdict(set)
    for edge in graph['edges']:
        graph_parents[edge['to']].add(edge['from'])
    for card in cards:
        assert graph_parents['card:' + card['id']] == set(card['dependsOn'])
        style_node = card.get('styleNode', 'style')
        expected = {style_node} if card['id'] in batches[0]['cardIds'] else {style_node} | {'component:' + c for c in card['components']}
        families = feedback.get('designFamilies', {})
        for name, family in families.items():
            if card['id'] in family['memberIds'] and card['id'] != family['seedCard']:
                expected.add('family:' + name)
        assert set(card['dependsOn']) == expected
    style_path = DATA / 'style-overrides.json'
    if style_path.exists():
        styles = json.loads(style_path.read_text())
        for item_id, profile_id in styles['cardProfiles'].items():
            profile = styles['profiles'][profile_id]
            assert by_id[item_id]['styleNode'] == 'style:' + profile_id
            assert by_id[item_id]['prompt'].startswith(profile['specification'])
            assert (ROOT / profile['referencePath']).is_file()
            assert hashlib.sha256((ROOT / profile['referencePath']).read_bytes()).hexdigest() == profile['sourceSha256']
        assert {c['id'] for c in cards if c.get('styleNode', 'style') != 'style'} == set(styles['cardProfiles']), 'Style trial changed unrelated cards'
    assert by_id['ja-v-97526e11c703']['components'] == ['person'], 'Runner must reuse the person reference'
    assert by_id['ja-v-2f734ba866d9']['components'] == ['stone']
    assert by_id['ja-v-41b543dc8fe4']['components'] == ['gem']
    all_batched = [i for b in batches for i in b['cardIds']]
    assert Counter(all_batched) == Counter(ids), 'Batches omit or duplicate a card'
    requested_batches = {request['id']: request for request in feedback.get('requestedBatches', [])}
    for batch in batches:
        request = requested_batches.get(batch['id'])
        limit = request['maxCards'] if request else feedback.get('generationBatchSize', 10)
        assert 1 <= len(batch['cardIds']) <= limit
        if request:
            assert batch['cardIds'] == request['cardIds'], 'Requested themed batch was split or reordered'
    for index, batch in enumerate(batches[1:], 1):
        if batches[index-1]['status'] != 'approved':
            assert batch['status'] == 'blocked-on-previous-feedback', 'Batch unlocked before previous review'
    for group in exclusions:
        assert len(group['cardIds']) > 1 and set(group['cardIds']) <= set(ids), group['id']
    for filename in sorted((ROOT / 'artifacts/card-regeneration').glob('batch-*/manifest.json')):
        manifest = json.loads(filename.read_text())
        assert manifest['status'] in {'generating','awaiting-user-feedback','revision-required','approved'}
        batch_index = next(i for i, b in enumerate(batches) if b['id'] == filename.parent.name)
        for previous in batches[:batch_index]:
            previous_path = filename.parent.parent / previous['id'] / 'manifest.json'
            assert previous_path.is_file(), 'Cannot skip a feedback gate'
            assert json.loads(previous_path.read_text())['status'] == 'approved', 'Previous batch feedback has not been applied and approved'
        asset_ids = [asset['id'] for asset in manifest['assets']]
        assert len(asset_ids) == len(set(asset_ids)), 'Duplicate card in batch manifest'
        for asset in manifest['assets']:
            path = source_file(ROOT, asset['path'], asset.get('sha256'), asset.get('bytes'))
            assert asset['id'] in ids and path.is_file(), asset
            assert asset['prompt'] and asset['tool'] in {'built-in image_gen', 'reuse approved image', 'SVG renderer'}
            if asset['tool'] == 'reuse approved image':
                sources = [source for source_file in filename.parent.parent.glob('batch-*/manifest.json')
                           for source in json.loads(source_file.read_text())['assets']
                           if source['id'] == asset['reusedFromCard']]
                assert len(sources) == 1 and sources[0]['status'] == 'approved', 'Reuse requires one approved source'
                source_path = source_file(ROOT, sources[0]['path'], sources[0].get('sha256'))
                assert source_path.read_bytes() == path.read_bytes(), 'Reused artwork must match approved source exactly'
                assert asset['references'][0]['path'] == sources[0]['path']
            if asset['tool'] == 'SVG renderer':
                validate_svg_asset(asset)
            assert by_id[asset['id']]['artworkStatus'] == asset['status']
            if asset['id'] in feedback.get('approvedCardIds', []):
                assert asset['status'] == 'approved', 'User approval was lost'
            if asset['id'] in feedback.get('acceptedWithKnownIssues', {}):
                assert asset.get('acceptedWithKnownIssue')
                assert asset['followUp'] == feedback['acceptedWithKnownIssues'][asset['id']]
            for old in asset.get('previousVersions', []):
                original_path = source_file(ROOT, old['path'], old['sha256'])
                assert original_path.is_file(), 'Original artwork must remain available'
                assert hashlib.sha256(original_path.read_bytes()).hexdigest() == old['sha256']
            if 'sha256' in asset:
                raw = path.read_bytes()
                assert hashlib.sha256(raw).hexdigest() == asset['sha256']
                assert len(raw) == asset['bytes']
                assert struct.unpack('>II', raw[16:24]) == (asset['width'], asset['height'])
            for reference in asset['references']:
                assert source_file(ROOT, reference['path']).is_file()
        # Revisions of earlier approved examples are candidates until the owner
        # accepts them; they must not duplicate/reassign the generation schedule.
        for candidate in manifest.get('referenceRevisions', []) + manifest.get('approvedReferenceRevisions', []):
            assert candidate['id'] in feedback.get('approvedCardIds', [])
            assert candidate['id'] not in asset_ids
            approved_manifest = json.loads((ROOT / candidate['revisesManifest']).read_text())
            approved = next(a for a in approved_manifest['assets'] if a['id'] == candidate['id'])
            validate_reference_selection(candidate, approved)
            assert by_id[candidate['id']]['artworkStatus'] == 'approved'
            if candidate['tool'] == 'SVG renderer':
                validate_svg_asset(candidate)
            else:
                assert candidate['tool'] == 'built-in image_gen'
            raw = source_file(ROOT, candidate['path'], candidate['sha256']).read_bytes()
            assert hashlib.sha256(raw).hexdigest() == candidate['sha256']
            assert struct.unpack('>II', raw[16:24]) == (candidate['width'], candidate['height'])
            for old in candidate.get('previousVersions', []):
                assert hashlib.sha256(source_file(ROOT, old['path'], old['sha256']).read_bytes()).hexdigest() == old['sha256']
        if manifest['status'] == 'awaiting-user-feedback':
            batch = next(b for b in batches if b['id'] == filename.parent.name)
            assert {a['id'] for a in manifest['assets']} == set(batch['cardIds'])
    print(f'PASS: {len(cards)} prompts; all {len(review["findings"])} findings; preserved restrictions; acyclic {len(nodes)}-node graph; {len(batches)} batches; {len(exclusions)} exclusion groups; staged asset paths.')


if __name__ == '__main__':
    validate()
