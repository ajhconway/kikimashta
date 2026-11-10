"""Make the portable Sites source use exact production component bytes.

Run after copying this demo into the existing Site checkout. The only generated
configuration differences are TS paths and removal of the local snapshot ignore.
No application markup, CSS, or illustration is recreated.
"""
from pathlib import Path
import hashlib,json,shutil,sys

repo=Path(__file__).resolve().parents[2]
site=Path(sys.argv[1]).resolve()
snapshot=site/'shared-app'
snapshot.mkdir(exist_ok=True)
for folder in ['src','content']:
    shutil.copytree(repo/folder,snapshot/folder,dirs_exist_ok=True)
for name in ['tsconfig.json','LICENSE','NOTICE']:
    if (repo/name).exists():shutil.copy2(repo/name,snapshot/name)
records=[]
for path in sorted(snapshot.rglob('*')):
    if path.is_file():records.append({'path':str(path.relative_to(snapshot)),'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
(site/'app-source-provenance.json').write_text(json.dumps({'sourceRepository':'https://github.com/ajhconway/kikimashta','files':records},indent=2)+'\n')
(site/'tsconfig.json').write_text(json.dumps({'extends':'./shared-app/tsconfig.json','compilerOptions':{'paths':{'@app/*':['./shared-app/src/*']}},'include':['source/**/*.ts','source/**/*.tsx','vite.config.ts']},indent=2)+'\n')
ignore=site/'.gitignore'
ignore.write_text(ignore.read_text().replace('shared-app/\n',''))
print(f'Preserved {len(records)} shared production source files with hashes.')
