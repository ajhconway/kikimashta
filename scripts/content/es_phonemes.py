"""Prepare pinned eSpeak-NG es-419 transcriptions for Spanish word neighbors (#222)."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import unicodedata

ROOT = Path(__file__).resolve().parents[2]
SOURCE_COMMIT = '4870adfa25b1a32b4361592f1be8a40337c58d6c'


def canonical(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', required=True, type=Path)
    parser.add_argument('--data-prefix', required=True, type=Path)
    parser.add_argument('--source-dir', required=True, type=Path)
    parser.add_argument('--output', type=Path, default=ROOT / 'content/pronunciation-neighbors/es.json')
    args = parser.parse_args()
    if subprocess.check_output(['git', '-C', str(args.source_dir), 'rev-parse', 'HEAD'], text=True).strip() != SOURCE_COMMIT:
        raise ValueError('Wrong pinned eSpeak source revision.')
    subprocess.run(['git', '-C', str(args.source_dir), 'diff', '--exit-code', 'HEAD'], check=True, capture_output=True)
    version = subprocess.run([str(args.binary), '--version'], check=True, capture_output=True, text=True)
    if '1.52.0' not in version.stdout:
        raise ValueError('Wrong eSpeak binary version.')
    script = "import {spanishNeighborBank} from './scripts/content/spanish-neighbor-utils.mjs'; console.log(JSON.stringify(spanishNeighborBank(process.cwd())));"
    bank = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script], cwd=ROOT, text=True))
    if any('reading' in item for item in bank):
        raise ValueError('Spanish reading overrides require explicit transcription preparation.')
    probe_file = ROOT / 'content/pronunciation-neighbors/es-probes.json'
    probes = json.loads(probe_file.read_text())['probes']
    inputs = [{key: item[key] for key in ['id', 'language', 'text']} for item in bank]
    texts = sorted(set([item['text'] for item in bank] + [probe[field] for probe in probes for field in ['left', 'right']]))
    def transcribe(text):
        normalized = unicodedata.normalize('NFC', text).strip().casefold()
        result = subprocess.run([str(args.binary), f'--path={args.data_prefix}', '-q', '--ipa=1', '-v', 'es-419', normalized], check=True, capture_output=True, text=True)
        if result.stderr.strip() or not result.stdout.strip():
            raise ValueError('Unexpected phonemizer output: ' + text + ' ' + result.stderr)
        ipa = result.stdout.strip()
        if len(ipa.split()) != len(normalized.split()):
            raise ValueError('Unexpected lexical boundary count: ' + text)
        return {'normalized': normalized, 'ipa': ipa}
    entries = {text: transcribe(text) for text in texts}
    if entries != {text: transcribe(text) for text in texts}:
        raise ValueError('Nonrepeatable Spanish phoneme output.')
    files = {'binary': args.binary}
    for name in ['phondata', 'phonindex', 'phontab', 'intonations', 'es_dict', 'lang/roa/es-419', 'lang/roa/es']:
        files['data/' + name] = args.data_prefix / 'espeak-ng-data' / name
    for name in ['dictsource/es_rules', 'dictsource/es_list', 'phsource/ph_spanish']:
        files['source/' + name] = args.source_dir / name
    hashes = {name: hashlib.sha256(path.read_bytes()).hexdigest() for name, path in files.items()}
    report = {'schemaVersion': 1, 'language': 'es-419',
        'sourceDigest': hashlib.sha256(canonical(inputs).encode()).hexdigest(),
        'recipeSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'probesSha256': hashlib.sha256(probe_file.read_bytes()).hexdigest(),
        'tool': {'id': 'espeak-ng', 'version': '1.52.0', 'sourceCommit': SOURCE_COMMIT,
            'source': f'https://github.com/espeak-ng/espeak-ng/tree/{SOURCE_COMMIT}', 'license': 'GPL-3.0-or-later',
            'flags': ['-q', '--ipa=1', '-v', 'es-419'], 'sourceHashes': hashes},
        'recipe': 'NFC/casefold; pinned es-419 IPA with explicit phone boundaries; canonicalization occurs in spanish-pronunciation.ts; no dictionary overrides',
        'repeatIdentical': True, 'entries': entries}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(f'Generated pinned Spanish transcriptions for {len(bank)} words and {len(texts)} distinct texts including probes: {args.output}')


if __name__ == '__main__':
    main()
