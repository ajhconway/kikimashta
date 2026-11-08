"""Prepare the review-led card regeneration set for issue #72; no network calls."""
import hashlib
import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'content/card-regeneration'


def write(name, value):
    (OUT / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')


STYLE = '''Use case: scientific-educational
Asset type: one square vocabulary illustration for a Japanese listening game
Style/medium: simple flat cartoon, rounded natural silhouettes, solid fills, clean smooth dark-purple exterior outlines; understated charm. No gradients, 3D, watercolor, paper grain, sketch marks or photorealism.
Palette: ink #3f2468, pink #ff85b5, orange #ff9d47, yellow #ffe178, lavender #af86ef, sky blue #91d7ed, green #a6dbad, warm skin #ffcf9c. White and neutral gray allowed. Factual colors such as flags and named colors override decorative palette.
Scene/backdrop: genuinely transparent outer background with an alpha channel; no painted white backdrop, checkerboard, frame or rounded card border.
Composition/framing: square canvas, primary subject centered and fully visible, typically 65–75 percent of canvas; generous margin. Context is subordinate. Maintain legibility at 145px.
Line system: rounded caps and joins; exterior stroke approximately 7 units on a 256-unit canvas. Keep apparent line weight consistent across single and grouped subjects, simplify detail for small groups; no hairline details below one pixel at 145px.
Constraints: literal recognizable subject, accurate anatomy, exact quantities. No answer captions, translations, decorative badges, logos, watermarks, shadows or unrelated props. Only render text/numerals if explicitly essential to the subject, character, quantity, calendar or factual sign. An attractive mnemonic is not proof of an unambiguous meaning.'''

# Final delivery rule overrides historical white-backdrop scene/reference wording (#92).
BACKGROUND_POLICY = '''Background/export requirement (takes priority over older white-background wording above): genuinely transparent outer background with an alpha channel, never a painted white rectangle or checkerboard. Preserve opaque white subject details such as clouds, snow and animal markings. Keep teaching scenes inside their intended silhouette. Request transparent_background=true from the built-in image tool and retain alpha in PNG or WebP delivery; never flatten to JPEG. Inspect at 145px over white, yellow #fff2c5, pink #fff0f5 and lavender #f6efff before approval; reject rectangular backdrops and edge halos.'''

# Corrected scene concepts, including the role-specific sides of paired findings.
CONCEPTS = {
 'ja-apple': 'One pink-red apple with a short brown stem and one green leaf; simple natural apple silhouette. No counting symbols.',
 'ja-v-66ccf8dd3399': 'One round toy ball with three broad curved pink, orange and lavender panels; simple circular silhouette.',
 'ja-v-ad7167347a2a': 'One standing person, full body, neutral friendly face, simple short hair, pink shirt and lavender trousers; relaxed arms with hands visible. This is a reusable character, not an identity category cue.',
 'ja-v-b1ff052549ed': 'One human hand held palm-forward with wrist visible; exactly one thumb and four fingers, five digits total. Clearly separate each digit; no sixth projection. Two simple palm creases.',
 'ja-v-baa4dd2c5986': 'One empty round sky-blue dinner plate in a slight overhead view; one simple inner rim. No nested plate or utensils.',
 'ja-cup': 'One handleless transparent drinking tumbler, flat base, slightly tapered straight sides, open elliptical rim, partly filled with visible pale-blue water; no handle, stem, mug or saucer.',
 'ja-v-a47e21265374': 'One adult dairy cow, full body, side view with head turned slightly toward viewer, white body with a few charcoal patches, pink muzzle, four legs and one tail. Adult proportions, no calf.',
 'ja-v-ddd9dca106e2': 'Two clear green-gray mountain peaks, one dominant in front, simple sloping silhouettes. Ordinary non-erupting mountains, no crater, plume or lava.',
 'ja-v-0958f7553d9f': 'Loose dry uncooked ivory rice grains spilling from a small plain open rice bag; the grains dominate. Slim separate elongated kernels, no cooked rice mound, bowl, steam or chopsticks.',
 'ja-v-2f734ba866d9': 'One ordinary smooth irregular rounded gray pebble, asymmetrical natural silhouette, at most one broad flat tone patch. No triangular facets, symmetry, sparkles or jewel setting.',
 'ja-v-afefe30bcb46': 'An erupting volcano with a clearly open summit crater, a smoke plume visibly connected to the crater and a thick orange-red lava flow descending from it. Use the shared mountain silhouette; no detached cloud or lightning bolt.',
 'ja-v-d4fb59f8c32c': 'A finished page of written text with one complete sentence clearly highlighted. No writing hand or dominant pencil. This is a taught sentence/text cue requiring listening context, not an unlabeled picture-only distinction.',
 'ja-v-4b9574b8d3b9': 'A finished multi-paragraph composition on a page, with a learner reviewing the whole written work. No claim that generic lines or pencil angles distinguish composition from sentence. Requires listening context.',
 'ja-v-a76119b3c712': 'A close view of recognizable animal fur with several soft overlapping tufts; a small subdued furry-animal silhouette provides context. Fur fills most of the canvas. No isolated sawtooth crescent or feather-like shape.',
 'ja-v-602940cfc449': 'A small sky-blue side plate clearly separated beside a subdued larger dinner plate; point to the small plate with a contrasting purple arrow. Two non-overlapping plate silhouettes, never concentric.',
 'ja-v-01a3c397cb20': 'Two clearly visible five-digit hands opening a recognizable folded blanket, shown as a compact folded-before and spread-after sequence with one clear purple action arrow. No accordion-like striped rectangle.',
 'ja-v-754e1f2ea742': 'A large foreground calf with juvenile proportions, short legs, round head and small body; an optional faint adult-cow comparison stays small in the background. Calf dominates. Match the shared cow markings and outline.',
 'ja-v-36897e1da4ac': 'One large isolated postage stamp with unmistakable perforated edges and a simple flower motif. Only a small subdued envelope corner may provide context; the stamp dominates. No denomination or answer caption.',
 'ja-v-74043c16db5e': 'An irregular fluffy mound of shaved ice with several clear snow-shaving marks and flowing pink syrup drips, in a simple bowl with spoon. No smooth round ice-cream scoops or polygon topping.',
 'ja-v-8fb11237e460': 'A clear mug of golden beer with white or cream foam, no blue cloud. This is a conventional beer cue; the unpasteurized nuance of nama requires spoken context and cannot be inferred from the mug.',
 'ja-v-41b543dc8fe4': 'One symmetric faceted pink gemstone with a few broad geometric facets and a restrained sparkle cue. Clearly different from the irregular unfaceted gray stone.',
 'ja-v-4789ab8b6db0': 'Exactly five simplified washing machines in a balanced two-row grid, three above and two below, with ample recognizable circular doors and consistent machine size; no tiny single row.',
 'ja-v-760cc08e40eb': 'Exactly ten simplified washing machines in a balanced two-row grid of five, maximizing readable object size with broad circular doors. No extra machines or decorative counts.',
 'ja-v-09d74d630a45': 'A modest town street with connected small shopfronts, sidewalk and a short row of homes; broad architectural silhouettes, minimal detail. Do not encode town by house count alone.',
 'ja-v-92bebda5ac98': 'A small rural settlement with separated cottages, paths and open agricultural fields. Broad silhouettes, few details; do not imply a fixed number of homes defines village.',
 'ja-v-65df49688ef0': 'One Japanese sword with a slim gently curved single-edged blade, clear small guard and proportionate wrapped handle. No broad scimitar blade.',
 'ja-v-b7ea6f7eb013': 'Two recognizable textured ropes of equal length, one thick and one thin; indicate the thick rope. No body-size comparison.',
 'ja-v-7930a252da9b': 'A shared written-character family with a few large clear characters from both Japanese and Latin scripts; this is a taught character cue, not a Japanese-only lexical category.',
 'ja-v-69c61c85a403': 'The same shared written-character family as 字, showing both Japanese and Latin characters. No false script distinction; usage requires sentence context.',
 'ja-v-2f21cb2e8d02': 'A seated viewer watches a dominant full moon. A low tray with a visibly stacked group of white dumplings sits at ground level, separated from the viewer; a small pampas-grass cluster provides autumn context.',
 'ja-v-70230bf6d87c': 'One LEFT hand shown PALM FORWARD, thumb on the viewer’s RIGHT; exactly four fingers plus one thumb, wrist visible and two simple palm creases. Verify by imagining a person facing the viewer.',
 'ja-v-9553e3adbc2a': 'One RIGHT hand shown PALM FORWARD, thumb on the viewer’s LEFT; exactly four fingers plus one thumb, wrist visible and two simple palm creases. Mirror the left-hand silhouette and retain palm creases.',
 'ja-v-cb7d8a487c4f': 'A small picnic beneath a cherry tree with many small blossom clusters and a few clear five-petal cherry flowers. Blossom canopy dominates; no giant circular flowers. Keep picnic details sparse.',
 'ja-v-b5e9e035a8be': 'A pink ball moving INTO an open orange box with a visible dark interior, open flaps and clear front lip. A complete contrasting purple downward arrow crosses the opening; a faint before-position clarifies motion.',
 'ja-v-a001b24baf12': 'The same pink ball moving OUT OF the same open orange box with visible dark interior, open flaps and front lip. A complete contrasting purple upward arrow crosses the opening; a faint before-position clarifies motion.',
 'ja-v-5dc14aea92c7': 'A recognizable beef cut with a large clear cow-provenance inset using the shared cow design. This is an example of meat; contextual listening establishes the beef distinction.',
 'ja-v-b639fedc63ec': 'A varied grouping of uncooked meat cuts, including poultry and another cut, on one plain tray. Avoid a single distinctive beef steak. Category overlaps beef and requires semantic exclusion.',
 'ja-v-3534dd7d07d1': 'Sun descending to a shared low horizon, a clear downward purple motion cue and orange evening sky confined to the scene silhouette; one small house with a lit window. No sunrise/upward cue.',
 'ja-v-0c1b8280f1ee': 'Sun rising above the shared low horizon with a clear upward purple motion cue and pale morning light. Use the same horizon framing as evening, with opposite motion.',
 'ja-v-9a9a5c6d448c': 'A large convenience-store storefront with a broad striped awning, visible glass entry and one clear stocked-shelf window. Storefront dominates; no tiny detached building icon or answer label.',
 'ja-v-6027e0e1c622': 'A large multistory department store with broad display windows and a prominent ground-level shopping entrance with shoppers carrying bags. Shopping context remains readable at quiz size; no answer label.',
 'ja-v-10984ece1206': 'A rural village/home among agricultural fields, hills and a river; the intended sense is rural village or home area, not a universally recognizable personal hometown.',
 'ja-v-97526e11c703': 'The shared full-body character running, leaning forward, bent arms and long strides. Filled pink clothing and lavender trousers, dark-purple outlined limbs; no unoutlined stick limbs.',
 'ja-v-a557e263cea4': 'A Tokyo-style taxi with a clearly empty visible passenger compartment and a red windscreen vacancy display reading exactly 空車. No green roof lamp used as availability signal. The sign is factual in-scene text, not a caption.',
 'ja-v-506e7ed10461': 'An older traditional neighborhood shopping street with close low-rise shops, modest awnings, bicycles and narrow street. Prioritize lived-in working/commercial neighborhood context, not a generic tall downtown skyline.',
 'ja-v-a8c0f98a1f64': 'A mother cat lying beside newly born kittens, with a small subdued prior pregnant-cat state in a simple event sequence. Teach the intended give-birth sense with spoken context; no hen-and-egg production substitution.',
}

GLOSSES = {
 'ja-v-d4fb59f8c32c': 'Sentence / written text',
 'ja-v-b7ea6f7eb013': 'Thick',
 'ja-v-69c61c85a403': 'Written characters',
 'ja-v-10984ece1206': 'Rural village / home area',
 'ja-v-a557e263cea4': 'Vacant taxi',
 'ja-v-506e7ed10461': 'Traditional urban neighborhood',
}

CONTEXT_FINDINGS = {'F02','F04','F05','F06','F07','F08','F09','F10','F19','F24','F26','F28','F29','F34','F35','F39','F42','F43','F44','F45','F46','F47','F48'}

# A review finding may describe both sides of a comparison. Keep the complete
# recommendation in the audit, but send only the intended side to the generator.
ROLE_CONSTRAINTS = {
 ('ja-v-ddd9dca106e2', 'F03'): 'Keep the ordinary mountain silhouette simple and clearly non-erupting. This card depicts a mountain only.',
 ('ja-v-afefe30bcb46', 'F03'): 'Give this volcano a clear crater, a connected eruption plume and readable lava flow; preserve the shared mountain palette and line style.',
 ('ja-v-2f734ba866d9', 'F20'): 'Show an ordinary irregular gray stone with sparse natural mineral texture, a few short cracks and broad natural planes. Keep it distinct from a symmetric faceted jewel.',
 ('ja-v-41b543dc8fe4', 'F20'): 'Show a symmetric faceted jewel; retain distinct geometric facets and a restrained sparkle cue.',
 ('ja-v-3534dd7d07d1', 'F37'): 'Use a clear descending-sun cue and evening lighting with the shared horizon convention.',
 ('ja-v-0c1b8280f1ee', 'F37'): 'Use an ascending-sun cue and morning light with the shared horizon convention.',
}

# Reusable subjects are mapped from the corrected concepts, never inferred from IDs.
# None means a shared prompt convention, with a future support reference still needed.
# Seed cards depend only on style, keeping component -> card dependencies acyclic.
COMPONENTS = {
 'apple': ('ja-apple', r'\bapple'),
 'ball': ('ja-v-66ccf8dd3399', r'\bball\b|\bballs\b'),
 'person': ('ja-v-ad7167347a2a', r'\bperson\b|\bpeople\b|\bchild\b|\bchildren\b|\badult\b|\bstudent\b|\blearner\b|\bworker\b|\btraveler\b|\bsibling\b|\bfather\b|\bmother\b|\bbrother\b|\bspeaker\b|\blistener\b|\bviewer\b|\bshopper\b|\bdelegate\b|\brunner\b|\bfriends?\b|\bboy\b|\bgirl\b|\bwoman\b|\bman\b'),
 'hand': ('ja-v-b1ff052549ed', r'\bhand\b|\bhands\b|\bpalm\b'),
 'plate': ('ja-v-baa4dd2c5986', r'\bplate\b|\bplates\b'),
 'glass': ('ja-cup', r'\btumbler\b|\bglass\b|\bcups?\b'),
 'cow': ('ja-v-a47e21265374', r'\bcow\b|\bcalf\b|\bbeef\b'),
 'mountain': ('ja-v-ddd9dca106e2', r'\bmountain|\bvolcano|\bfuji\b|\bvalley\b'),
 'rice': ('ja-v-0958f7553d9f', r'\brice\b|\bpaddy\b'),
 'stone': ('ja-v-2f734ba866d9', r'\bstone\b|\bpebble\b|\bboulder\b'),
 'calendar': (None, r'\bcalendar|\btimeline\b|\bmonthly\b'),
 'arrow': (None, r'\barrow\b|\barrows\b|\bmotion cue\b'),
 'open-box': (None, r'\bopen (orange )?box\b'),
 'doorway': (None, r'\bdoor\b|\bdoorway\b|\bexit\b|\bentrance\b'),
 'house': (None, r'\bhouse\b|\bhouses\b|\bhome\b|\bcottage'),
 'shop': (None, r'\bshop\b|\bshops\b|\bstore\b|\bshopfront|\bstorefront'),
 'office-school': (None, r'\boffice\b|\bschool\b|\buniversity\b'),
 'sun-moon-horizon': (None, r'\bsun\b|\bmoon\b|\bhorizon\b'),
 'tree-plant': (None, r'\btree\b|\btrees\b|\bplant\b|\bsapling\b|\bleaf\b|\bleaves\b|\bseedling\b|\bflower\b|\bblossom'),
 'paper-book-pencil': (None, r'\bpaper\b|\bbook\b|\bpage\b|\bsentence\b|\bcomposition\b|\bpencil\b|\bcharacter\b|\bnotebook\b'),
 'bowl': (None, r'\bbowl\b|\bbowls\b'),
 'car-taxi': (None, r'\bcar\b|\btaxi\b|\bvehicle\b'),
 'washer': (None, r'\bwashing machine'),
 'numeral': (None, r'\bnumeral\b|\bquantity\b|\bnumeric\b|\bage range\b'),
 'flag': (None, r'\bflag\b|\bflags\b|\btricolor\b'),
 'cat': (None, r'\bcat\b|\bkitten'),
 'yarn-thread-rope': (None, r'\byarn\b|\bthread\b|\brope\b|\bropes\b'),
 'gem': (None, r'\bgemstone\b|\bjewel|\btreasure\b'),
 'fabric': (None, r'\bblanket\b|\bcloth\b'),
 'character-relationship': (None, r'\bfamily\b|\bsibling\b|\bfather\b|\bmother\b|\bbrother\b|\bking\b|\bqueen\b|\bprince'),
 'diagram-convention': (None, r'\bdiagram\b|\bequality\b|\bsequence\b|\bbracket\b'),
}

BATCH_ONE = [COMPONENTS[k][0] for k in ['apple','ball','person','hand','plate','glass','cow','mountain','rice','stone']]

# Explicit scene dependencies take priority over language matching. Negative
# constraints must not cause an absent subject to become a reusable component.
COMPONENT_OVERRIDES = {
 'ja-apple': ['apple','tree-plant'],
 'ja-v-66ccf8dd3399': ['ball'],
 'ja-v-ad7167347a2a': ['person'],
 'ja-v-b1ff052549ed': ['hand'],
 'ja-v-baa4dd2c5986': ['plate'],
 'ja-cup': ['glass'],
 'ja-v-a47e21265374': ['cow'],
 'ja-v-ddd9dca106e2': ['mountain'],
 'ja-v-0958f7553d9f': ['rice'],
 'ja-v-2f734ba866d9': ['stone'],
 'ja-v-afefe30bcb46': ['mountain'],
 'ja-v-d4fb59f8c32c': ['paper-book-pencil'],
 'ja-v-4b9574b8d3b9': ['paper-book-pencil','person'],
 'ja-v-a76119b3c712': [],
 'ja-v-602940cfc449': ['plate','arrow'],
 'ja-v-01a3c397cb20': ['hand','fabric','arrow'],
 'ja-v-754e1f2ea742': ['cow'],
 'ja-v-36897e1da4ac': ['tree-plant','paper-book-pencil'],
 'ja-v-74043c16db5e': ['bowl'],
 'ja-v-8fb11237e460': ['glass'],
 'ja-v-41b543dc8fe4': ['gem'],
 'ja-v-4789ab8b6db0': ['washer'],
 'ja-v-760cc08e40eb': ['washer'],
 'ja-v-09d74d630a45': ['shop','house'],
 'ja-v-92bebda5ac98': ['house'],
 'ja-v-65df49688ef0': [],
 'ja-v-b7ea6f7eb013': ['yarn-thread-rope'],
 'ja-v-7930a252da9b': ['paper-book-pencil'],
 'ja-v-69c61c85a403': ['paper-book-pencil'],
 'ja-v-2f21cb2e8d02': ['person','sun-moon-horizon','tree-plant'],
 'ja-v-70230bf6d87c': ['hand'],
 'ja-v-9553e3adbc2a': ['hand'],
 'ja-v-cb7d8a487c4f': ['person','tree-plant','fabric'],
 'ja-v-b5e9e035a8be': ['ball','open-box','arrow'],
 'ja-v-a001b24baf12': ['ball','open-box','arrow'],
 'ja-v-5dc14aea92c7': ['cow'],
 'ja-v-b639fedc63ec': [],
 'ja-v-3534dd7d07d1': ['sun-moon-horizon','arrow','house'],
 'ja-v-0c1b8280f1ee': ['sun-moon-horizon','arrow'],
 'ja-v-9a9a5c6d448c': ['shop','doorway'],
 'ja-v-6027e0e1c622': ['shop','person'],
 'ja-v-10984ece1206': ['house'],
 'ja-v-97526e11c703': ['person'],
 'ja-v-a557e263cea4': ['car-taxi'],
 'ja-v-506e7ed10461': ['shop'],
 'ja-v-a8c0f98a1f64': ['cat','diagram-convention'],
}


def components_for(item):
    if item['id'] in COMPONENT_OVERRIDES:
        return COMPONENT_OVERRIDES[item['id']]
    # Original concepts are positive scene descriptions. Appended instruction
    # prose (family, character, no stone, etc.) must not affect dependency edges.
    positive = item['originalConcept']
    result = [name for name, (_, pattern) in COMPONENTS.items() if re.search(pattern, positive, re.I)]
    if re.search(r'\bteacher\b|\bvillager\b|\bvisitor\b|\bdriver\b|\barcher\b|\bcraftsperson\b|\bseated\b|\bpicnic\b|\bking\b|\bqueen\b|\bprince\b|\bprincess\b', positive, re.I):
        result.append('person')
    if re.search(r'\bweekdays\b|\byear round\b', item['meaning'], re.I):
        result.append('calendar')
    if 'family' in positive.lower() and 'shape family' in positive.lower():
        result = [name for name in result if name != 'character-relationship']
    return sorted(set(result))


def resolve_batch_statuses(batches, manifest_directory):
    """Keep completed reviews durable and unlock only the next authorized batch."""
    for index, batch in enumerate(batches):
        manifest_path = manifest_directory / batch['id'] / 'manifest.json'
        if manifest_path.exists():
            batch['status'] = json.loads(manifest_path.read_text())['status']
        elif index == 0 or batches[index - 1]['status'] == 'approved':
            batch['status'] = 'ready-to-generate'
        else:
            batch['status'] = 'blocked-on-previous-feedback'


def prepare():
    source = json.loads((OUT / 'source-prompts.json').read_text())
    review = json.loads((ROOT / 'artifacts/card-review/review-data.json').read_text())
    findings = review['findings']
    feedback_path = OUT / 'user-feedback.json'
    feedback = json.loads(feedback_path.read_text()) if feedback_path.exists() else {}
    style_path = OUT / 'style-overrides.json'
    styles = json.loads(style_path.read_text()) if style_path.exists() else {'profiles': {}, 'cardProfiles': {}}
    artwork = {}
    for manifest_path in sorted((ROOT / 'artifacts/card-regeneration').glob('batch-*/manifest.json')):
        for asset in json.loads(manifest_path.read_text())['assets']:
            artwork[asset['id']] = asset
    by_id = defaultdict(list)
    for finding in findings:
        for item_id in finding['ids']:
            by_id[item_id].append(finding)

    cards = []
    for original in source['records']:
        item = dict(original)
        item_id = item['id']
        fs = by_id[item_id]
        item['originalConcept'] = item['concept']
        item['concept'] = CONCEPTS.get(item_id, item['concept'])
        item['originalMeaning'] = item['meaning']
        item['meaning'] = GLOSSES.get(item_id, item['meaning'])
        refs = {f['reference'] for f in fs}
        # Shared convention fixes; quantities must never include decorative beads.
        if 'F23' in refs:
            numeral = re.search(r'quantity (\d+)', item['originalConcept']).group(1)
            item['concept'] = f'The single large correct numeral {numeral}, centered on a plain white background. No decorative beads, extra numerals or quantity dots.'
        if ('F07' in refs or 'F28' in refs or 'F43' in refs or
                re.search(r'calendar|timeline', item['originalConcept'], re.I) or
                item['meaning'] in {'Weekdays','Year Round'}):
            item['concept'] = f"A shared taught calendar/timeline illustration for {item['meaning']}. Use a visible current-time anchor, clear day/month/year units, a full-month grid for a specific date, a clear span for duration, repeated marks for recurrence. Keep each unit distinct. Original intended scene: {item['originalConcept']}"
        if 'F24' in refs:
            item['concept'] += ' Give person and flag equal emphasis; use accurate national flag colors/patterns, never substitute the decorative palette. US: red/white stripes, blue canton with white stars; UK: correctly layered red/white crosses on blue; France: blue-white-red vertical bands. Nationality requires a self-introduction/audio context.'
        if 'F06' in refs or 'F09' in refs or 'F44' in refs:
            item['concept'] += ' Establish named characters and the intended identity, relationship or speaker/listener roles in spoken context. Do not infer race, gender, kinship or royal status from skin, shirt color, hair or relative height. This is a contextual support illustration.'
        if 'F45' in refs:
            item['concept'] += ' Use a short event sequence and spoken scenario to establish the organizational status; entering a building alone is not enrollment or joining a company.'
        item['concept'] = feedback.get('conceptOverrides', {}).get(item_id, item['concept'])
        # Remove obsolete colors where the ordinary recurring ball is now a
        # basketball. Named objects (baseball, yarn, beads) keep their own scene.
        if item_id != 'ja-v-66ccf8dd3399' and 'ball' in components_for(item):
            item['concept'] = re.sub(r'\b(?:pink|orange|purple|bright) ball\b', 'orange basketball', item['concept'], flags=re.I)
        item['reviewFindings'] = [{'reference': f['reference'], 'priority': f['priority'], 'recommendation': f['recommendation']} for f in fs]
        item['generationConstraints'] = [{'reference': f['reference'], 'instruction': ROLE_CONSTRAINTS.get((item_id, f['reference']), f['recommendation'])} for f in fs]
        item['requiresContext'] = bool(refs & CONTEXT_FINDINGS)
        item['reviewRequired'] = original['reviewRequired'] or bool(fs)
        item['practiceStatus'] = 'staged-for-review'
        item['pictureOnlyEligible'] = not (original['reviewRequired'] or item['requiresContext'])
        item['eligibilityNote'] = 'Provisional only; no generated image enters practice before visual/user review. Existing restrictions remain.'
        # Explicit feedback describes the current scene when it replaces the original.
        item['components'] = feedback.get('componentOverrides', {}).get(item_id, components_for(item))
        for family in feedback.get('designFamilies', {}).values():
            if item_id in family['memberIds'] and 'replaceComponents' in family:
                item['components'] = family['replaceComponents']
            if item_id in family['memberIds']:
                item['components'] = list(dict.fromkeys(
                    [name for name in item['components'] if name not in family.get('removeComponents', [])]
                    + family.get('addComponents', [])))
        item['artworkStatus'] = artwork.get(item_id, {}).get('status', 'not-generated')
        if item_id in feedback.get('acceptedWithKnownIssues', {}):
            item['outstandingFeedback'] = feedback['acceptedWithKnownIssues'][item_id]
        item['componentGuidance'] = {name: guidance for name, guidance in feedback.get('componentGuidance', {}).items() if name in item['components']}
        profile_id = styles['cardProfiles'].get(item_id)
        style_specification = styles['profiles'][profile_id]['specification'] if profile_id else STYLE
        if profile_id:
            item['styleNode'] = 'style:' + profile_id
        item['prompt'] = style_specification + '\nPrimary request: ' + item['concept']
        if item.get('teachingNote'):
            item['prompt'] += '\nExisting teaching restriction: ' + item['teachingNote']
        if fs:
            item['prompt'] += '\nReview constraints:\n' + '\n'.join(f"- {f['reference']}: {f['instruction']}" for f in item['generationConstraints'])
        if item_id in CONCEPTS:
            item['prompt'] += '\nRole-specific scene above takes priority over a grouped review recommendation that also describes another card.'
        if item['requiresContext']:
            item['prompt'] += '\nLearning limitation: supporting contextual illustration; do not try to encode an abstract or grammatical distinction with arbitrary colors or tiny badges.'
        if item['componentGuidance']:
            item['prompt'] += '\nUser feedback for shared designs (takes priority over obsolete appearance descriptions; retain the intended subject and action):\n' + '\n'.join(item['componentGuidance'].values())
        for family in feedback.get('designFamilies', {}).values():
            if item_id in family['memberIds']:
                item['prompt'] += '\nShared design convention: ' + family['guidance']
        item['prompt'] += '\n' + BACKGROUND_POLICY
        cards.append(item)

    # Separate undirected answer collisions from the directed generation graph.
    groups = []
    def group(name, ids, reason):
        if len(ids) > 1:
            groups.append({'id': name, 'cardIds': sorted(set(ids)), 'rule': 'never-compete', 'reason': reason})
    visual_groups = defaultdict(list)
    for card in cards:
        visual_groups[card['visualGroup']].append(card['id'])
    for name, ids in visual_groups.items():
        group('source-' + name, ids, 'Existing shared visual group; usage/reading cannot be distinguished by this picture.')
    # Grouped findings contain unrelated pairs: select actual overlapping concepts.
    for name, ids in {
        'apple-and-counts': ['ja-apple','ja-v-277587e6fa07','ja-v-bb85f028d944','ja-v-8b887bc8af0c','ja-v-084edf1fdd10','ja-v-df70a01acaec','ja-v-f6bc974a7405','ja-v-6c9351ae67e6','ja-v-0d0163a40587'],
        'meat-and-beef': ['ja-v-5dc14aea92c7','ja-v-b639fedc63ec'],
        'sentence-composition-writing': ['ja-v-d4fb59f8c32c','ja-v-4b9574b8d3b9'],
        'plate-and-small-plate': ['ja-v-baa4dd2c5986','ja-v-602940cfc449'],
        'entrance-and-entering': ['ja-v-20cbd1c15a35','ja-v-82a114897d9c'],
        'exit-and-leaving': ['ja-v-a19157e62dee','ja-v-b2a9df4d0301','ja-v-001a4faf05bd'],
        'eye-and-eyeball': ['ja-v-6c0b9f3278dc','ja-v-a8ca5ef684b8'],
        'people-and-person': ['ja-v-ad7167347a2a','ja-v-4fa716f651b2','ja-v-2a318f5ee1c8','ja-v-3bcce8de9d04','ja-v-7de8b40e4f57','ja-v-08f79cb14fd4','ja-v-a5dbfebd3fae'],
        'paddy-synonyms': ['ja-v-762983bc3fe7','ja-v-0da81020c173'],
        'circle-and-round': ['ja-v-d1b6831b65c8','ja-v-b1514b201acd'],
        'written-characters': ['ja-v-7930a252da9b','ja-v-69c61c85a403'],
        'rural-settlements': ['ja-v-10984ece1206','ja-v-92bebda5ac98','ja-v-09d74d630a45'],
        'cow-and-calf': ['ja-v-a47e21265374','ja-v-754e1f2ea742'],
        'mountain-and-fuji-volcano': ['ja-v-ddd9dca106e2','ja-v-0181fab128a1','ja-v-afefe30bcb46'],
    }.items():
        if name in {'apple-and-counts', 'people-and-person'}:
            for other in ids[1:]:
                group(name + '-' + other, [ids[0], other], 'The category matches every depicted instance; counts can still compete within a taught counting exercise.')
        else:
            group(name, ids, 'Category/instance, synonym or otherwise overlapping referents; image-path differences do not disambiguate.')
    write('semantic-exclusions.json', {'issue': 72, 'groups': groups, 'note': 'Staged policy metadata. Integrate with the app choice filter separately before activating regenerated cards.'})

    nodes = [{'id': 'style', 'kind': 'style', 'status': 'proposed', 'specification': STYLE}]
    for profile_id, profile in styles['profiles'].items():
        nodes.append({'id': 'style:' + profile_id, 'kind': 'style', 'status': profile['status'], 'specification': profile['specification'], 'referencePath': profile['referencePath']})
    edges = []
    for name, (seed, pattern) in COMPONENTS.items():
        asset = artwork.get(seed, {})
        nodes.append({'id': 'component:' + name, 'kind': 'component', 'seedCard': seed, 'status': asset.get('status', 'pending-reference') if seed else 'prompt-convention', 'detectionPattern': pattern,
                      **({'referencePath': asset['path']} if asset else {}),
                      **({'outstandingFeedback': asset['followUp']} if asset.get('acceptedWithKnownIssue') else {}),
                      **({'referenceGuidance': feedback['componentGuidance'][name]} if name in feedback.get('componentGuidance', {}) else {})})
        edges.append({'from': 'card:' + seed if seed else 'style', 'to': 'component:' + name})
    for card in cards:
        node = 'card:' + card['id']
        nodes.append({'id': node, 'kind': 'card', 'label': card['meaning']})
        # Foundation seeds establish components from the common style. Consumers
        # reuse their references; a seed never depends on its own component.
        style_node = card.get('styleNode', 'style')
        parents = [style_node] if card['id'] in BATCH_ONE else [style_node] + ['component:' + name for name in card['components']]
        for family_name, family in feedback.get('designFamilies', {}).items():
            if card['id'] in family['memberIds'] and card['id'] != family['seedCard']:
                parents.append('family:' + family_name)
        card['dependsOn'] = parents
        for parent in parents:
            edges.append({'from': parent, 'to': node})
    for family_name, family in feedback.get('designFamilies', {}).items():
        nodes.append({'id': 'family:' + family_name, 'kind': 'family', **family})
        origin = 'card:' + family['seedCard'] if family.get('seedCard') else family.get('styleNode', 'style')
        edges.append({'from': origin, 'to': 'family:' + family_name})
    graph = {'issue': 72, 'edgeMeaning': 'from must be specified/generated before to; only approved artwork may become a downstream reference', 'nodes': nodes, 'edges': edges, 'referencePolicy': 'Generate batch 01 from scratch. Use first apple only as a style reference for the other foundations. After user feedback, approved component seed images become object/character references. Unseeded components are prompt conventions until a dedicated support reference is approved. Always label reference roles; never copy a reference subject into an unrelated scene.'}
    write('graph.json', graph)
    # Deterministic order prefers simple scenes and families whose seeds are ready.
    remaining = [c for c in cards if c['id'] not in BATCH_ONE]
    batch_size = feedback.get('generationBatchSize', 10)
    assert isinstance(batch_size, int) and 1 <= batch_size <= 25
    remaining.sort(key=lambda c: (c['requiresContext'] or c['reviewRequired'], len(c['components']), c['components'], c['id']))
    batches = [{'id': 'batch-01', 'status': 'ready-to-generate', 'cardIds': BATCH_ONE, 'purpose': 'Reusable foundations and visual-direction feedback'}]
    manifest_path = ROOT / 'artifacts/card-regeneration/batch-01/manifest.json'
    if manifest_path.exists():
        batches[0]['status'] = json.loads(manifest_path.read_text())['status']
    for start in range(0, len(remaining), batch_size):
        batches.append({'id': f'batch-{len(batches)+1:02}', 'status': 'blocked-on-previous-feedback', 'cardIds': [c['id'] for c in remaining[start:start+batch_size]], 'purpose': 'Provisional order; recompute references and apply feedback before generation'})
    # Reviewed/generated batches retain their membership as family dependencies evolve.
    staged = []
    for manifest in sorted((ROOT / 'artifacts/card-regeneration').glob('batch-*/manifest.json')):
        data = json.loads(manifest.read_text())
        staged.append({'id': data['batch'], 'status': data['status'],
                       'cardIds': [a['id'] for a in data['assets']], 'purpose': 'Generated batch; membership preserved'})
    if staged:
        staged_ids = {i for batch in staged for i in batch['cardIds']}
        pending = [c['id'] for c in remaining if c['id'] not in staged_ids]
        batches = staged
        # Owner-requested themed groups can exceed the usual batch size without
        # changing reviewed membership or duplicating cards in later batches.
        for request in feedback.get('requestedBatches', []):
            if any(batch['id'] == request['id'] for batch in batches):
                continue
            assert request['id'] == f'batch-{len(batches)+1:02}', 'Requested batch is out of sequence'
            requested_ids = request['cardIds']
            assert len(requested_ids) == len(set(requested_ids)), 'Duplicate requested card'
            assert set(requested_ids) <= set(pending), 'Requested card is unavailable or already batched'
            assert 1 <= len(requested_ids) <= request['maxCards']
            batches.append({'id': request['id'], 'status': 'blocked-on-previous-feedback',
                            'cardIds': requested_ids, 'purpose': request['purpose']})
            pending = [item_id for item_id in pending if item_id not in set(requested_ids)]
        for start in range(0, len(pending), batch_size):
            batches.append({'id': f'batch-{len(batches)+1:02}', 'status': 'blocked-on-previous-feedback',
                            'cardIds': pending[start:start+batch_size], 'purpose': 'Provisional order; apply feedback before generation'})
    resolve_batch_statuses(batches, ROOT / 'artifacts/card-regeneration')
    write('prompts.json', {'schemaVersion': 1, 'issue': 72, 'style': STYLE, 'cards': cards})
    write('batches.json', {'batchSize': batch_size, 'gate': 'Generate one batch; inspect; collect user feedback; revise prompts, component references and affected artwork; only then unlock the next batch.', 'batches': batches})
    lines = ['# Card prompt changes', '', 'Tracked in [issue #72](https://github.com/ajhconway/kikimashta/issues/72). This document records the original review findings and prompt changes. Approved artwork activation is tracked separately in `activation.json`; unapproved drafts remain staged. These prompt changes do not grant practice eligibility or resolve the semantic policies deferred to #79.', '', 'The source concepts are preserved in `source-prompts.json`. `prompts.json` contains the complete revised generation prompts and provisional gloss clarifications. Existing review flags and notes remain. Appearance fixes do not resolve semantic ambiguity.', '']
    lookup = {c['id']: c for c in cards}
    for f in findings:
        labels = ', '.join(f"{lookup[i]['japanese']} ({i})" for i in f['ids'])
        lines.extend([f"## {f['reference']}", '', labels, '', f['recommendation'], '', 'Handling: ' + ('context required; semantic exclusions where applicable; ' if f['reference'] in CONTEXT_FINDINGS else '') + 'included in each affected generation prompt; retain review until verified.', ''])
    (OUT / 'review-changes.md').write_text('\n'.join(lines))
    return cards, graph, batches


if __name__ == '__main__':
    cards, graph, batches = prepare()
    print(f'Prepared {len(cards)} prompts, {len(graph["nodes"])} graph nodes, {len(batches)} feedback-gated batches.')
