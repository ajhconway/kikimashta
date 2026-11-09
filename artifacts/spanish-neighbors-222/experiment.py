"""Pinned two-model Spanish semantic comparison; never imported by the app."""
import argparse
import hashlib
import importlib.metadata
import json
from pathlib import Path
import re
import time
import unicodedata

OUT = Path(__file__).resolve().parent
FASTTEXT_ID = 'facebook/fasttext-es-vectors'
FASTTEXT_REVISION = 'c4c84c726b98d02b1f0ec92d6fc2724fe3b84276'
FASTTEXT_SHA256 = 'b8c800affac505d60c8a929cb90ff2ef616b4e8b5224d8f3a0a5e911a8a6546e'
E5_ID = 'intfloat/multilingual-e5-base'
E5_REVISION = 'd128750597153bb5987e10b1c3493a34e5a4502a'
STOP = frozenset('de del la el los las y en'.split())


def tokens(text):
    raw = re.findall(r'[^\W\d_]+', unicodedata.normalize('NFC', text).casefold())
    kept = [token for token in raw if token not in STOP]
    if not raw:
        raise ValueError('No Spanish word tokens: ' + text)
    return kept or raw


def canonical(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def checked_unit(vector, np):
    norm = np.linalg.norm(vector)
    if not np.isfinite(vector).all() or not norm > 0:
        raise ValueError('Invalid embedding vector.')
    return vector / norm


def main():
    import numpy as np
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('model', choices=['fasttext', 'e5'])
    parser.add_argument('--model-file', type=Path)
    parser.add_argument('--cache-dir', type=Path)
    args = parser.parse_args()
    bank = json.loads((OUT / 'bank.json').read_text())
    start = time.monotonic()
    if args.model == 'fasttext':
        import fasttext
        if args.model_file is None:
            parser.error('fasttext requires --model-file with the pinned downloaded binary')
        with args.model_file.open('rb') as stream:
            actual = hashlib.file_digest(stream, 'sha256').hexdigest()
        if actual != FASTTEXT_SHA256:
            raise ValueError('Wrong Spanish fastText model bytes.')
        model = fasttext.load_model(str(args.model_file))
        inputs = [tokens(item['text']) for item in bank]
        def represent(words):
            return checked_unit(np.mean([checked_unit(model.get_word_vector(word).astype(np.float64), np) for word in words], axis=0), np)
        vectors = np.array([represent(words) for words in inputs])
        repeat = np.array([represent(words) for words in inputs])
        coverage = {item['id']: {'tokens': words, 'methods': ['whole-word' if model.get_word_id(word) >= 0 else 'subword' for word in words]} for item, words in zip(bank, inputs)}
        identity = {'id': FASTTEXT_ID, 'revision': FASTTEXT_REVISION, 'sha256': actual, 'license': 'CC-BY-SA-3.0',
                    'recipe': 'NFC/casefold; Unicode-letter tokens; remove de/del/la/el/los/las/y/en unless all; mean unit token vectors then normalize'}
        packages = ['fasttext-wheel', 'numpy', 'huggingface-hub']
    else:
        import torch
        from sentence_transformers import SentenceTransformer
        from huggingface_hub import snapshot_download
        torch.set_num_threads(4)
        torch.manual_seed(0)
        torch.use_deterministic_algorithms(True)
        path = Path(snapshot_download(E5_ID, revision=E5_REVISION, cache_dir=str(args.cache_dir) if args.cache_dir else None,
            local_files_only=True, allow_patterns=['*.json', '*.safetensors', '*.model', '*.txt'], ignore_patterns=['onnx/*', 'openvino/*']))
        source_hashes = {}
        for file in sorted(path.rglob('*')):
            if file.is_file():
                with file.open('rb') as stream:
                    source_hashes[str(file.relative_to(path))] = hashlib.file_digest(stream, 'sha256').hexdigest()
        model = SentenceTransformer(str(path), device='cpu', trust_remote_code=False)
        model.max_seq_length = 128
        inputs = [f"query: {item['text']} — {item['label']}" for item in bank]
        vectors = model.encode(inputs, batch_size=16, normalize_embeddings=False, show_progress_bar=True)
        repeat = model.encode(inputs, batch_size=16, normalize_embeddings=False, show_progress_bar=True)
        coverage = {item['id']: {'norm': round(float(np.linalg.norm(vector)), 8)} for item, vector in zip(bank, vectors)}
        identity = {'id': E5_ID, 'revision': E5_REVISION, 'sourceHashes': source_hashes, 'license': 'MIT', 'recipe': 'query: {Spanish text} — {English meaning}'}
        packages = ['sentence-transformers', 'transformers', 'torch', 'numpy', 'huggingface-hub']
    normalized = np.array([checked_unit(vector.astype(np.float64), np) for vector in vectors])
    similarities = np.round(np.clip(normalized @ normalized.T, -1, 1), 8)
    result = {'schemaVersion': 1, 'language': 'es-419', 'model': {**identity, 'dimension': vectors.shape[1],
        'dependencies': {name: importlib.metadata.version(name) for name in packages}},
        'items': [{key: item[key] for key in ['id', 'language', 'text', 'label']} for item in bank],
        'inputs': inputs, 'inputSha256': hashlib.sha256(canonical(inputs).encode()).hexdigest(),
        'cosineSimilarities': similarities.tolist(), 'coverage': coverage,
        'repeatMaxAbsoluteDifference': float(np.max(np.abs(vectors - repeat))),
        'executionSecondsIncludingLoadAndRepeat': round(time.monotonic() - start, 2), 'device': 'cpu'}
    (OUT / f'{args.model}-results.json').write_text(canonical(result) + '\n')
    print(json.dumps({'model': args.model, 'words': len(bank), 'seconds': result['executionSecondsIncludingLoadAndRepeat'],
                      'repeatMaxAbsoluteDifference': result['repeatMaxAbsoluteDifference']}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
