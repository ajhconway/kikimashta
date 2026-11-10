"""Regression checks for owner choices and active artwork comparisons (#233)."""

import base64
import copy
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest


SPEC = importlib.util.spec_from_file_location('scene_233_review', Path(__file__).with_name('build-scene-233-review.py'))
REVIEW = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(REVIEW)

# Five real one-pixel RGBA PNGs keep file/hash checks independent of art generation.
PNG_FIXTURES = [
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGM4oRHwHwAFPAJA8rL+IgAAAABJRU5ErkJggg==',
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPQmOb2HwAD8gIEDYCMWAAAAABJRU5ErkJggg==',
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGPQCNj3HwAEEAI2DkPpagAAAABJRU5ErkJggg==',
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGO4s0XjPwAG4AK4Mzf6GQAAAABJRU5ErkJggg==',
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOosFnwHwAE2AJUflcyxQAAAABJRU5ErkJggg==',
]


class SceneReviewTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name).resolve()
        self.folder = self.root / 'artifacts/scene-art-233'
        self.folder.mkdir(parents=True)
        self.images = []
        for index, encoded in enumerate(PNG_FIXTURES):
            data = base64.b64decode(encoded)
            path = self.folder / f'fixture-{index}.png'
            path.write_bytes(data)
            self.images.append({'path': path.relative_to(self.root).as_posix(),
                                'sha256': hashlib.sha256(data).hexdigest()})

    def version(self, number, image_index, **metadata):
        return {'version': number, **self.images[image_index], **metadata}

    def comparison(self, selected_version=2):
        current = self.version(selected_version, 0, status='generated-pending-owner-review')
        asset = {'id': 'ja-test-comparison', 'selectedVersion': selected_version,
                 **self.images[0], 'versions': [current], 'alternativeVersions': [3, 4, 5]}
        for number, label, image in zip(asset['alternativeVersions'], 'ABC', [1, 2, 3]):
            asset['versions'].append(self.version(number, image, ownerFeedbackRound=2, candidateLabel=label,
                                                  conceptLabel=f'Concept {label}', status='candidate-pending-owner-review'))
        return asset

    def choice(self):
        return {'id': 'ja-test-choice', 'status': 'owner-selected', 'selectedVersion': 2, **self.images[0],
                'versions': [self.version(1, 4, status='generated-pending-owner-review'),
                             self.version(2, 0, status='owner-selected')],
                'ownerChoice': {'round': 2, 'date': '2026-11-09', 'ownerStatement': 'I choose this image.',
                                'version': 2, **self.images[0], 'status': 'owner-selected'}}

    def night(self, approved=False):
        candidate = {'id': 'ja-v-ba0c8a160c33', 'text': '夜', 'reading': 'よる', 'meaning': 'Night',
                     'family': 'time-of-day', 'version': 1, 'prompt': 'Night in the matching landscape.',
                     'status': 'candidate-pending-owner-review', **self.images[0],
                     'currentApprovedPath': self.images[1]['path'], 'currentApprovedSha256': self.images[1]['sha256']}
        if approved:
            candidate.update(status='approved', selectedVersion=1,
                             versions=[self.version(1, 0, status='approved')],
                             approval={'scope': 'artwork only', 'date': '2026-11-09',
                                       'ownerStatement': "Great, let's ship these. Auto-merge.",
                                       'selectedVersion': 1, 'sha256': self.images[0]['sha256']})
        return candidate

    def related_night(self, candidate):
        return REVIEW.related_candidates({'relatedFamilyCandidates': [candidate]}, self.root, self.folder, set())

    def test_related_night_accepts_pending_and_exact_approved_artwork(self):
        for approved in [False, True]:
            with self.subTest(approved=approved):
                candidate = self.night(approved)
                before = copy.deepcopy(candidate)
                related = self.related_night(candidate)
                self.assertEqual(len(related), 1)
                self.assertEqual(related[0][1], self.root / candidate['path'])
                self.assertEqual(related[0][2], self.root / candidate['currentApprovedPath'])
                self.assertEqual(candidate, before)

    def test_related_night_rejects_missing_stale_or_duplicate_approval_bindings(self):
        cases = [
            ('missing approval', lambda a: a.pop('approval')),
            ('wrong scope', lambda a: a['approval'].update(scope='generation only')),
            ('missing statement', lambda a: a['approval'].pop('ownerStatement')),
            ('empty date', lambda a: a['approval'].update(date=' ')),
            ('stale approval hash', lambda a: a['approval'].update(sha256='0' * 64)),
            ('stale approval version', lambda a: a['approval'].update(selectedVersion=2)),
            ('boolean selected version', lambda a: a.update(selectedVersion=True)),
            ('missing selected record', lambda a: a['versions'].clear()),
            ('duplicate selected record', lambda a: a['versions'].append(copy.deepcopy(a['versions'][0]))),
            ('conflicting duplicate version', lambda a: a['versions'].append(self.version(1, 2))),
            ('stale selected record', lambda a: a['versions'][0].update(sha256='0' * 64)),
            ('different family version', lambda a: a.update(version=2)),
            ('unsafe selected path', lambda a: a.update(path='../escape.png')),
            ('unsafe reference path', lambda a: a.update(currentApprovedPath='../escape.png')),
            ('stale reference hash', lambda a: a.update(currentApprovedSha256='0' * 64)),
        ]
        for label, mutate in cases:
            with self.subTest(label=label):
                candidate = self.night(approved=True)
                mutate(candidate)
                with self.assertRaises(ValueError):
                    self.related_night(candidate)

    def test_related_night_rejects_changed_approved_file(self):
        candidate = self.night(approved=True)
        (self.root / candidate['path']).write_bytes((self.root / self.images[2]['path']).read_bytes())
        with self.assertRaises(ValueError):
            self.related_night(candidate)

    def test_round_two_can_compare_against_version_two(self):
        asset = self.comparison()
        before = copy.deepcopy(asset)
        choices = REVIEW.alternatives_for(asset, self.root, self.folder)
        self.assertEqual([record['version'] for record, _ in choices], [3, 4, 5])
        self.assertEqual([record['candidateLabel'] for record, _ in choices], list('ABC'))
        self.assertTrue(all(path.is_file() for _, path in choices))
        self.assertEqual(asset, before)

    def test_active_options_do_not_include_earlier_alternative_history(self):
        asset = self.comparison(selected_version=1)
        asset['alternativeVersions'] = [5, 6, 7]
        asset['versions'] = [self.version(1, 0)]
        for number, label in zip([2, 3, 4], 'ABC'):
            asset['versions'].append(self.version(number, 4, ownerFeedbackRound=1, candidateLabel=label,
                                                  conceptLabel=f'Old {label}', status='candidate-pending-owner-review'))
        for number, label, image in zip([5, 6, 7], 'ABC', [1, 2, 3]):
            asset['versions'].append(self.version(number, image, ownerFeedbackRound=2, candidateLabel=label,
                                                  conceptLabel=f'New {label}', status='candidate-pending-owner-review'))
        choices = REVIEW.alternatives_for(asset, self.root, self.folder)
        self.assertEqual([record['version'] for record, _ in choices], [5, 6, 7])
        self.assertEqual(len(asset['versions']), 7)
        asset.pop('alternativeVersions')
        self.assertEqual(REVIEW.alternatives_for(asset, self.root, self.folder), [])
        self.assertEqual(len(asset['versions']), 7)

    def test_invalid_comparison_bindings_are_rejected(self):
        def duplicate_image(asset):
            asset['versions'][2].update({key: asset['versions'][1][key] for key in ['path', 'sha256']})

        cases = [
            ('missing alternative', lambda a: a['alternativeVersions'].pop()),
            ('missing version', lambda a: a['versions'].pop()),
            ('duplicate version', lambda a: a['versions'].append(copy.deepcopy(a['versions'][-1]))),
            ('duplicate option', lambda a: a.update(alternativeVersions=[3, 3, 5])),
            ('comparison is an option', lambda a: a.update(alternativeVersions=[2, 3, 4])),
            ('boolean comparison version', lambda a: a.update(selectedVersion=True)),
            ('missing comparison record', lambda a: a['versions'].pop(0)),
            ('stale comparison hash', lambda a: a['versions'][0].update(sha256='0' * 64)),
            ('stale candidate hash', lambda a: a['versions'][1].update(sha256='0' * 64)),
            ('missing candidate file', lambda a: a['versions'][1].update(path='artifacts/scene-art-233/missing.png')),
            ('unsafe candidate path', lambda a: a['versions'][1].update(path='../escape.png')),
            ('unreviewable candidate', lambda a: a['versions'][1].update(status='owner-selected')),
            ('missing round', lambda a: a['versions'][1].pop('ownerFeedbackRound')),
            ('mixed rounds', lambda a: a['versions'][1].update(ownerFeedbackRound=1)),
            ('duplicate label', lambda a: a['versions'][2].update(candidateLabel='A')),
            ('missing concept', lambda a: a['versions'][1].pop('conceptLabel')),
            ('duplicate image', duplicate_image),
        ]
        for label, mutate in cases:
            with self.subTest(label=label):
                asset = self.comparison()
                mutate(asset)
                with self.assertRaises(ValueError):
                    REVIEW.alternatives_for(asset, self.root, self.folder)

    def test_owner_choice_accepts_only_its_exact_selected_image(self):
        asset = self.choice()
        self.assertTrue(REVIEW.owner_selected(asset, self.root / asset['path']))
        self.assertEqual(asset['selectedVersion'], 2)
        self.assertEqual(len(asset['versions']), 2)

    def test_owner_choice_rejects_changed_file_even_when_metadata_agrees(self):
        asset = self.choice()
        selected = self.root / asset['path']
        selected.write_bytes((self.root / self.images[1]['path']).read_bytes())
        with self.assertRaises(ValueError):
            REVIEW.owner_selected(asset, selected)

    def test_older_accepted_version_does_not_accept_a_new_pending_derivative(self):
        asset = self.choice()
        asset.pop('ownerChoice')
        pending = self.version(5, 1, status='generated-pending-owner-review')
        asset['versions'].append(pending)
        asset.update(selectedVersion=5, status='generated-pending-owner-review',
                     path=pending['path'], sha256=pending['sha256'])
        self.assertFalse(REVIEW.owner_selected(asset, self.root / asset['path']))

    def test_missing_stale_or_duplicate_owner_choice_bindings_are_rejected(self):
        cases = [
            ('missing choice', lambda a: a.pop('ownerChoice')),
            ('stale hash', lambda a: a['ownerChoice'].update(sha256='0' * 64)),
            ('stale path', lambda a: a['ownerChoice'].update(path=self.images[1]['path'])),
            ('stale version', lambda a: a['ownerChoice'].update(version=1)),
            ('boolean version', lambda a: a['ownerChoice'].update(version=True)),
            ('missing statement', lambda a: a['ownerChoice'].pop('ownerStatement')),
            ('empty date', lambda a: a['ownerChoice'].update(date=' ')),
            ('invalid round', lambda a: a['ownerChoice'].update(round=0)),
            ('wrong choice status', lambda a: a['ownerChoice'].update(status='pending')),
            ('wrong asset status', lambda a: a.update(status='generated-pending-owner-review')),
            ('missing selected record', lambda a: a['versions'].pop()),
            ('duplicate selected record', lambda a: a['versions'].append(copy.deepcopy(a['versions'][-1]))),
            ('stale record path', lambda a: a['versions'][-1].update(path=self.images[1]['path'])),
            ('stale record hash', lambda a: a['versions'][-1].update(sha256='0' * 64)),
            ('unaccepted selected record', lambda a: a['versions'][-1].update(status='candidate-pending-owner-review')),
        ]
        for label, mutate in cases:
            with self.subTest(label=label):
                asset = self.choice()
                mutate(asset)
                with self.assertRaises(ValueError):
                    REVIEW.owner_selected(asset, self.root / asset['path'])


if __name__ == '__main__':
    unittest.main()
