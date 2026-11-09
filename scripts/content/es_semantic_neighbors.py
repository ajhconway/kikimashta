"""Generate selected Spanish fastText semantic rankings (#222), outside the browser."""
import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import re
import subprocess
import unicodedata

ROOT = Path(__file__).resolve().parents[2]
MODEL_ID = 'facebook/fasttext-es-vectors'
MODEL_REVISION = 'c4c84c726b98d02b1f0ec92d6fc2724fe3b84276'
MODEL_SHA256 = 'b8c800affac505d60c8a929cb90ff2ef616b4e8b5224d8f3a0a5e911a8a6546e'
STOP = frozenset('de del la el los las y en'.split())


def canonical(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def tokens(text):
    raw = re.findall(r'[^\W\d_]+', unicodedata.normalize('NFC', text).casefold())
    if not raw:
        raise ValueError('No Spanish word tokens: ' + text)
    return [token for token in raw if token not in STOP] or raw


def load_bank():
    script = "import {spanishNeighborBank} from './scripts/content/spanish-neighbor-utils.mjs'; console.log(JSON.stringify(spanishNeighborBank(process.cwd())));"
    return json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script], cwd=ROOT, text=True))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model-file', required=True, type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / 'content/semantic-neighbors/es.json')
    args = parser.parse_args()
    import fasttext
    import numpy as np
    with args.model_file.open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != MODEL_SHA256:
            raise ValueError('Wrong pinned Spanish fastText binary.')
    bank = load_bank()
    model = fasttext.load_model(str(args.model_file))
    def unit(vector):
        norm = np.linalg.norm(vector)
        if not np.isfinite(vector).all() or not norm > 0:
            raise ValueError('Every token/phrase requires a finite nonzero vector.')
        return vector / norm
    inputs = [tokens(item['text']) for item in bank]
    def represent(parts):
        return unit(np.mean([unit(model.get_word_vector(part).astype(np.float64)) for part in parts], axis=0))
    vectors = np.array([represent(parts) for parts in inputs])
    repeated = np.array([represent(parts) for parts in inputs])
    if not np.array_equal(vectors, repeated):
        raise ValueError('Spanish semantic inference did not repeat exactly.')
    similarities = np.round(np.clip(vectors @ vectors.T, -1, 1), 8)
    items = [{key: item[key] for key in ['id', 'language', 'text', 'label']} for item in bank]
    entries = {}
    for i, (item, parts) in enumerate(zip(bank, inputs)):
        neighbors = [[other['id'], float(similarities[i, j])] for j, other in enumerate(bank) if i != j]
        neighbors.sort(key=lambda row: (-row[1], row[0]))
        entries[item['id']] = {'text': item['text'], 'label': item['label'], 'tokens': parts,
            'representation': ['whole-word' if model.get_word_id(part) >= 0 else 'subword' for part in parts], 'neighbors': neighbors}
    result = {'schemaVersion': 1, 'language': 'es-419',
        'sourceDigest': hashlib.sha256(canonical(items).encode()).hexdigest(),
        'recipeSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'model': {'id': MODEL_ID, 'revision': MODEL_REVISION, 'sha256': MODEL_SHA256, 'dimension': 300, 'license': 'CC-BY-SA-3.0',
            'recipe': 'NFC/casefold; Unicode-letter tokens; remove de/del/la/el/los/las/y/en unless all; mean unit token vectors then normalize',
            'dependencies': {name: importlib.metadata.version(name) for name in ['fasttext-wheel', 'numpy']}},
        'repeatIdentical': True, 'entries': entries}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(canonical(result) + '\n')
    print(f'Generated selected Spanish fastText rankings for {len(bank)} unique words: {args.output}')


if __name__ == '__main__':
    main()
