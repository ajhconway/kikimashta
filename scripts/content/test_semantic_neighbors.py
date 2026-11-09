import math
from types import SimpleNamespace
import unittest

from semantic_neighbors import build_export, represent_word


class ArrayMathBoundary:
    """Small scalar fixtures exercise model handling without optional NumPy."""
    linalg = SimpleNamespace(norm=lambda values: math.sqrt(sum(value * value for value in values)))

    @staticmethod
    def isfinite(values):
        return SimpleNamespace(all=lambda: all(math.isfinite(value) for value in values))

    @staticmethod
    def mean(rows, axis):
        if axis != 0:
            raise AssertionError('Expected mean across component vectors.')
        return [sum(column) / len(rows) for column in zip(*rows)]


class WordRepresentationTests(unittest.TestCase):
    def model(self, vectors, known):
        return SimpleNamespace(get_word_vector=lambda text: vectors[text],
                               get_word_id=lambda text: 0 if text in known else -1)

    def test_keeps_known_and_nonzero_subword_representations(self):
        model = self.model({'本': [2, 1], '新しい語': [1, 3]}, {'本'})
        self.assertEqual(represent_word(model, '本', ArrayMathBoundary), ([2, 1], 'whole-word'))
        self.assertEqual(represent_word(model, '新しい語', ArrayMathBoundary), ([1, 3], 'subword'))

    def test_composes_a_zero_vector_compound_from_known_constituents(self):
        model = self.model({'子牛': [0, 0], '子': [2, 0], '牛': [0, 4]}, {'子', '牛'})
        self.assertEqual(represent_word(model, '子牛', ArrayMathBoundary), ([1, 2], 'mean-of-kanji'))

    def test_fails_on_unknown_components_zero_components_and_nonfinite_vectors(self):
        cases = [
            (self.model({'子牛': [0, 0]}, {'子'}), '子牛'),
            (self.model({'子牛': [0, 0], '子': [0, 0], '牛': [1, 2]}, {'子', '牛'}), '子牛'),
            (self.model({'本': [math.nan, 1]}, {'本'}), '本'),
            (self.model({'未知の語': [0, 0]}, set()), '未知の語'),
        ]
        for model, text in cases:
            with self.subTest(text=text), self.assertRaises(ValueError):
                represent_word(model, text, ArrayMathBoundary)


class SemanticExportTests(unittest.TestCase):
    def setUp(self):
        self.bank = [dict(id=id, language='ja-JP', text=text, label=label) for id, text, label in [
            ('book', '本', 'Book'), ('notebook', 'ノート', 'Notebook'), ('cow', '牛', 'Cow')]]
        self.matrix = [[1, .8, .1], [.8, 1, .2], [.1, .2, 1]]

    def test_exports_full_rankings_without_self_and_records_representation(self):
        result = build_export(self.bank, self.matrix, ['whole-word', 'subword', 'mean-of-kanji'])
        self.assertEqual(result['entries']['book']['neighbors'], [['notebook', .8], ['cow', .1]])
        self.assertEqual(result['entries']['cow']['representation'], 'mean-of-kanji')

    def test_changed_card_meaning_invalidates_the_input_digest(self):
        before = build_export(self.bank, self.matrix, ['whole-word'] * 3)
        self.bank[0]['label'] = 'Counter for long objects'
        after = build_export(self.bank, self.matrix, ['whole-word'] * 3)
        self.assertNotEqual(before['sourceDigest'], after['sourceDigest'])

    def test_refuses_missing_or_invalid_scores_and_wrong_language(self):
        for score in [math.nan, math.inf, 1.1]:
            self.matrix[0][1] = score
            with self.assertRaisesRegex(ValueError, 'finite cosine'):
                build_export(self.bank, self.matrix, ['whole-word'] * 3)
        self.bank[0]['language'] = 'es-419'
        with self.assertRaisesRegex(ValueError, 'Japanese'):
            build_export(self.bank, self.matrix, ['whole-word'] * 3)


if __name__ == '__main__':
    unittest.main()
