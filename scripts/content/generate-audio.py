#!/usr/bin/env python3
"""Regenerate the small Japanese bank with Open JTalk and an attributed voice.

Requires Open JTalk 1.11, its UTF-8 dictionary, HTS Voice NIT ATR503 M001
1.05, and ffmpeg. The engine/model are local build inputs, not app dependencies.
"""

import argparse
from pathlib import Path
import subprocess
import tempfile


WORDS = {
    "cat": "ねこ",
    "dog": "いぬ",
    "apple": "りんご",
    "banana": "バナナ",
    "umbrella": "かさ",
    "cup": "コップ",
}

# Trim only the outside silence, preserving pauses inside words (e.g. コップ).
AUDIO_FILTER = (
    "silenceremove=start_periods=1:start_duration=0.02:start_threshold=-55dB,"
    "areverse,"
    "silenceremove=start_periods=1:start_duration=0.02:start_threshold=-55dB,"
    "areverse,adelay=80,apad=pad_dur=0.12,"
    "asetpts=N/SR/TB,aresample=48000,asetnsamples=n=1152:p=1"
)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--binary", required=True, type=Path)
    parser.add_argument("--dictionary", required=True, type=Path)
    parser.add_argument("--voice", required=True, type=Path)
    parser.add_argument("--output", type=Path, default=Path("public/audio"))
    args = parser.parse_args()
    for path in (args.binary, args.dictionary, args.voice):
        if not path.exists():
            parser.error(f"Missing input: {path}")
    args.output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="kikimashta-audio-") as directory:
        for item_id, text in WORDS.items():
            wav = Path(directory) / f"{item_id}.wav"
            subprocess.run(
                [str(args.binary.resolve()), "-x", str(args.dictionary.resolve()),
                 "-m", str(args.voice.resolve()), "-r", "1.0", "-ow", str(wav)],
                input=text + "\n", text=True, check=True,
            )
            target = args.output / f"{item_id}.mp3"
            subprocess.run(
                ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(wav),
                 "-af", AUDIO_FILTER, "-ac", "1", "-codec:a", "libmp3lame", "-q:a", "4",
                 str(target)],
                check=True,
            )
            print(target)


if __name__ == "__main__":
    main()
