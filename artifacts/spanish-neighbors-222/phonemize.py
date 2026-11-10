"""Prepare auditable es-419 IPA with pinned eSpeak-NG; no synthesis or API calls."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import unicodedata

OUT = Path(__file__).resolve().parent
SOURCE_COMMIT = '4870adfa25b1a32b4361592f1be8a40337c58d6c'


def phoneme_units(ipa):
    words = ipa.strip().split()
    result = []
    for index, word in enumerate(words):
        if index:
            result.append('|')
        for unit in word.split('_'):
            if not unit:
                continue
            # eSpeak supplies phone boundaries. Keep a multi-codepoint phone as one unit.
            while unit.startswith(('ˈ', 'ˌ')):
                if unit[0] == 'ˈ':
                    result.append('ˈ')
                unit = unit[1:]
            if unit:
                result.append(unit)
    if not result:
        raise ValueError('Empty IPA output.')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--binary', required=True, type=Path)
    parser.add_argument('--data-prefix', required=True, type=Path)
    parser.add_argument('--source-dir', required=True, type=Path)
    args = parser.parse_args()
    actual_source = subprocess.check_output(['git', '-C', str(args.source_dir), 'rev-parse', 'HEAD'], text=True).strip()
    if actual_source != SOURCE_COMMIT:
        raise ValueError('Wrong pinned eSpeak source revision.')
    subprocess.run(['git', '-C', str(args.source_dir), 'diff', '--exit-code', 'HEAD'], check=True, capture_output=True)
    version = subprocess.run([str(args.binary), '--version'], check=True, capture_output=True, text=True)
    if '1.52.0' not in version.stdout:
        raise ValueError('Wrong eSpeak binary version.')
    bank = json.loads((OUT / 'bank.json').read_text())
    benchmark = json.loads((OUT / 'benchmark.json').read_text())
    texts = sorted(set([item['text'] for item in bank] + [probe[field] for probe in benchmark['phoneticProbes'] for field in ['left', 'right']]))
    def transcribe(text):
        normalized = unicodedata.normalize('NFC', text).strip().casefold()
        command = [str(args.binary), f'--path={args.data_prefix}', '-q', '--ipa=1', '-v', 'es-419', normalized]
        output = subprocess.run(command, check=True, capture_output=True, text=True)
        if output.stderr.strip():
            raise ValueError('Phonemizer diagnostic: ' + output.stderr.strip())
        ipa = output.stdout.strip()
        units = phoneme_units(ipa)
        if units.count('|') != len(normalized.split()) - 1:
            raise ValueError('Unexpected word-boundary count: ' + text + ' -> ' + ipa)
        return {'text': text, 'normalized': normalized, 'ipa': ipa, 'units': units}
    entries = {text: transcribe(text) for text in texts}
    if entries != {text: transcribe(text) for text in texts}:
        raise ValueError('Nondeterministic phonetic transcriptions.')
    files = {'binary': args.binary}
    for name in ['phondata', 'phonindex', 'phontab', 'intonations', 'es_dict', 'lang/roa/es-419', 'lang/roa/es']:
        files['data/' + name] = args.data_prefix / 'espeak-ng-data' / name
    hashes = {}
    for name, path in files.items():
        with path.open('rb') as stream:
            hashes[name] = hashlib.file_digest(stream, 'sha256').hexdigest()
    report = {'schemaVersion': 1, 'language': 'es-419', 'tool': {'id': 'espeak-ng', 'version': '1.52.0', 'sourceCommit': SOURCE_COMMIT,
        'source': f'https://github.com/espeak-ng/espeak-ng/tree/{SOURCE_COMMIT}', 'license': 'GPL-3.0-or-later',
        'flags': ['-q', '--ipa=1', '-v', 'es-419'], 'build': {'USE_LIBPCAUDIO': False, 'USE_LIBSONIC': False, 'USE_MBROLA': False, 'USE_SPEECHPLAYER': False, 'USE_KLATT': False}, 'sourceHashes': hashes},
        'recipe': 'NFC/casefold; eSpeak explicit phone boundaries; preserve primary stress as a token and lexical word boundary as |; ignore secondary stress; no dictionary overrides',
        'repeatIdentical': True, 'entries': entries}
    (OUT / 'phonetic-source.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'words': len(bank), 'distinctTextsIncludingProbes': len(texts), 'repeatIdentical': True}), flush=True)


if __name__ == '__main__':
    main()
