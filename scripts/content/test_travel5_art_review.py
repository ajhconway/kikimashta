"""Small isolated provenance and PNG regression checks for Travel 5 (#243)."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch
import zlib


SPEC = importlib.util.spec_from_file_location(
    'travel5_art_review', Path(__file__).with_name('build-spanish-travel-level-5-art-review.py'))
review = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(review)


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)


def tiny_png(alpha=(0, 255), scanline=None):
    """Two-pixel rectangular RGBA fixture, generated entirely in memory."""
    header = struct.pack('>IIBBBBB', 2, 1, 8, 6, 0, 0, 0)
    pixels = scanline if scanline is not None else bytes((0, 120, 40, 60, alpha[0], 80, 30, 90, alpha[1]))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b'')


class PngIntegrityTests(unittest.TestCase):
    def test_rectangular_alpha_picture_is_accepted_without_transforming_bytes(self):
        raw = tiny_png()
        info = review.png_info(raw, require_alpha=True)
        self.assertEqual((info['width'], info['height']), (2, 1))
        self.assertEqual((info['transparentPixels'], info['opaquePixels']), (1, 1))
        self.assertEqual(raw, tiny_png())

    def test_corrupt_crc_truncation_and_bad_scanlines_are_rejected(self):
        raw = tiny_png()
        corrupted = raw[:40] + bytes((raw[40] ^ 1,)) + raw[41:]
        for case in (corrupted, raw[:-4], tiny_png(scanline=b'\0short')):
            with self.subTest(case=case):
                with self.assertRaises(ValueError):
                    review.png_info(case, require_alpha=True)

    def test_alpha_channel_must_contain_transparent_and_opaque_pixels(self):
        for alpha in ((255, 255), (0, 0), (100, 100)):
            with self.subTest(alpha=alpha):
                with self.assertRaisesRegex(ValueError, 'transparent and opaque'):
                    review.png_info(tiny_png(alpha=alpha), require_alpha=True)


class ReviewProvenanceTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='kikimashta-travel5-test-')
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.patch = patch.object(review, 'ROOT', self.root)
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.picture = tiny_png()
        self.picture_hash = review.sha(self.picture)
        self.put('refs/style.png', self.picture)
        self.reference = {'path': 'refs/style.png', 'sha256': self.picture_hash, 'role': 'style-only'}
        self.draft = {'id': 'es-419-travel-5', 'groups': [{'id': 'art', 'title': 'Art'}], 'items': []}
        requests = []
        for number in range(36):
            slug = f'word-{number}'
            item_id = f'es-419-travel-{slug}'
            self.draft['items'].append({'id': item_id, 'slug': slug, 'text': f'palabra {number}', 'meaning': f'Word {number}', 'group': 'art'})
            if number == 35:
                continue
            prompt = f'Draw picture {number}.'
            requests.append({'id': item_id, 'slug': slug, 'prompt': prompt, 'transparent_background': True, 'references': [self.reference]})
            self.put(review.ART / 'originals' / f'{slug}-v1.png', self.picture)
            self.put_json(review.ART / 'records' / f'{slug}-v1.json', {
                'id': item_id, 'slug': slug, 'version': 1, 'path': f'originals/{slug}-v1.png',
                'sha256': self.picture_hash, 'promptSha256': review.sha(prompt.encode()),
                'tool': 'built-in image_gen', 'originalToolPath': '/example/generated.png',
                'references': [self.reference], 'bytes': len(self.picture), 'width': 2, 'height': 1})
        self.put_json(review.DATA / 'draft.json', self.draft)
        draft_hash = review.sha((self.root / review.DATA / 'draft.json').read_bytes())
        self.put_json(review.DATA / 'generation-approval.json', {'issue': 243, 'draftSha256': draft_hash})
        self.put_json(review.ART / 'requests.json', {'issue': 243, 'draftSha256': draft_hash, 'requests': requests})
        self.put_json(review.ART / 'reuse-review.json', {'items': [{
            'id': 'es-419-travel-word-35', 'slug': 'word-35', 'path': 'refs/style.png',
            'sha256': self.picture_hash, 'evidence': 'Accepted fixture artwork, unchanged.'}]})

    def put(self, relative, raw):
        destination = self.root / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(raw)

    def put_json(self, relative, document):
        self.put(relative, (json.dumps(document, ensure_ascii=False, indent=2) + '\n').encode())

    def read_json(self, relative):
        return json.loads((self.root / relative).read_text())

    def build(self):
        with contextlib.redirect_stdout(io.StringIO()):
            review.build(complete=True)

    def output_bytes(self):
        return {name: (self.root / review.ART / name).read_bytes()
                for name in ('manifest.json', 'selection.json', 'review.html', 'artwork.html')}

    def test_complete_review_binds_every_source_and_preserves_rectangular_picture(self):
        self.build()
        manifest = self.read_json(review.ART / 'manifest.json')
        self.assertEqual((manifest['words'], manifest['generatedImages'], manifest['reusedImages'], manifest['pendingImages']), (36, 35, 1, 0))
        for path in (review.DATA / 'draft.json', review.DATA / 'generation-approval.json', review.ART / 'requests.json', review.ART / 'reuse-review.json'):
            self.assertEqual(manifest['inputHashes'][str(path)], review.sha((self.root / path).read_bytes()))
        first = manifest['items'][0]
        self.assertEqual((first['image']['width'], first['image']['height']), (2, 1))
        self.assertEqual((self.root / first['path']).read_bytes(), self.picture)
        self.assertFalse(manifest['audioGenerationAuthorized'])
        self.assertFalse(manifest['runtimeActivationAuthorized'])
        page = (self.root / review.ART / 'review.html').read_text()
        self.assertEqual(page.count('<article '), 36)
        self.assertIn('max-width:145px;max-height:145px', page)
        self.assertNotIn('localStorage', page)

    def test_changed_prompt_rejected_before_existing_outputs_are_overwritten(self):
        self.build()
        before = self.output_bytes()
        requests = self.read_json(review.ART / 'requests.json')
        requests['requests'][0]['prompt'] = 'An unauthorized different subject.'
        self.put_json(review.ART / 'requests.json', requests)
        with self.assertRaisesRegex(ValueError, 'Generation record mismatch'):
            self.build()
        self.assertEqual(self.output_bytes(), before)

    def test_altered_draft_or_request_draft_hash_is_rejected(self):
        for source in ('draft', 'request-binding', 'approval-binding'):
            with self.subTest(source=source):
                path = {'draft': review.DATA / 'draft.json', 'request-binding': review.ART / 'requests.json', 'approval-binding': review.DATA / 'generation-approval.json'}[source]
                previous = (self.root / path).read_bytes()
                document = self.read_json(path)
                if source == 'draft':
                    document['items'][0]['meaning'] = 'A different meaning'
                else:
                    document['draftSha256'] = '0' * 64
                self.put_json(path, document)
                with self.assertRaisesRegex(ValueError, 'bind the current draft hash'):
                    self.build()
                self.assertFalse((self.root / review.ART / 'manifest.json').exists())
                self.put(path, previous)

    def test_altered_reference_bytes_are_rejected(self):
        self.put('refs/style.png', tiny_png(alpha=(0, 200)))
        with self.assertRaisesRegex(ValueError, 'Hash mismatch: refs/style.png'):
            self.build()
        self.assertFalse((self.root / review.ART / 'selection.json').exists())

    def test_incomplete_complete_review_fails_before_any_write(self):
        (self.root / review.ART / 'records/word-0-v1.json').unlink()
        with self.assertRaisesRegex(ValueError, '1 pictures remain pending'):
            self.build()
        for name in ('manifest.json', 'selection.json', 'review.html', 'artwork.html'):
            self.assertFalse((self.root / review.ART / name).exists())

    def test_path_traversal_absolute_and_descendant_symlinks_are_rejected(self):
        for path in ('../outside.png', '/etc/passwd'):
            with self.subTest(path=path):
                with self.assertRaisesRegex(ValueError, 'Unsafe repository path'):
                    review.safe_path(path)
        with tempfile.TemporaryDirectory(prefix='kikimashta-travel5-outside-') as outside:
            target = Path(outside) / 'picture.png'
            target.write_bytes(self.picture)
            (self.root / 'refs' / 'linked.png').symlink_to(target)
            with self.assertRaisesRegex(ValueError, 'Symlink'):
                review.verified('refs/linked.png', self.picture_hash)
            output = self.root / review.ART / 'review.html'
            output.symlink_to(target)
            with self.assertRaisesRegex(ValueError, 'Symlink'):
                self.build()
            self.assertEqual(target.read_bytes(), self.picture)
            self.assertFalse((self.root / review.ART / 'selection.json').exists())


if __name__ == '__main__':
    unittest.main()
