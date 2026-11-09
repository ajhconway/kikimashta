"""Read one verified canonical copy while preserving historical approval paths (#195)."""
import hashlib
import json
import re
from pathlib import Path


def source_file(root, source, sha256=None, size=None):
    root = Path(root)
    relative = Path(source)
    if relative.is_absolute() or '..' in relative.parts:
        raise ValueError('Unsafe artwork source path')

    def checked_path(path):
        current = root
        for part in Path(path).parts:
            current /= part
            if current.is_symlink():
                raise ValueError('Artwork source contains a symlink')
            current.lstat()
        return current

    try:
        path = checked_path(source)
    except FileNotFoundError as missing:
        registry = json.loads((root / 'artifacts/artwork-aliases.json').read_text())
        alias = registry.get('aliases', {}).get(source)
        if (registry.get('version') != 1 or not alias
                or not re.fullmatch(r'artifacts/card-regeneration/batch-\d{2}/[a-zA-Z0-9_.-]+\.png', alias['path'])
                or not re.fullmatch(r'[a-f0-9]{64}', alias['sha256'])
                or type(alias['bytes']) is not int or alias['bytes'] <= 0
                or (sha256 is not None and sha256 != alias['sha256'])
                or (size is not None and size != alias['bytes'])):
            raise ValueError('Unverified artwork alias') from missing
        path = checked_path(alias['path'])
        sha256, size = alias['sha256'], alias['bytes']
    raw = path.read_bytes()
    if ((sha256 is not None and hashlib.sha256(raw).hexdigest() != sha256)
            or (size is not None and len(raw) != size)):
        raise ValueError('Artwork source hash or size mismatch')
    return path
