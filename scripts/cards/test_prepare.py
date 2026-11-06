"""Regressions from independent review of the regeneration prompts (#72)."""
import unittest
import json
import tempfile
from pathlib import Path
from prepare import components_for, ROLE_CONSTRAINTS, resolve_batch_statuses, BACKGROUND_POLICY


class ReuseTests(unittest.TestCase):
    def test_every_generation_prompt_ends_with_current_background_policy(self):
        root = Path(__file__).resolve().parents[2]
        cards = json.loads((root / 'content/card-regeneration/prompts.json').read_text())['cards']
        self.assertTrue(cards)
        for card in cards:
            self.assertTrue(card['prompt'].endswith(BACKGROUND_POLICY), card['id'])
        self.assertIn('transparent_background=true', BACKGROUND_POLICY)
        self.assertIn('Preserve opaque white subject details', BACKGROUND_POLICY)

    def test_counting_family_reuses_approved_blocks_and_preserves_reviewed_batches(self):
        root = Path(__file__).resolve().parents[2]
        data = root / 'content/card-regeneration'
        cards = json.loads((data / 'prompts.json').read_text())['cards']
        family = json.loads((data / 'user-feedback.json').read_text())['designFamilies']['counting-blocks']
        for card in cards:
            if card['meaning'].endswith(' Things') and card['id'] != family['seedCard']:
                self.assertIn('family:counting-blocks', card['dependsOn'])
                self.assertNotIn('component:apple', card['dependsOn'])
        batches = {b['id']: b['cardIds'] for b in json.loads((data / 'batches.json').read_text())['batches']}
        for path in (root / 'artifacts/card-regeneration').glob('batch-*/manifest.json'):
            manifest = json.loads(path.read_text())
            self.assertEqual(batches[manifest['batch']], [a['id'] for a in manifest['assets']])

    def test_negative_jewel_instruction_does_not_add_a_jewel_to_stone(self):
        item = {'id': 'ja-v-2f734ba866d9', 'meaning': 'Stone',
                'originalConcept': 'A stone; no faceted jewel.'}
        self.assertEqual(components_for(item), ['stone'])

    def test_runner_uses_person_reference(self):
        item = {'id': 'ja-v-97526e11c703', 'meaning': 'To Run',
                'originalConcept': 'Runner leans forward with bent arms.'}
        self.assertEqual(components_for(item), ['person'])

    def test_shape_family_is_not_a_family_of_people(self):
        item = {'id': 'shape-example', 'meaning': 'Form',
                'originalConcept': 'Circle, square and triangle shown as a shape family.'}
        self.assertNotIn('character-relationship', components_for(item))

    def test_teacher_is_a_reusable_person(self):
        item = {'id': 'teacher-example', 'meaning': 'Teacher',
                'originalConcept': 'A teacher points at a classroom board.'}
        self.assertIn('person', components_for(item))

    def test_grouped_volcano_correction_is_not_sent_to_mountain(self):
        mountain = ROLE_CONSTRAINTS['ja-v-ddd9dca106e2', 'F03']
        volcano = ROLE_CONSTRAINTS['ja-v-afefe30bcb46', 'F03']
        self.assertNotIn('lava flow', mountain)
        self.assertIn('non-erupting', mountain)
        self.assertIn('lava flow', volcano)

    def test_accepted_batch_unlocks_only_the_next_batch(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'batch-01').mkdir()
            (root / 'batch-01/manifest.json').write_text(json.dumps({'status': 'approved'}))
            batches = [{'id': f'batch-{n:02}'} for n in range(1, 4)]
            resolve_batch_statuses(batches, root)
            self.assertEqual([b['status'] for b in batches], ['approved', 'ready-to-generate', 'blocked-on-previous-feedback'])

    def test_generated_batch_keeps_feedback_gate_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for number, status in [(1, 'approved'), (2, 'awaiting-user-feedback')]:
                folder = root / f'batch-{number:02}'
                folder.mkdir()
                (folder / 'manifest.json').write_text(json.dumps({'status': status}))
            batches = [{'id': f'batch-{n:02}'} for n in range(1, 4)]
            resolve_batch_statuses(batches, root)
            self.assertEqual([b['status'] for b in batches], ['approved', 'awaiting-user-feedback', 'blocked-on-previous-feedback'])


if __name__ == '__main__':
    unittest.main()
