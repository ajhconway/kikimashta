import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]


def load(name):
    path = ROOT / 'artifacts/spanish-neighbors-222' / (name + '.py')
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class SpanishNeighborPreparation(unittest.TestCase):
    def test_phrase_composition_preserves_accents_and_has_declared_stopword_fallback(self):
        tokens = load('experiment').tokens
        self.assertEqual(tokens('Tarjeta de CRE\u0301DITO'), ['tarjeta', 'crédito'])
        self.assertEqual(tokens('al lado de'), ['al', 'lado'])
        self.assertEqual(tokens('de la'), ['de', 'la'])
        self.assertEqual(tokens('baño'), ['baño'])
        with self.assertRaises(ValueError):
            tokens('123!')

    def test_ipa_units_keep_stress_word_boundaries_and_multicharacter_phones(self):
        units = load('phonemize').phoneme_units
        self.assertEqual(units('t͡ʃ_ˈa ð_e'), ['t͡ʃ', 'ˈ', 'a', '|', 'ð', 'e'])
        self.assertEqual(units('r_ˈi__o'), ['r', 'ˈ', 'i', 'o'])
        self.assertEqual(units('k_ˌa_s_a'), ['k', 'a', 's', 'a'])
        self.assertNotEqual(units('p_ˈa_p_a'), units('p_a_p_ˈa'))
        with self.assertRaises(ValueError):
            units('   ')


if __name__ == '__main__':
    unittest.main()
