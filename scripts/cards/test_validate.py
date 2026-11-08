"""Ensure the required card validator rejects corrupt metadata (#116)."""
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import validate as card_validation


class ValidationTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.data = Path(directory.name)
        # Copy metadata only; keep production data and media read-only.
        for source in card_validation.DATA.glob('*.json'):
            shutil.copyfile(source, self.data / source.name)
        self.scope = patch.object(card_validation, 'DATA', self.data)
        self.scope.start()
        self.addCleanup(self.scope.stop)

    def change(self, filename, mutate):
        path = self.data / filename
        value = json.loads(path.read_text())
        mutate(value)
        path.write_text(json.dumps(value))

    def test_rejects_a_dependency_cycle(self):
        def cycle(graph):
            node = graph['nodes'][0]['id']
            graph['edges'].append({'from': node, 'to': node})
        self.change('graph.json', cycle)
        with self.assertRaisesRegex(AssertionError, 'Generation graph contains a cycle'):
            card_validation.validate()

    def test_rejects_duplicate_batch_membership(self):
        def duplicate(plan):
            cards = plan['batches'][0]['cardIds']
            cards.append(cards[0])
        self.change('batches.json', duplicate)
        with self.assertRaisesRegex(AssertionError, 'Batches omit or duplicate a card'):
            card_validation.validate()

    def test_rejects_bypassing_the_feedback_gate(self):
        def unlock(plan):
            blocked = next(batch for batch in plan['batches']
                           if batch['status'] == 'blocked-on-previous-feedback')
            blocked['status'] = 'ready-to-generate'
        self.change('batches.json', unlock)
        with self.assertRaisesRegex(AssertionError, 'Batch unlocked before previous review'):
            card_validation.validate()

    def test_rejects_removing_a_context_restriction(self):
        def enable_picture_only(prompts):
            card = next(card for card in prompts['cards'] if card['requiresContext'])
            self.assertFalse(card['pictureOnlyEligible'])
            card['pictureOnlyEligible'] = True
        self.change('prompts.json', enable_picture_only)
        with self.assertRaises(AssertionError):
            card_validation.validate()


if __name__ == '__main__':
    unittest.main()
