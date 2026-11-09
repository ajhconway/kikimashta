#!/usr/bin/env python3
"""Build the complete scene-and-contrast artwork review for issue #233 (standard library only)."""

import argparse
from collections import Counter
import hashlib
import html
import json
import os
from pathlib import Path
import re
from urllib.parse import quote


EXPECTED_COUNT = 43
KINDS = {'generated', 'existing-approved', 'shared-new'}
STATUSES = {'pending-generation', 'generated-pending-owner-review', 'existing-approved-reuse', 'approved'}


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


def approved_artwork(asset, image_path):
    approval = asset.get('approval')
    if approval is None and asset.get('status') != 'approved':
        return False
    item_id = asset['id']
    if not isinstance(approval, dict) or image_path is None or not image_path.is_file():
        raise ValueError(f'{item_id}: artwork approval needs an existing selected image and approval record.')
    if approval.get('scope') != 'artwork only' or any(
            not isinstance(approval.get(key), str) or not approval[key].strip()
            for key in ['ownerStatement', 'date']):
        raise ValueError(f'{item_id}: artwork approval needs artwork-only scope, owner statement and date.')
    version = asset.get('selectedVersion')
    sha = digest(image_path)
    if (type(version) is not int or version < 1 or type(approval.get('selectedVersion')) is not int
            or approval['selectedVersion'] != version or approval.get('sha256') != sha or asset.get('sha256') != sha):
        raise ValueError(f'{item_id}: stale artwork approval hash or selected version.')
    versions = asset.get('versions')
    if not isinstance(versions, list) or len([
            record for record in versions if isinstance(record, dict) and type(record.get('version')) is int
            and record['version'] == version and record.get('path') == asset.get('path') and record.get('sha256') == sha]) != 1:
        raise ValueError(f'{item_id}: approved artwork does not match exactly one selected version record.')
    return asset.get('status') == 'approved'


def unique_ids(records, label):
    if not isinstance(records, list) or any(not isinstance(record, dict) for record in records):
        raise ValueError(f'{label}: expected a list of records.')
    ids = [record.get('id') for record in records]
    if any(not isinstance(item_id, str) or not item_id for item_id in ids) or len(set(ids)) != len(ids):
        raise ValueError(f'{label}: missing or duplicate IDs.')
    return set(ids)


def review_image(root, review_folder, path, sha256, label):
    image_path = in_root(root, path, label)
    if not image_path.is_relative_to(review_folder) or not image_path.is_file():
        raise ValueError(f'{label}: image must exist inside the portable review folder.')
    if image_path.suffix.lower() not in {'.png', '.jpg', '.jpeg', '.webp'}:
        raise ValueError(f'{label}: unsupported image format.')
    if not isinstance(sha256, str) or not re.fullmatch('[a-f0-9]{64}', sha256) or digest(image_path) != sha256:
        raise ValueError(f'{label}: image hash mismatch.')
    return image_path


def source_kind_matches(asset, proposal):
    override = asset.get('ownerSourceKindOverride')
    if override is None:
        return asset['sourceKind'] == proposal
    if (not isinstance(override, dict) or proposal != 'generated' or asset['sourceKind'] != 'existing-approved'
            or override.get('sourceKind') != asset['sourceKind'] or override.get('path') != asset.get('path')
            or not isinstance(override.get('path'), str) or not override['path'].strip()
            or not isinstance(override.get('sha256'), str) or not re.fullmatch('[a-f0-9]{64}', override['sha256'])
            or override.get('sha256') != asset.get('sha256') or any(
                not isinstance(override.get(key), str) or not override[key].strip()
                for key in ['ownerStatement', 'date'])):
        raise ValueError(f'{asset["id"]}: missing or stale owner-bound source-kind override.')
    return True


def alternatives_for(asset, root, review_folder):
    alternatives = asset.get('alternativeVersions', [])
    if not isinstance(alternatives, list):
        raise ValueError(f'{asset["id"]}: alternativeVersions must be a list.')
    if not alternatives:
        return []
    if (len(alternatives) != 3 or any(type(version) is not int or version < 1 for version in alternatives)
            or len(set(alternatives)) != 3 or type(asset.get('selectedVersion')) is not int or asset['selectedVersion'] != 1):
        raise ValueError(f'{asset["id"]}: three distinct alternatives must preserve the current version 1 selection.')
    versions = asset.get('versions')
    if not isinstance(versions, list):
        raise ValueError(f'{asset["id"]}: alternatives need their version records.')
    selected = [record for record in versions if isinstance(record, dict) and type(record.get('version')) is int and record['version'] == 1]
    if len(selected) != 1 or selected[0].get('path') != asset.get('path') or selected[0].get('sha256') != asset.get('sha256'):
        raise ValueError(f'{asset["id"]}: alternatives must keep the exact current version 1 image selected.')
    result = []
    for version in alternatives:
        matching = [record for record in versions if isinstance(record, dict) and type(record.get('version')) is int
                    and record['version'] == version]
        if len(matching) != 1 or version == asset['selectedVersion']:
            raise ValueError(f'{asset["id"]}: missing, duplicate or selected alternative version record.')
        record = matching[0]
        if (record.get('candidateLabel') not in {'A', 'B', 'C'} or not isinstance(record.get('conceptLabel'), str)
                or not record['conceptLabel'].strip() or record.get('status') != 'candidate-pending-owner-review'
                or type(record.get('ownerFeedbackRound')) is not int or record['ownerFeedbackRound'] != 1):
            raise ValueError(f'{asset["id"]}: alternative needs a round 1 candidate label, concept and pending status.')
        image_path = review_image(root, review_folder, record.get('path'), record.get('sha256'), f'{asset["id"]} alternative {version}')
        result.append((record, image_path))
    if {record['candidateLabel'] for record, _ in result} != {'A', 'B', 'C'}:
        raise ValueError(f'{asset["id"]}: alternatives must have one each of labels A, B and C.')
    if len({path for _, path in result}) != 3 or len({record['sha256'] for record, _ in result}) != 3:
        raise ValueError(f'{asset["id"]}: alternatives must have three distinct image paths and hashes.')
    return sorted(result, key=lambda item: item[0]['candidateLabel'])


def related_candidates(manifest, root, review_folder, selected_ids):
    candidates = manifest.get('relatedFamilyCandidates', [])
    if not isinstance(candidates, list) or len(candidates) > 1:
        raise ValueError('Expected at most the separately authorized Night family proposal.')
    result = []
    for candidate in candidates:
        if (not isinstance(candidate, dict) or candidate.get('id') != 'ja-v-ba0c8a160c33'
                or candidate['id'] in selected_ids or candidate.get('text') != '夜' or candidate.get('reading') != 'よる'
                or candidate.get('meaning') != 'Night' or candidate.get('family') != 'time-of-day'
                or candidate.get('status') != 'candidate-pending-owner-review' or type(candidate.get('version')) is not int
                or candidate['version'] < 1 or not isinstance(candidate.get('prompt'), str) or not candidate['prompt'].strip()):
            raise ValueError('Related family record must be the pending Night proposal outside the 43-card selection.')
        proposed = review_image(root, review_folder, candidate.get('path'), candidate.get('sha256'), 'Proposed Night')
        current = review_image(root, review_folder, candidate.get('currentApprovedPath'), candidate.get('currentApprovedSha256'), 'Current approved Night')
        result.append((candidate, proposed, current))
    return result


def load_plan(root, path):
    plan = json.loads(path.read_text(encoding='utf-8'))
    if plan.get('issue') != 233 or plan.get('category') != 'staged-picture' or plan.get('expectedAssetCount') != EXPECTED_COUNT:
        raise ValueError('Expected the issue 233 plan for exactly 43 scene/contrast cards.')
    if not isinstance(plan.get('sourceRevision'), str) or not re.fullmatch('[a-f0-9]{40}', plan['sourceRevision']):
        raise ValueError('Plan sourceRevision must be a full 40-character hexadecimal commit.')
    entries = plan.get('items')
    if not isinstance(entries, list) or any(not isinstance(entry, dict) or not isinstance(entry.get('review'), dict) for entry in entries):
        raise ValueError('Scene plan must contain nested original review records.')
    items = [entry['review'] for entry in entries]
    selected = unique_ids(items, 'Plan')
    if len(items) != EXPECTED_COUNT or any(item.get('category') != 'staged-picture' for item in items):
        raise ValueError('Every one of the 43 selected cards must have category staged-picture.')
    if any(not isinstance(entry.get('proposedConcept'), str) or not entry['proposedConcept'].strip()
           or entry.get('sourceKindProposal') not in KINDS for entry in entries):
        raise ValueError('Every selected scene needs a proposed concept and source kind.')
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
    scene_items = {item['id']: item for item in reviewed if item.get('category') == 'staged-picture'}
    if (plan.get('totalCategoryCount') != len(scene_items) or len(scene_items) != 67
            or plan.get('excludedUpdatedCount') != len(excluded) or len(excluded) != 24 or set(excluded) - scene_items.keys()):
        raise ValueError('Scene count or exclusions do not match the frozen suitability review.')
    if selected != scene_items.keys() - set(excluded):
        raise ValueError('Plan does not contain exactly the unupdated scene/contrast selection.')
    for item in items:
        if item != scene_items[item['id']]:
            raise ValueError(f'{item["id"]}: selected review record differs from the frozen source.')
    return plan


def pending_asset(entry):
    item = entry['review']
    asset = {'id': item['id'], 'text': item['japanese'], 'reading': item['reading'],
             'meaning': item['catalogMeaning'], 'level': item['level'], 'concept': entry['proposedConcept'],
             'sourceKind': entry['sourceKindProposal'], 'status': 'pending-generation'}
    if entry.get('sharedFromId'):
        asset['sharedFromId'] = entry['sharedFromId']
    return asset


def metadata_links(root, review_folder, revision, output, value):
    """Keep local links portable; pin sources outside the review folder to GitHub."""
    links = {}

    def visit(item, source_revision=revision):
        if isinstance(item, dict):
            source_revision = item.get('sourceRevision', item.get('commit', source_revision))
            if not isinstance(source_revision, str) or not re.fullmatch('[a-f0-9]{40}', source_revision):
                raise ValueError('Provenance source revision must be a full hexadecimal commit.')
            for child in item.values():
                visit(child, source_revision)
        elif isinstance(item, list):
            for child in item:
                visit(child, source_revision)
        elif isinstance(item, str):
            if item.startswith('https://github.com/ajhconway/kikimashta/'):
                links[item] = item
            elif item.startswith(('artifacts/', 'content/', 'public/', 'scripts/')):
                candidate = in_root(root, item, 'Provenance')
                if candidate.is_file() and candidate.is_relative_to(review_folder):
                    links[item] = local_url(candidate, output)
                elif candidate.is_file() or source_revision != revision:
                    repo_path = quote(candidate.relative_to(root).as_posix(), safe='/')
                    links[item] = f'https://github.com/ajhconway/kikimashta/blob/{source_revision}/{repo_path}'

    visit(value)
    return ''.join(f'<li><a href="{escaped(url)}" target="_blank" rel="noopener">{escaped(label)}</a></li>'
                   for label, url in links.items())


def build(root, plan_path=None, manifest_path=None, output=None):
    root = root.resolve()
    folder = root / 'artifacts/scene-art-233'
    plan_path = (plan_path or folder / 'plan.json').resolve()
    manifest_path = (manifest_path or folder / 'manifest.json').resolve()
    output = (output or folder / 'index.html').resolve()
    for path in [plan_path, manifest_path, output]:
        if not path.is_relative_to(root):
            raise ValueError('Plan, manifest and output must stay inside the repository.')
    plan = load_plan(root, plan_path)
    review_folder = plan_path.parent
    entries_by_id = {entry['review']['id']: entry for entry in plan['items']}
    by_id = {item_id: entry['review'] for item_id, entry in entries_by_id.items()}
    has_manifest = manifest_path.is_file()
    if has_manifest:
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        if manifest.get('issue') != 233 or manifest.get('expectedAssetCount') != EXPECTED_COUNT:
            raise ValueError('Expected an issue 233 manifest for exactly 43 assets.')
        assets = manifest.get('assets')
        if unique_ids(assets, 'Manifest') != set(by_id) or len(assets) != EXPECTED_COUNT:
            raise ValueError('Manifest must contain exactly the 43 selected scene/contrast IDs.')
    else:
        manifest = {}
        assets = [pending_asset(entry) for entry in plan['items']]
    asset_by_id = {asset['id']: asset for asset in assets}
    ready_paths = {}
    approved_ids = set()
    alternatives_by_id = {}
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
        if not source_kind_matches(asset, entries_by_id[item_id]['sourceKindProposal']):
            raise ValueError(f'{item_id}: source kind differs from the selected scene plan.')
        if ((kind == 'existing-approved') != (status == 'existing-approved-reuse')
                and status not in {'pending-generation', 'approved'}):
            raise ValueError(f'{item_id}: inconsistent reuse source kind and status.')
        path = in_root(root, asset['path'], item_id) if asset.get('path') is not None else None
        if path is not None and not path.is_relative_to(review_folder):
            raise ValueError(f'{item_id}: selected image must stay inside the portable review folder.')
        ready = path is not None and path.is_file()
        if status != 'pending-generation' and not ready:
            raise ValueError(f'{item_id}: ready artwork file is missing.')
        approved = approved_artwork(asset, path)
        if approved:
            approved_ids.add(item_id)
            counts['approved'] += 1
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
            counts['awaiting'] += not approved
        else:
            counts['pending'] += 1
        if kind == 'shared-new':
            source_id = asset.get('sharedFromId')
            source = asset_by_id.get(source_id)
            if not source or source_id == item_id or source.get('sourceKind') != 'generated':
                raise ValueError(f'{item_id}: shared artwork must identify its generated source card.')
            if ready and (source.get('sha256') != asset.get('sha256') or source.get('status') == 'pending-generation'):
                raise ValueError(f'{item_id}: shared artwork does not match the source selection.')
        alternatives_by_id[item_id] = alternatives_for(asset, root, review_folder)
        counts['alternatives'] += len(alternatives_by_id[item_id])
    family_candidates = related_candidates(manifest, root, review_folder, set(by_id))
    counts['related'] = len(family_candidates)
    family_selected = []
    if family_candidates:
        for text in ['日の出', '夕方']:
            matching = [asset for asset in assets if asset['text'] == text]
            if len(matching) != 1 or matching[0]['id'] not in ready_paths:
                raise ValueError('Time-of-day comparison needs both validated selected Sunrise and Evening images.')
            family_selected.append(matching[0])

    cards = []
    for number, entry in enumerate(plan['items'], 1):
        original = entry['review']
        item_id = original['id']
        asset = asset_by_id[item_id]
        ready = item_id in ready_paths
        approved = item_id in approved_ids
        kind = asset['sourceKind']
        label = {'generated': 'New illustration', 'existing-approved': 'Existing approved image · accepted reuse' if approved else 'Existing approved image · proposed reuse',
                 'shared-new': 'Shared new illustration'}[kind]
        if ready:
            image_url = escaped(local_url(ready_paths[item_id], output))
            media = (f'<a class="preview" href="{image_url}" target="_blank" rel="noopener" '
                     f'aria-label="Open full-size {escaped(asset["meaning"])} artwork">'
                     f'<img src="{image_url}" alt="{"Approved" if approved else "Proposed"} artwork for {escaped(asset["meaning"])}" loading="lazy"></a>')
            full_link = f'<a href="{image_url}" target="_blank" rel="noopener">Open full size ↗</a>'
            status = 'Approved artwork' if approved else 'Ready for this batch’s owner review'
        else:
            media = '<div class="preview placeholder">Artwork pending generation</div>'
            full_link = ''
            status = 'Pending generation'
        shared = ''
        if kind == 'shared-new':
            source_id = asset['sharedFromId']
            shared = (f'<p class="reuse-note">Shares the same new illustration as '
                      f'<a href="#{escaped(source_id)}" lang="ja">{escaped(by_id[source_id]["japanese"])}</a>.</p>')
        concept = asset.get('concept') or asset.get('imageDescription') or asset.get('ownerRevisionNote') or entry['proposedConcept']
        revision_note = asset.get('ownerRevisionNote')
        revision = f'<p class="concept"><b>Current picture concept:</b> {escaped(concept)}</p>'
        if revision_note and revision_note != concept:
            revision += f'<p class="reuse-note"><b>Concept note:</b> {escaped(revision_note)}</p>'
        if family_candidates and asset['text'] in {'日の出', '夕方'}:
            revision += '<p class="family-link"><a href="#time-of-day-family">Compare the time-of-day family ↓</a></p>'
        option_cards = []
        for alternative, image_path in alternatives_by_id[item_id]:
            option_url = escaped(local_url(image_path, output))
            option_label = escaped(alternative['candidateLabel'])
            version = alternative['version']
            concept_label = escaped(alternative['conceptLabel'])
            option_cards.append(f'<figure class="alternative" id="{escaped(item_id)}-alternative-{option_label}">'
                                f'<figcaption><b>Alternative {option_label} · version {version}</b><span>{concept_label}</span></figcaption>'
                                f'<a class="preview" href="{option_url}" target="_blank" rel="noopener" '
                                f'aria-label="Open full-size {escaped(asset["text"])} alternative {option_label}">'
                                f'<img src="{option_url}" alt="Alternative {option_label} for {escaped(asset["meaning"])}: {concept_label}" loading="lazy"></a>'
                                f'<a href="{option_url}" target="_blank" rel="noopener">Open alternative {option_label} full size ↗</a></figure>')
        alternatives_html = ('<section class="alternatives" aria-label="Alternatives for ' + escaped(asset['text']) + '">'
                             '<h3>Three alternatives</h3><p>Previous version 1 is shown above for comparison. '
                             'Options A, B and C are ready for your review.</p><div class="alternative-grid">'
                             + ''.join(option_cards) + '</div></section>') if option_cards else ''
        review_notes = ''.join(f'<p><b>{title}:</b> {escaped(original[key])}</p>'
                               for title, key in [('Original picture recommendation', 'recommendation'), ('Suitability', 'rationale'),
                                                  ('Existing review note', 'currentVisualReviewNote'), ('Teaching note', 'existingTeachingNote')]
                               if original.get(key))
        if original.get('englishNote'):
            review_notes += f'<p><b>Answer note:</b> {escaped(original["englishNote"])}</p>'
        approval_note = (f'<p class="approval-note">Artwork approved {escaped(asset["approval"]["date"])} · '
                         f'version {escaped(asset["selectedVersion"])} · {escaped(asset["approval"]["ownerStatement"])}</p>'
                         if approved else '')
        source_data = {key: asset[key] for key in ['sourceProvenance', 'references', 'versions', 'alternativeVersions', 'sharedFromId', 'concept', 'imageDescription', 'ownerRevisionNote', 'ownerSourceKindOverride', 'image', 'sha256', 'selectedVersion', 'status', 'approval'] if key in asset}
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
        cards.append(f'<article class="card{" has-alternatives" if option_cards else ""}" id="{escaped(item_id)}" data-search="{search}" data-kind="{escaped(kind)}">'
                     f'<div class="number">{number:02d} / {EXPECTED_COUNT} · WaniKani level {escaped(asset["level"])}</div>{media}'
                     f'<div class="body"><h2 lang="ja">{escaped(asset["text"])}</h2><p class="reading" lang="ja">{escaped(asset["reading"])}</p>'
                     f'<p class="meaning">{escaped(asset["meaning"])}</p><p class="source-kind">{label}</p>'
                     f'<p class="status{" approved" if approved else ""}">{status}</p>{approval_note}{full_link}{shared}{revision}{alternatives_html}<details class="review-notes"><summary>Suitability and answer-choice notes</summary>'
                     f'{review_notes}</details>{metadata}</div></article>')

    family_cards = []
    for candidate, proposed_path, current_path in family_candidates:
        current_url = escaped(local_url(current_path, output))
        proposed_url = escaped(local_url(proposed_path, output))
        family_sources = metadata_links(root, review_folder, plan['sourceRevision'], output, candidate)
        selected_figures = []
        for selected in family_selected:
            selected_url = escaped(local_url(ready_paths[selected['id']], output))
            selected_figures.append(f'<figure><figcaption><b><span lang="ja">{escaped(selected["text"])}</span> · {escaped(selected["meaning"])}</b>'
                                    f'<span>Proposal · version {escaped(selected.get("selectedVersion", "not recorded"))}</span></figcaption>'
                                    f'<a class="preview" href="{selected_url}" target="_blank" rel="noopener">'
                                    f'<img src="{selected_url}" alt="{escaped(selected["meaning"])} family proposal" loading="lazy"></a>'
                                    f'<a href="{selected_url}" target="_blank" rel="noopener">Open {escaped(selected["meaning"])} full size ↗</a>'
                                    f' · <a href="#{escaped(selected["id"])}">View selected card ↑</a></figure>')
        family_cards.append(f'<article class="related-candidate" id="related-{escaped(candidate["id"])}">'
                            '<h3>Matching landscape proposals</h3><div class="family-proposals">'
                            + ''.join(selected_figures)
                            + f'<figure><figcaption><b><span lang="ja">{escaped(candidate["text"])} · {escaped(candidate["reading"])}</span> · Night</b>'
                            f'<span>Proposal · version {candidate["version"]}</span></figcaption>'
                            f'<a class="preview" href="{proposed_url}" target="_blank" rel="noopener"><img src="{proposed_url}" '
                            'alt="Night family proposal" loading="lazy"></a>'
                            f'<a href="{proposed_url}" target="_blank" rel="noopener">Open proposed Night full size ↗</a></figure></div>'
                            '<div class="family-reference"><figure><figcaption><b>Earlier approved Night reference</b></figcaption>'
                            f'<a class="preview" href="{current_url}" target="_blank" rel="noopener"><img src="{current_url}" '
                            'alt="Earlier approved Night illustration" loading="lazy"></a>'
                            f'<a href="{current_url}" target="_blank" rel="noopener">Open current Night full size ↗</a></figure></div>'
                            '<details><summary>Night proposal prompt and source details</summary>'
                            f'<pre>{escaped(candidate["prompt"])}</pre>'
                            + (f'<ul class="source-links">{family_sources}</ul>' if family_sources else '')
                            + f'<pre class="technical">{escaped(json.dumps(candidate, ensure_ascii=False, indent=2))}</pre></details></article>')
    family_links = ' · '.join(f'<a href="#{escaped(asset["id"])}" lang="ja">{escaped(asset["text"])}</a>'
                              for asset in assets if asset['text'] in {'日の出', '夕方'})
    family_html = ('<section class="related-family" id="time-of-day-family" aria-labelledby="family-heading">'
                   '<h2 id="family-heading">Time-of-day family</h2>'
                   '<p>Compare the matching sunrise, early-evening and night proposals. '
                   'The earlier approved Night illustration is included as a reference.</p><p>Related selected cards: ' + family_links + '</p>'
                   + ''.join(family_cards) + '</section>') if family_cards else ''

    files = f'<a href="{escaped(local_url(plan_path, output))}" download>Frozen selection plan</a>'
    files += f' · <a href="{escaped(local_url(plan_path.parent / "sources/suitability-review.json", output))}">Original suitability review</a>'
    if has_manifest:
        files += f' · <a href="{escaped(local_url(manifest_path, output))}" download>Artwork manifest</a>'
    approvals_path = review_folder / 'approvals.json'
    if approvals_path.is_file():
        files += f' · <a href="{escaped(local_url(approvals_path, output))}" download>Artwork approvals</a>'
    page = '''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Scene and contrast artwork · Review #233</title><style>
:root{font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;line-height:1.5;color:#352246;background:#faf8fe;color-scheme:light}*{box-sizing:border-box}body{max-width:1600px;margin:auto;padding:28px}header{max-width:1050px;margin-bottom:28px}h1{font-size:clamp(1.8rem,4vw,2.6rem);line-height:1.15;letter-spacing:-.03em;margin:8px 0 16px}p{margin:8px 0}a{color:#65339a;text-underline-offset:3px}a:focus-visible,summary:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #ae6b00;outline-offset:4px}.eyebrow{color:#796385;font-size:.85rem}.notice{border-left:4px solid #dfad38;background:#fff5d8;border-radius:6px;padding:12px 16px;margin:20px 0}.tallies{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.tally{background:#eee5fa;border-radius:20px;padding:7px 14px;font-weight:650;font-size:.9rem}.filters{display:flex;gap:16px;flex-wrap:wrap;margin:20px 0}.filters label{display:flex;flex-direction:column;font-size:.9rem;gap:6px}.filters input,.filters select{font:inherit;color:inherit;border:1px solid #c8b4dc;border-radius:8px;background:white;padding:9px 12px;max-width:100%}.filters input{width:300px}.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),1fr));gap:22px}.card{background:white;border:1px solid #dfd3ed;border-radius:18px;overflow:hidden;box-shadow:0 3px 12px #44205a08;scroll-margin-top:20px}.card[hidden]{display:none}.number{padding:10px 16px;font-size:.8rem;font-weight:700;color:#74617c}.preview{display:flex;width:100%;aspect-ratio:1;align-items:center;justify-content:center;background-color:white;background-image:linear-gradient(45deg,#f0eafa 25%,transparent 25%),linear-gradient(-45deg,#f0eafa 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#f0eafa 75%),linear-gradient(-45deg,transparent 75%,#f0eafa 75%);background-size:28px 28px;background-position:0 0,0 14px,14px -14px,-14px 0}.preview img{display:block;width:100%;height:100%;object-fit:contain;padding:14px}.placeholder{font-size:.9rem;color:#75617e;padding:24px;text-align:center}.body{padding:18px}h2{font-size:1.65rem;line-height:1.2;margin:0}.reading{font-size:.92rem;color:#7b6286}.meaning{font-size:1.05rem;font-weight:650}.source-kind{font-size:.85rem;font-weight:650;color:#65477a}.status{display:table;font-size:.78rem;background:#fff1c7;color:#6e4a12;border-radius:8px;padding:5px 9px;margin:12px 0}.reuse-note{font-size:.85rem}details{margin-top:18px;border-top:1px solid #eee6f4;padding-top:12px}summary{cursor:pointer;color:#65477a;font-size:.83rem}details h3{font-size:.88rem}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:.83rem;background:#f6f2fb;padding:12px;border-radius:8px}.review-notes p{font-size:.85rem;margin:12px 0}.technical,.source-links{font-size:.72rem;color:#786480;overflow-wrap:anywhere}.source-links{padding-left:18px}footer{font-size:.85rem;color:#7b6286;margin:28px 0}@media(max-width:600px){body{padding:16px}.gallery{gap:16px}.filters{gap:12px}.filters label{width:100%}.filters input{width:100%}}@media print{.filters,#shown-count{display:none}body{background:white}.gallery{grid-template-columns:repeat(3,1fr)}details{display:none}.card{break-inside:avoid;box-shadow:none}.preview img{padding:8px}}
.status.approved{background:#e1f2e7;color:#245e3b}.approval-note{font-size:.8rem;color:#245e3b}
.alternatives{border-top:1px solid #dfd3ed;margin-top:20px;padding-top:14px}.alternatives h3{font-size:1rem;margin:0}.alternatives>p,.family-link{font-size:.85rem}.alternative-grid{display:grid;grid-template-columns:1fr;gap:18px;margin-top:14px}.alternative,.family-proposals figure,.family-reference figure{margin:0;min-width:0}.alternative figcaption,.family-proposals figcaption,.family-reference figcaption{font-size:.85rem;margin-bottom:8px}.alternative figcaption span,.family-proposals figcaption>span,.family-reference figcaption span{display:block;margin-top:4px}.alternative>a:last-child,.family-proposals figure>a,.family-reference figure>a:last-child{font-size:.8rem}.alternative .preview{border:1px solid #e4d9ef;border-radius:10px;overflow:hidden}.alternative .preview img{padding:8px}.related-family{margin-top:36px;border-top:2px solid #dfd3ed;padding-top:24px}.related-family>h2{font-size:1.5rem}.related-candidate{background:white;border:1px solid #dfd3ed;border-radius:18px;padding:20px;margin-top:20px}.related-candidate>h3{font-size:1.3rem;margin:0}.family-proposals{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px;margin-top:18px}.family-reference{max-width:360px;margin:24px 0 0 auto}@media(min-width:900px){.card.has-alternatives{grid-column:span 2}.card.has-alternatives>.preview{aspect-ratio:auto;height:300px}.alternative-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}@media(max-width:600px){.family-proposals{grid-template-columns:1fr}.family-reference{max-width:none;margin-top:28px}.related-candidate{padding:16px}}@media print{.card.has-alternatives{grid-column:span 3}.alternative-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.related-family{break-before:page}}
</style></head><body><header><p class="eyebrow">Kikimashta · Artwork review · Issue #233</p>
<h1>Picture with scene / contrast artwork</h1><p>All 43 cards categorized exactly <b>staged-picture</b> (Picture with scene / contrast) in the WaniKani source-level 2–5 suitability review that lacked published updated artwork at the frozen source revision. The 24 already updated IDs in this category are excluded.</p>
<div class="notice"><b>Artwork approval: __APPROVED__ of 43.</b> New illustrations, shared images and existing approved reuses are identified separately. Approved artwork labels bind to the exact selected version and image hash. Earlier source approval does not approve this batch’s selection. Artwork approval does not activate artwork, vocabulary or practice cards.</div>
<div class="tallies"><span class="tally">43 selected cards</span><span class="tally">__READY__ selected images available</span><span class="tally">__APPROVED__ approved artwork</span><span class="tally">__AWAITING__ awaiting owner review</span><span class="tally">__NEW__ new images</span><span class="tally">__SHARED__ shared new images</span><span class="tally">__REUSED__ existing approved reuses</span><span class="tally">__PENDING__ pending generation</span><span class="tally">__ALTERNATIVES__ alternatives</span><span class="tally">__RELATED__ related family proposals</span></div>
<p>Open any picture at full size. Expand its details for exact prompts, source provenance and suitability notes, including overlapping meanings to keep out of competing answer choices.</p><p>__FILES__ · <a href="https://github.com/ajhconway/kikimashta/issues/233">GitHub issue #233</a></p>
<div class="filters"><label>Find a card<input id="search" type="search" placeholder="Japanese, reading, English or level"></label><label>Artwork source<select id="kind"><option value="all">All sources</option><option value="generated">New illustrations</option><option value="shared-new">Shared new illustrations</option><option value="existing-approved">Existing approved reuses</option></select></label></div><p id="shown-count" role="status">Showing 43 of 43 cards</p></header>
<main class="gallery">__CARDS__</main>__FAMILY__<footer>Source revision: <code>__REVISION__</code>. __APPROVED__ selected artworks have matching owner approvals for this batch; __AWAITING__ ready selections await owner acceptance and __PENDING__ await generation. Alternatives and related family proposals await review and do not add cards to the frozen 43-card scope. Approval covers artwork only. Review preparation does not change active artwork, audio, vocabulary eligibility or progress.</footer>
<script>const cards=[...document.querySelectorAll('.card')],search=document.querySelector('#search'),kind=document.querySelector('#kind');function filter(){const term=search.value.trim().toLocaleLowerCase();let shown=0;for(const card of cards){card.hidden=!card.dataset.search.toLocaleLowerCase().includes(term)||(kind.value!=='all'&&card.dataset.kind!==kind.value);if(!card.hidden)shown++}document.querySelector('#shown-count').textContent=`Showing ${shown} of ${cards.length} cards`}search.addEventListener('input',filter);kind.addEventListener('change',filter);</script></body></html>'''
    for marker, value in {'__READY__': counts['ready'], '__NEW__': counts['generated'], '__SHARED__': counts['shared-new'],
                          '__REUSED__': counts['existing-approved'], '__PENDING__': counts['pending'], '__FILES__': files,
                          '__APPROVED__': counts['approved'], '__AWAITING__': counts['awaiting'],
                          '__ALTERNATIVES__': counts['alternatives'], '__RELATED__': counts['related'], '__FAMILY__': family_html,
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
    print(f'Scene review #233: {counts["ready"]} ready ({counts["generated"]} new, '
          f'{counts["shared-new"]} shared, {counts["existing-approved"]} existing approved reuses); '
          f'{counts["approved"]} approved artwork, {counts["awaiting"]} awaiting owner review, {counts["pending"]} pending generation.')


if __name__ == '__main__':
    main()
