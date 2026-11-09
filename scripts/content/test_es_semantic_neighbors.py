import importlib.util
from pathlib import Path
import unittest

SCRIPT = Path(__file__).with_name('es_semantic_neighbors.py')
spec = importlib.util.spec_from_file_location('es_semantic_neighbors', SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SpanishSelectedSemanticRecipeTest(unittest.TestCase):
    def test_tokens_preserve_accents_and_compose_phrases(self):
        self.assertEqual(module.tokens('TARJETA de CRÉDITO'), ['tarjeta', 'crédito'])
        self.assertEqual(module.tokens('cafe\u0301 con leche'), ['café', 'con', 'leche'])
        self.assertEqual(module.tokens('al lado de'), ['al', 'lado'])
        self.assertEqual(module.tokens('niño'), ['niño'])

    def test_declared_stopwords_have_nonempty_fallback(self):
        self.assertEqual(module.tokens('de la'), ['de', 'la'])
        with self.assertRaises(ValueError):
            module.tokens('123 _ !')


if __name__ == '__main__':
    unittest.main()
