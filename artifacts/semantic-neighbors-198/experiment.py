"""One-off two-model experiment for #198; never imported by the app."""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import time

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'artifacts/semantic-neighbors-198'
MODELS = {
    'fasttext': ('facebook/fasttext-ja-vectors', 'be286af953967df11e163522974fff118569f1fb'),
    'e5': ('intfloat/multilingual-e5-base', 'd128750597153bb5987e10b1c3493a34e5a4502a'),
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('model', choices=MODELS)
    parser.add_argument('--download', action='store_true', help='Allow fetching the pinned public model into the Hugging Face cache.')
    args = parser.parse_args()
    bank = json.loads((OUT / 'bank.json').read_text())
    model_id, revision = MODELS[args.model]
    inputs = [item['text'] if args.model == 'fasttext' else f"query: {item['text']} — {item['label']}" for item in bank]
    start = time.monotonic()
    if args.model == 'fasttext':
        import fasttext
        from huggingface_hub import hf_hub_download
        path = hf_hub_download(model_id, 'model.bin', revision=revision, local_files_only=not args.download)
        model = fasttext.load_model(path)
        def vector(value):
            raw = model.get_word_vector(value)
            if np.linalg.norm(raw) > 0:
                return raw, 'whole-word' if model.get_word_id(value) >= 0 else 'subword'
            # All zero-vector surfaces in this bank are two-kanji compounds.
            # Give static embeddings a compositional fallback, rather than
            # selecting the other approach merely on dictionary coverage.
            if len(value) == 2 and all('\u4e00' <= char <= '\u9fff' and model.get_word_id(char) >= 0 for char in value):
                return np.mean([model.get_word_vector(char) for char in value], axis=0), 'mean-of-kanji'
            raise ValueError('No usable static representation: ' + value)
        represented = [vector(value) for value in inputs]
        vectors = np.array([value[0] for value in represented])
        coverage = {item['id']: {'wholeWord': model.get_word_id(item['text']) >= 0,
                                'method': represented[i][1],
                                'norm': round(float(np.linalg.norm(vectors[i])), 8)} for i, item in enumerate(bank)}
        repeat = np.array([vector(value)[0] for value in inputs])
        dependency_names = ['fasttext-wheel', 'numpy', 'huggingface-hub']
    else:
        import torch
        from sentence_transformers import SentenceTransformer
        from huggingface_hub import snapshot_download
        torch.set_num_threads(4)
        torch.manual_seed(0)
        torch.use_deterministic_algorithms(True)
        path = snapshot_download(model_id, revision=revision, local_files_only=not args.download,
                                 allow_patterns=['*.json', '*.safetensors', '*.model', '*.txt'],
                                 ignore_patterns=['onnx/*', 'openvino/*'])
        model = SentenceTransformer(path, device='cpu', trust_remote_code=False)
        model.max_seq_length = 128
        vectors = model.encode(inputs, batch_size=16, normalize_embeddings=False, show_progress_bar=True)
        repeat = model.encode(inputs, batch_size=16, normalize_embeddings=False, show_progress_bar=True)
        coverage = {item['id']: {'norm': round(float(np.linalg.norm(vectors[i])), 8)} for i, item in enumerate(bank)}
        dependency_names = ['sentence-transformers', 'transformers', 'torch', 'numpy', 'huggingface-hub']
    norms = np.linalg.norm(vectors, axis=1)
    if not np.isfinite(vectors).all() or (norms <= 0).any():
        invalid = [item['text'] for i, item in enumerate(bank) if not np.isfinite(vectors[i]).all() or norms[i] <= 0]
        raise ValueError('Invalid vectors: ' + repr(invalid))
    normalized = vectors.astype(np.float64) / norms[:, None]
    similarities = np.clip(normalized @ normalized.T, -1, 1)
    matrix = np.round(similarities, 8).tolist()
    result = {
        'schemaVersion': 1,
        'issue': 198,
        'model': {'id': model_id, 'revision': revision, 'dimension': vectors.shape[1],
                  'inputTemplate': '{text}' if args.model == 'fasttext' else 'query: {text} — {label}',
                  'dependencies': {name: importlib.metadata.version(name) for name in dependency_names}},
        'items': [{k: item[k] for k in ['id', 'language', 'text', 'label']} for item in bank],
        'inputs': inputs,
        'inputSha256': hashlib.sha256(json.dumps(inputs, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest(),
        'cosineSimilarities': matrix,
        'coverage': coverage,
        'repeatMaxAbsoluteDifference': float(np.max(np.abs(vectors - repeat))),
        'executionSecondsIncludingLoadAndRepeat': round(time.monotonic() - start, 2),
        'device': 'cpu',
        'fallback': 'Mean constituent kanji vectors for two-kanji surfaces with a zero raw vector.' if args.model == 'fasttext' else None,
    }
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / f'{args.model}-results.json'
    path.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(json.dumps({'path': str(path), 'model': model_id, 'items': len(bank),
                      'seconds': result['executionSecondsIncludingLoadAndRepeat'],
                      'repeatMaxAbsoluteDifference': result['repeatMaxAbsoluteDifference']}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
