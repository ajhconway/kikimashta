"""Record separate clips for the real ContextualQuiz sentence/question player."""
import json,pathlib,subprocess,tempfile
ROOT=pathlib.Path(__file__).resolve().parent
items=json.loads((ROOT/'source/questions.json').read_text())
out=ROOT/'public/audio';out.mkdir(exist_ok=True,parents=True)
clips=[]
with tempfile.TemporaryDirectory(prefix='kikimashta-250-audio-v2-') as task_tmp:
    for item in items:
        for part,key in [('sentence','kana'),('question','questionKana')]:
            if not item.get(key):continue
            original=pathlib.Path(task_tmp)/f"{item['id']}-{part}.aiff"
            subprocess.run(['say','-v','Kyoko','-r','155','-o',str(original),item[key]],check=True)
            destination=out/f"{item['id']}-{part}.mp3"
            subprocess.run(['ffmpeg','-y','-v','error','-i',str(original),'-af','loudnorm=I=-22:TP=-2:LRA=7',
                '-ar','44100','-ac','1','-codec:a','libmp3lame','-b:a','96k',str(destination)],check=True)
            duration=float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of',
                'default=noprint_wrappers=1:nokey=1',str(destination)],text=True))
            if duration<.5:raise RuntimeError('Invalid audio duration')
            clips.append({'id':item['id'],'part':part,'text':item[key],'path':str(destination.relative_to(ROOT)),
                'durationSeconds':duration})
            print(f"{item['id']}-{part}: {duration:.2f}s",flush=True)
(ROOT/'audio-provenance-v2.json').write_text(json.dumps({'voice':'macOS Kyoko (ja_JP)','rate':155,
    'sentenceQuestionPauseMs':650,'pauseOwner':'production ContextualQuiz component','targetLufs':-22,'clips':clips},ensure_ascii=False,indent=2)+'\n')
