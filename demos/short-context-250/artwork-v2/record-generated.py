"""Preserve original imagegen bytes and exact source metadata; never alter pixels."""
from pathlib import Path
import hashlib, json, shutil, sys
from PIL import Image

root=Path(__file__).resolve().parent
identifier, original_path=sys.argv[1:]
original=Path(original_path)
destination=root/'originals'/f'{identifier}-v1.png'
destination.parent.mkdir(exist_ok=True)
if destination.exists() and destination.read_bytes()!=original.read_bytes():
    raise RuntimeError('Preserve earlier variants instead of overwriting')
shutil.copy2(original,destination)
with Image.open(destination) as image:
    alpha=image.convert('RGBA').getchannel('A')
    record={'id':identifier,'sourcePath':str(original),'original':str(destination.relative_to(root)),
        'sha256':hashlib.sha256(destination.read_bytes()).hexdigest(),'width':image.width,'height':image.height,
        'alphaExtrema':alpha.getextrema(),'transparentPixels':sum(n for value,n in enumerate(alpha.histogram()) if value==0),
        'status':'pending-owner-review','visualReview':'pending'}
(root/f'{identifier}-record.json').write_text(json.dumps(record,indent=2)+'\n')
print(json.dumps(record))
