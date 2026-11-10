"""Generate the demo's fixed Japanese clips with installed macOS Kyoko speech.

Run on macOS with say and ffmpeg installed: python3 generate-audio.py
The sentence and question are separated by 650 ms of silence. Kana text fixes
the intended readings of 一つ, 二つ, 七つ, 九つ, 大人, 上, and 大した.
"""
import json
import pathlib
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent
items = json.loads(subprocess.check_output([
    'node', '--input-type=module', '-e',
    "import {questions} from './dist/questions.js'; console.log(JSON.stringify(questions));"
], cwd=ROOT, text=True))
out = ROOT / 'dist' / 'audio'
out.mkdir(exist_ok=True)
provenance = []
with tempfile.TemporaryDirectory(prefix='kikimashta-250-audio-') as task_tmp:
    for item in items:
        sentence = pathlib.Path(task_tmp) / 'sentence.aiff'
        subprocess.run(['say', '-v', 'Kyoko', '-r', '155', '-o', str(sentence), item['kana']], check=True)
        inputs = ['-i', str(sentence)]
        if item.get('questionKana'):
            question = pathlib.Path(task_tmp) / 'question.aiff'
            subprocess.run(['say', '-v', 'Kyoko', '-r', '155', '-o', str(question), item['questionKana']], check=True)
            inputs += ['-f', 'lavfi', '-t', '0.65', '-i', 'anullsrc=r=22050:cl=mono', '-i', str(question)]
            filters = '[0:a][1:a][2:a]concat=n=3:v=0:a=1,loudnorm=I=-22:TP=-2:LRA=7'
        else:
            filters = 'loudnorm=I=-22:TP=-2:LRA=7'
        destination = out / f"{item['id']}.mp3"
        subprocess.run(['ffmpeg', '-y', '-v', 'error', *inputs, '-filter_complex', filters,
                        '-ar', '44100', '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '96k', str(destination)], check=True)
        duration = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                           '-of', 'default=noprint_wrappers=1:nokey=1', str(destination)], text=True))
        if duration < 0.5:
            raise RuntimeError(f"Empty or invalid audio for {item['id']}")
        provenance.append({'id': item['id'], 'sentence': item['kana'], 'question': item.get('questionKana'), 'durationSeconds': duration})
        print(f"{item['id']}: {duration:.2f}s")
(ROOT / 'audio-provenance.json').write_text(json.dumps({'voice': 'macOS Kyoko (ja_JP)', 'rate': 155,
    'sentenceQuestionPauseMs': 650, 'targetLufs': -22, 'clips': provenance}, ensure_ascii=False, indent=2) + '\n')
