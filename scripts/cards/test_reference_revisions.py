"""Approval of replacements must preserve the selected source and its history (#72)."""
from copy import deepcopy
import unittest
from validate import validate_reference_selection


class ReferenceRevisionTests(unittest.TestCase):
    def setUp(self):
        self.old = {'id': 'number', 'status': 'approved', 'path': 'old.png', 'sha256': 'old-hash'}
        self.candidate = {'id': 'number', 'status': 'awaiting-user-feedback',
                          'path': 'candidate.png', 'sha256': 'new-hash',
                          'approvedSourcePath': 'old.png', 'approvedSourceSha256': 'old-hash'}

    def test_pending_candidate_keeps_the_old_approved_selection(self):
        validate_reference_selection(self.candidate, self.old)
        changed = {**self.old, 'path': 'candidate.png', 'sha256': 'new-hash'}
        with self.assertRaises(AssertionError):
            validate_reference_selection(self.candidate, changed)

    def test_approved_revision_selects_new_source_and_retains_old_artwork(self):
        candidate = {**self.candidate, 'status': 'approved', 'promotedPath': 'promoted.png'}
        selected = {**self.old, 'path': 'promoted.png', 'sha256': 'new-hash',
                    'previousVersions': [deepcopy(self.old)]}
        validate_reference_selection(candidate, selected)
        selected['previousVersions'] = []
        with self.assertRaises(AssertionError):
            validate_reference_selection(candidate, selected)

    def test_approved_revision_cannot_point_to_different_bytes(self):
        candidate = {**self.candidate, 'status': 'approved', 'promotedPath': 'promoted.png'}
        selected = {**self.old, 'path': 'promoted.png', 'sha256': 'wrong-hash',
                    'previousVersions': [deepcopy(self.old)]}
        with self.assertRaises(AssertionError):
            validate_reference_selection(candidate, selected)


if __name__ == '__main__':
    unittest.main()
