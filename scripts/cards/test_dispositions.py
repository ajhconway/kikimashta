"""Owner deferrals/removals preserve archives without reopening practice (#72)."""
import base64
import copy
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from prepare import apply_review_disposition, validate_feedback_dispositions, resolve_batch_statuses
from render_review import asset_status_label, disposition_summary, is_pending_revision, render_batch
from validate import validate_card_disposition


class DispositionTests(unittest.TestCase):
    def card(self, item_id='card'):
        return {'id': item_id, 'originalConcept': 'Archived source scene',
                'concept': 'Current scene', 'requiresContext': True, 'reviewRequired': True,
                'reviewFindings': [{'reference': 'F48'}],
                'generationConstraints': [{'reference': 'F48', 'instruction': 'Teach with context'}],
                'practiceStatus': 'staged-for-review', 'pictureOnlyEligible': False,
                'artworkStatus': 'not-generated'}

    def test_removed_and_deferred_preserve_identity_and_existing_restrictions(self):
        for key, status, reason_key in [('removedFromVocabulary', 'removed', 'removalReason'),
                                        ('replaceLater', 'replace-later', 'replacementReason')]:
            with self.subTest(status=status):
                item = self.card()
                archival = copy.deepcopy(item)
                apply_review_disposition(item, {key: {'card': 'Owner decision'}})
                self.assertEqual(item['practiceStatus'], status)
                self.assertFalse(item['pictureOnlyEligible'])
                self.assertEqual(item[reason_key], 'Owner decision')
                for field in ['id', 'originalConcept', 'concept', 'requiresContext', 'reviewRequired',
                              'reviewFindings', 'generationConstraints']:
                    self.assertEqual(item[field], archival[field])
                if status == 'removed':
                    self.assertEqual(item['vocabularyStatus'], 'removed')
                else:
                    self.assertEqual(item['outstandingFeedback'], 'Owner decision')
                validate_card_disposition(item, {key: {'card': 'Owner decision'}})

    def test_disposition_disables_previously_eligible_picture_without_approving_artwork(self):
        for key in ['removedFromVocabulary', 'replaceLater']:
            item = self.card()
            item.update(pictureOnlyEligible=True, requiresContext=False, reviewRequired=False)
            apply_review_disposition(item, {key: {'card': 'Later'}})
            self.assertFalse(item['pictureOnlyEligible'])
            self.assertEqual(item['artworkStatus'], 'not-generated')
            self.assertFalse(item['requiresContext'])

    def test_ordinary_card_is_not_changed_by_another_cards_disposition(self):
        item = self.card('unchanged')
        old = copy.deepcopy(item)
        apply_review_disposition(item, {'replaceLater': {'another': 'Later'}})
        self.assertEqual(item, old)

    def test_conflicting_dispositions_unknown_ids_and_missing_reasons_are_rejected(self):
        for feedback in [
            {'approvedCardIds': ['card'], 'replaceLater': {'card': 'Later'}},
            {'approvedCardIds': ['card'], 'removedFromVocabulary': {'card': 'Remove'}},
            {'replaceLater': {'card': 'Later'}, 'removedFromVocabulary': {'card': 'Remove'}},
            {'replaceLater': {'card': ''}}, {'removedFromVocabulary': {'card': None}},
            {'replaceLater': {'unknown': 'Later'}},
        ]:
            with self.subTest(feedback=feedback), self.assertRaises(ValueError):
                validate_feedback_dispositions(feedback, {'card'})

    def test_validator_rejects_approved_deferred_art_and_lost_owner_reason(self):
        feedback = {'replaceLater': {'card': 'Replace later'}}
        card = apply_review_disposition(self.card(), feedback)
        card['artworkStatus'] = 'approved'
        with self.assertRaises(AssertionError):
            validate_card_disposition(card, feedback)
        card['artworkStatus'] = 'replace-later'
        card['replacementReason'] = 'Different reason'
        with self.assertRaises(AssertionError):
            validate_card_disposition(card, feedback)

    def test_mixed_summary_includes_revision_required_and_every_nonfinal_asset(self):
        manifest = {'currentRevisionRound': 2, 'assets': [
            {'status': 'approved'}, {'status': 'replace-later'}, {'status': 'removed'},
            {'status': 'revision-required', 'revisionRound': 1},
            {'status': 'awaiting-user-feedback', 'revisionRound': 2},
            {'status': 'awaiting-user-feedback', 'revisionRound': 1},
        ]}
        self.assertEqual(disposition_summary(manifest),
                         '1 approved · 1 replace later · 1 removed · 1 revised · 2 awaiting feedback')
        # Other nonfinal workflow states must not disappear from the total either.
        for status in ['revision-required', 'awaiting-user-feedback', 'generating']:
            with self.subTest(status=status):
                mixed = {'assets': [{'status': final} for final in
                                    ['approved', 'replace-later', 'removed', status]]}
                self.assertEqual(disposition_summary(mixed),
                                 '1 approved · 1 replace later · 1 removed · 1 awaiting feedback')

    def test_gallery_keeps_original_numbers_dispositions_and_only_pending_revisions(self):
        statuses = ['approved', 'removed', 'approved', 'replace-later', 'approved', 'approved',
                    'awaiting-user-feedback', 'approved', 'replace-later', 'approved',
                    'awaiting-user-feedback', 'approved', 'replace-later', 'replace-later',
                    'replace-later', 'awaiting-user-feedback', 'replace-later', 'replace-later',
                    'approved', 'approved', 'approved', 'replace-later', 'replace-later', 'approved', 'approved']
        assets = [{'id': f'card{number}', 'meaning': f'Card {number}', 'path': 'batch-11/tiny.png',
                   'status': status, 'prompt': 'Exact prior generation prompt',
                   'visualReview': 'Retained illustration', 'revisionRound': 1}
                  for number, status in enumerate(statuses, 169)]
        assets[1]['previousVersions'] = [{'path': 'batch-11/tiny.png', 'prompt': 'Original Form prompt'}]
        manifest = {'batch': 'batch-11', 'numberStart': 169, 'status': 'awaiting-user-feedback',
                    'currentRevisionRound': 1, 'assets': assets}
        self.assertEqual(disposition_summary(manifest), '12 approved · 9 replace later · 1 removed · 3 revised')
        self.assertEqual([n for n, a in enumerate(assets, 169) if is_pending_revision(a, manifest)], [175, 179, 184])
        self.assertEqual(asset_status_label(assets[1]), 'Removed from vocabulary')
        self.assertEqual(asset_status_label(assets[3]), 'Replace later')
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            folder = root / 'batch-11'
            folder.mkdir()
            (folder / 'tiny.png').write_bytes(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j1S8AAAAASUVORK5CYII='))
            path = folder / 'manifest.json'
            path.write_text(json.dumps(manifest))
            lookup = {a['id']: {'id': a['id'], 'meaning': a['meaning'], 'japanese': '語'} for a in assets}
            with patch('render_review.ROOT', root):
                render_batch(path, lookup)
            rendered = (folder / 'review.html').read_text()
            self.assertIn('12 approved · 9 replace later · 1 removed · 3 revised', rendered)
            self.assertIn('170 · Card 170', rendered)
            self.assertIn('Removed from vocabulary', rendered)
            self.assertIn('Replace later', rendered)
            revision_section = rendered.split('<section class="revision-sheet"', 1)[1].split('</section>', 1)[0]
            self.assertIn('175, 179, 184', revision_section)
            self.assertEqual(revision_section.count('<figure>'), 3)
            self.assertNotIn('Card 170', revision_section)
            saved = json.loads(path.read_text())
            self.assertEqual([a['id'] for a in saved['assets']], [a['id'] for a in assets])
            self.assertEqual(saved['assets'][1]['previousVersions'], assets[1]['previousVersions'])
            batches = [{'id': 'batch-11'}, {'id': 'batch-12'}]
            resolve_batch_statuses(batches, root)
            self.assertEqual(batches[1]['status'], 'blocked-on-previous-feedback')


if __name__ == '__main__':
    unittest.main()
