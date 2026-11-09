"""Generate the selected offline Japanese semantic ranking (#198).

The browser consumes only generated data. Install semantic-neighbors-requirements.txt
in a separate environment for regeneration; ordinary checks need no model packages.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
MODEL_ID = 'facebook/fasttext-ja-vectors'
MODEL_REVISION = 'be286af953967df11e163522974fff118569f1fb'
MODEL_SHA256 = '217faf8282042e912612da78cf0002ec4fcde716643ae093058f6274c80d93b3'
DEFAULT_OUTPUT = ROOT / 'content/semantic-neighbors/ja.json'


def canonical(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def load_bank(root=ROOT):
    # Share the content selection implementation with the comparison tooling.
    script = "import {japaneseSemanticBank} from './scripts/content/semantic-neighbor-utils.mjs'; console.log(JSON.stringify(japaneseSemanticBank(process.cwd())));"
    return json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script], cwd=root, text=True))


def represent_word(model, text, numpy):
    vector = model.get_word_vector(text)
    if not numpy.isfinite(vector).all():
        raise ValueError('Non-finite semantic vector: ' + text)
    norm = numpy.linalg.norm(vector)
    if norm > 0:
        return vector, 'whole-word' if model.get_word_id(text) >= 0 else 'subword'
    # This fallback covers the 17 two-kanji compounds with zero raw vectors in
    # the tested bank. Do not silently guess a representation for other cases.
    if (len(text) == 2 and all('\u4e00' <= char <= '\u9fff' and model.get_word_id(char) >= 0 for char in text)):
        parts = [model.get_word_vector(char) for char in text]
        if all(numpy.isfinite(part).all() and numpy.linalg.norm(part) > 0 for part in parts):
            return numpy.mean(parts, axis=0), 'mean-of-kanji'
    raise ValueError('No usable semantic vector: ' + text)


def build_export(bank, similarities, methods):
    ids = [item['id'] for item in bank]
    if len(set(ids)) != len(ids) or any(item['language'] != 'ja-JP' for item in bank):
        raise ValueError('Expected unique Japanese practice items.')
    if len(methods) != len(bank) or len(similarities) != len(bank):
        raise ValueError('Every word needs a representation and similarity row.')
    inputs = [{key: item[key] for key in ['id', 'language', 'text', 'label']} for item in bank]
    entries = {}
    for index, item in enumerate(bank):
        row = similarities[index]
        if len(row) != len(bank) or any(not isinstance(score, (float, int)) or not -1 <= score <= 1 for score in row):
            raise ValueError('Expected a finite cosine score for every word pair.')
        neighbors = [[other, round(float(row[position]), 8)] for position, other in enumerate(ids) if other != item['id']]
        neighbors.sort(key=lambda neighbor: (-neighbor[1], neighbor[0]))
        entries[item['id']] = {'text': item['text'], 'label': item['label'], 'representation': methods[index], 'neighbors': neighbors}
    return {
        'schemaVersion': 1,
        'language': 'ja-JP',
        'sourceDigest': hashlib.sha256(canonical(inputs).encode()).hexdigest(),
        'model': {'id': MODEL_ID, 'revision': MODEL_REVISION, 'sha256': MODEL_SHA256,
                  'dimension': 300, 'license': 'CC-BY-SA-3.0', 'input': 'Japanese surface spelling',
                  'zeroVectorFallback': 'Mean constituent vectors for two-kanji words when both kanji are known.'},
        'entries': entries,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--model-file', type=Path, help='Use a locally downloaded, hash-verified model.')
    parser.add_argument('--output', type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument('--offline', action='store_true', help='Require the pinned model in the local Hugging Face cache.')
    args = parser.parse_args()
    import fasttext
    import numpy as np
    if args.model_file:
        model_file = args.model_file
    else:
        from huggingface_hub import hf_hub_download
        model_file = Path(hf_hub_download(MODEL_ID, 'model.bin', revision=MODEL_REVISION, local_files_only=args.offline))
    with model_file.open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != MODEL_SHA256:
            raise ValueError('Model bytes do not match the selected pinned model.')
    model = fasttext.load_model(str(model_file))
    bank = load_bank()
    represented = [represent_word(model, item['text'], np) for item in bank]
    vectors = np.array([value[0] for value in represented])
    norms = np.linalg.norm(vectors, axis=1)
    if not np.isfinite(vectors).all() or (norms <= 0).any():
        raise ValueError('All semantic vectors must be finite and nonzero.')
    normalized = vectors.astype(np.float64) / norms[:, None]
    similarities = np.clip(normalized @ normalized.T, -1, 1).tolist()
    output = build_export(bank, similarities, [value[1] for value in represented])
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(canonical(output) + '\n', encoding='utf-8')
    print(f"Generated {len(bank)} Japanese semantic rankings: {args.output}")


if __name__ == '__main__':
    main()
