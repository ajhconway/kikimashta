"""Consolidated artwork keeps the original approval identity and fails closed (#195)."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from artwork_source import source_file
import render_review


class ArtworkSourceTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.original = 'artifacts/card-regeneration/batch-05/red.png'
        self.canonical = 'artifacts/card-regeneration/batch-03/red.png'
        self.raw = b'\x89PNG\r\n\x1a\n' + bytes(8) + (2).to_bytes(4, 'big') * 2
        self.sha = hashlib.sha256(self.raw).hexdigest()
        self.alias = {'path': self.canonical, 'sha256': self.sha, 'bytes': len(self.raw)}
        self.put(self.canonical, self.raw)
        self.registry()

    def put(self, path, raw):
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)

    def registry(self):
        self.put('artifacts/artwork-aliases.json', json.dumps({'version': 1, 'aliases': {self.original: self.alias}}).encode())

    def test_missing_duplicate_resolves_verified_canonical_bytes(self):
        self.assertEqual(source_file(self.root, self.original, self.sha), self.root / self.canonical)
        self.put(self.original, b'changed original')
        with self.assertRaisesRegex(ValueError, 'hash or size mismatch'):
            source_file(self.root, self.original, self.sha)

    def test_changed_canonical_hash_or_size_is_rejected(self):
        for raw in [bytes(len(self.raw)), self.raw + b'extra']:
            self.put(self.canonical, raw)
            with self.assertRaisesRegex(ValueError, 'hash or size mismatch'):
                source_file(self.root, self.original, self.sha)

    def test_unregistered_or_unsafe_alias_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Unverified artwork alias'):
            source_file(self.root, self.original + '.missing')
        self.alias['path'] = '../outside.png'
        self.registry()
        with self.assertRaisesRegex(ValueError, 'Unverified artwork alias'):
            source_file(self.root, self.original, self.sha)

    def test_symlink_canonical_is_rejected(self):
        (self.root / self.canonical).unlink()
        (self.root / self.canonical).symlink_to(self.root / 'outside.png')
        with self.assertRaisesRegex(ValueError, 'symlink'):
            source_file(self.root, self.original, self.sha)

    def test_gallery_renders_canonical_links_without_reassigning_approval_path(self):
        manifest = {'status': 'approved', 'assets': [{'id': 'red', 'path': self.original, 'sha256': self.sha,
                    'bytes': len(self.raw), 'status': 'approved', 'prompt': 'One red swatch.', 'visualReview': 'Approved red.'}]}
        self.put('artifacts/card-regeneration/batch-05/manifest.json', json.dumps(manifest).encode())
        path = self.root / 'artifacts/card-regeneration/batch-05/manifest.json'
        with patch.object(render_review, 'ROOT', self.root):
            render_review.render_batch(path, {'red': {'id': 'red', 'meaning': 'Red', 'japanese': '赤'}})
        self.assertIn('src="../batch-03/red.png"', (path.parent / 'review.html').read_text())
        self.assertEqual(json.loads(path.read_text())['assets'][0]['path'], self.original)


if __name__ == '__main__':
    unittest.main()
