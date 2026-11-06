#!/usr/bin/env python3
"""Match local ElevenLabs card recordings without changing provider originals (#86).

Reads originals.jsonl from --input (or --manifest), writes <voice>/<id>.mp3 and
deliveries.jsonl under --output. Resume verifies hashes and request identity before
skipping completed work. This command makes no network requests.
"""
import argparse
from array import array
from concurrent.futures import ThreadPoolExecutor
import fcntl
from functools import lru_cache
import hashlib
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import threading


PROFILE_VERSION = 1
RATE = 44100
TOLERANCE = 0.25
SAFE_MARGIN = 0.2
SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*\Z")
HASH = re.compile(r"[a-f0-9]{64}\Z")


class NormalizationError(ValueError):
    """Invalid media, provenance, or resume state; provider files remain intact."""


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def read_jsonl(path):
    if not path.exists():
        return []
    records = []
    for line_number, line in enumerate(path.read_text().splitlines(), 1):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as error:
            raise NormalizationError(f"Invalid JSON in {path.name}, line {line_number}.") from error
        if not isinstance(value, dict):
            raise NormalizationError(f"Expected an object in {path.name}, line {line_number}.")
        records.append(value)
    return records


def recover_delivery_journal(path):
    """Preserve and repair only a final append interrupted before its newline."""
    if not path.exists():
        return []
    raw = path.read_bytes()
    if not raw or raw.endswith(b"\n"):
        return read_jsonl(path)
    lines = raw.splitlines()
    records = []
    for index, line in enumerate(lines):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except (json.JSONDecodeError, UnicodeDecodeError) as error:
            if index != len(lines) - 1:
                raise NormalizationError("Invalid interior delivery journal record.") from error
            break
        if not isinstance(value, dict):
            raise NormalizationError("Invalid delivery journal record.")
        records.append(value)
    backup = path.with_name(f"{path.name}.interrupted-{sha256(raw)[:12]}.txt")
    if not backup.exists():
        with backup.open("xb") as handle:
            handle.write(raw)
    # The raw interrupted journal is retained above; verified pending records
    # recover any incomplete append after the complete prefix is restored.
    path.write_text("".join(canonical(record) + "\n" for record in records))
    return records


def inside(root, relative):
    if not isinstance(relative, str) or not relative or "\\" in relative:
        raise NormalizationError("Invalid media path.")
    path = Path(relative)
    if path.is_absolute() or any(part in (".", "..") for part in relative.split("/")):
        raise NormalizationError("Media paths must be safe relative paths.")
    resolved = (root / path).resolve()
    if not resolved.is_relative_to(root):
        raise NormalizationError("Media path escapes its root.")
    return resolved


def validate_originals(root, records):
    seen = set()
    for record in records:
        if not all(isinstance(record.get(key), str) and SLUG.fullmatch(record[key]) for key in ("id", "voice")):
            raise NormalizationError("Invalid item or voice slug.")
        key = (record["voice"], record["id"])
        if key in seen:
            raise NormalizationError(f"Duplicate original recording: {key}.")
        seen.add(key)
        expected = f"originals/{record['voice']}/{record['id']}.mp3"
        if record.get("file") != expected:
            raise NormalizationError(f"Unexpected original filename: {record.get('file')}.")
        if not isinstance(record.get("text"), str) or not record["text"].strip():
            raise NormalizationError("Original recording has no spoken text.")
        if not isinstance(record.get("voiceId"), str) or not record["voiceId"].strip():
            raise NormalizationError("Original recording has no provider voice ID.")
        if not isinstance(record.get("sha256"), str) or not HASH.fullmatch(record["sha256"]):
            raise NormalizationError("Original recording has an invalid hash.")
        if not isinstance(record.get("bytes"), int) or isinstance(record["bytes"], bool) or record["bytes"] <= 0:
            raise NormalizationError("Original recording has an invalid byte length.")
        data = inside(root, record["file"]).read_bytes()
        if len(data) != record["bytes"] or sha256(data) != record["sha256"]:
            raise NormalizationError(f"Original integrity mismatch: {record['file']}.")


def decode(ffmpeg, path):
    """Full decode, keeping floats so very quiet audio is not rounded to silence."""
    result = subprocess.run([ffmpeg, "-hide_banner", "-v", "error", "-nostdin", "-threads", "1", "-i", str(path),
                             "-map", "0:a:0", "-ar", str(RATE), "-ac", "1", "-f", "f32le", "-"], capture_output=True, check=True)
    if result.stderr or not result.stdout or len(result.stdout) % 4:
        raise NormalizationError(f"Audio did not decode cleanly: {path.name}.")
    samples = array("f")
    samples.frombytes(result.stdout)
    if sys.byteorder != "little":
        samples.byteswap()
    if not all(math.isfinite(value) for value in samples) or max(map(abs, samples)) <= 0.000001:
        raise NormalizationError(f"Audio has no usable signal: {path.name}.")
    return len(samples)


@lru_cache(maxsize=4)
def ffmpeg_version(ffmpeg):
    result = subprocess.run([ffmpeg, "-version"], capture_output=True, text=True, check=True)
    return result.stdout.splitlines()[0]


def measure(ffmpeg, path, frames, profile):
    # R128 needs a 400 ms integration block. For shorter clips, pad analysis only
    # to 500 ms; never add silence to the delivery. Before/after use the same rule.
    padded = frames < RATE // 2
    filters = "apad=whole_dur=0.5," if padded else ""
    filters += f"loudnorm=I={profile['targetLufs']}:TP={profile['truePeakCeilingDbtp']}:LRA=11:dual_mono=true:print_format=json"
    result = subprocess.run([ffmpeg, "-hide_banner", "-nostdin", "-threads", "1", "-i", str(path), "-af", filters,
                             "-f", "null", "-"], capture_output=True, text=True, check=True)
    matches = re.findall(r'\{\s*"input_i".*?\}', result.stderr, re.S)
    if not matches:
        raise NormalizationError(f"Missing loudness measurement: {path.name}.")
    data = json.loads(matches[-1])
    values = {"integratedLufs": float(data["input_i"]), "truePeakDbtp": float(data["input_tp"])}
    if not all(math.isfinite(value) for value in values.values()):
        raise NormalizationError(f"Unmeasurable loudness: {path.name}.")
    return {**values, "measurementMethod": "r128-analysis-padded-to-500ms" if padded else "r128", "analysisPadding": padded}


def normalize_one(source_root, output_root, original, profile, ffmpeg):
    source = inside(source_root, original["file"])
    relative = f"{original['voice']}/{original['id']}.mp3"
    destination = inside(output_root, relative)
    if destination.exists():
        raise NormalizationError(f"Unjournaled output exists; refusing overwrite: {relative}.")
    frames = decode(ffmpeg, source)
    before = measure(ffmpeg, source, frames, profile)
    peak_bound = profile["truePeakCeilingDbtp"] - SAFE_MARGIN - before["truePeakDbtp"]
    gain = min(profile["targetLufs"] - before["integratedLufs"], profile["maxBoostDb"], peak_bound)
    trials = []
    reasons = set()
    safe_trials = []
    with tempfile.TemporaryDirectory(prefix="kikimashta-normalize-") as temporary:
        for attempt in range(12):
            trial = Path(temporary) / f"attempt-{attempt}.mp3"
            subprocess.run([ffmpeg, "-hide_banner", "-v", "error", "-nostdin", "-n", "-threads", "1", "-i", str(source),
                            "-map", "0:a:0", "-af", f"volume={gain:.8f}dB:precision=double", "-c:a", "libmp3lame", "-b:a", "128k",
                            "-ar", str(RATE), "-ac", "1", "-map_metadata", "-1", str(trial)], capture_output=True, check=True)
            after = measure(ffmpeg, trial, frames, profile)
            trials.append({"gainDb": round(gain, 8), **after})
            if after["truePeakDbtp"] <= profile["truePeakCeilingDbtp"]:
                safe_trials.append((trial, gain, after))
            else:
                reasons.add("true_peak_headroom")
            difference = profile["targetLufs"] - after["integratedLufs"]
            if abs(difference) <= 0.1 and after["truePeakDbtp"] <= profile["truePeakCeilingDbtp"]:
                break
            adjustment = min(difference, profile["maxBoostDb"] - gain,
                             profile["truePeakCeilingDbtp"] - SAFE_MARGIN - after["truePeakDbtp"])
            if difference > TOLERANCE:
                if profile["maxBoostDb"] - gain < difference:
                    reasons.add("maximum_gain")
                if profile["truePeakCeilingDbtp"] - SAFE_MARGIN - after["truePeakDbtp"] < difference:
                    reasons.add("true_peak_headroom")
            if abs(adjustment) < 0.01 or attempt == 11:
                break
            next_gain = gain + adjustment
            quieter = [candidate for candidate in safe_trials if candidate[2]["integratedLufs"] < profile["targetLufs"]]
            louder = [candidate for candidate in safe_trials if candidate[2]["integratedLufs"] > profile["targetLufs"]]
            if quieter and louder:
                quiet_gain = max(quieter, key=lambda candidate: candidate[2]["integratedLufs"])[1]
                loud_gain = min(louder, key=lambda candidate: candidate[2]["integratedLufs"])[1]
                midpoint = (quiet_gain + loud_gain) / 2
                if not any(abs(midpoint - item["gainDb"]) < 0.00001 for item in trials):
                    next_gain = min(midpoint, profile["maxBoostDb"], gain + profile["truePeakCeilingDbtp"] - SAFE_MARGIN - after["truePeakDbtp"])
            gain = next_gain
        if not safe_trials:
            raise NormalizationError(f"No encoded trial meets the peak ceiling: {relative}.")
        # MP3 quantization can make short transient peaks non-monotonic with
        # gain. Keep the closest safe trial, rather than blindly the last trial.
        trial, gain, after = min(safe_trials, key=lambda candidate: abs(candidate[2]["integratedLufs"] - profile["targetLufs"]))
        if abs(after["integratedLufs"] - profile["targetLufs"]) > TOLERANCE:
            quieter = [candidate for candidate in safe_trials if candidate[2]["integratedLufs"] < profile["targetLufs"]]
            if quieter:
                trial, gain, after = max(quieter, key=lambda candidate: candidate[2]["integratedLufs"])
                if not reasons:
                    # Very short voiced sounds can cross an R128 gating boundary
                    # between MP3 encodes. Preserve a quieter safe trial and make
                    # that bounded-search limitation explicit for listening review.
                    reasons.add("encoded_loudness_resolution")
        limited = after["integratedLufs"] < profile["targetLufs"] - TOLERANCE and bool(reasons)
        if after["truePeakDbtp"] > profile["truePeakCeilingDbtp"] or (not limited and abs(after["integratedLufs"] - profile["targetLufs"]) > TOLERANCE):
            raise NormalizationError(f"Delivered loudness/peak verification failed: {relative}.")
        delivered_frames = decode(ffmpeg, trial)
        if delivered_frames != frames:
            raise NormalizationError(f"Decoded duration changed: {relative}.")
        data = trial.read_bytes()
        if sha256(source.read_bytes()) != original["sha256"]:
            raise NormalizationError(f"Original changed during processing: {original['file']}.")
        record = {**original, "file": relative, "originalFile": original["file"], "originalSha256": original["sha256"],
                  "sourceRecordSha256": sha256(canonical(original).encode()), "profile": profile, "gainDb": round(gain, 8),
                  "before": before, "after": after, "decodedFrames": frames, "deliverySha256": sha256(data), "deliveryBytes": len(data),
                  "targetLimited": limited, "limitingReasons": sorted(reasons) if limited else [], "encodingTrials": trials, "ffmpegVersion": ffmpeg_version(ffmpeg)}
        # Save recovery metadata before publishing audio. A crash between audio
        # publication and journal append can then resume without re-encoding.
        pending = inside(output_root, f".pending/{original['voice']}/{original['id']}.json")
        pending.parent.mkdir(parents=True, exist_ok=True)
        pending_audio = pending.with_suffix(".mp3")
        if pending_audio.exists():
            if pending_audio.read_bytes() != data:
                raise NormalizationError(f"Unjournaled pending audio differs: {relative}.")
        else:
            with pending_audio.open("xb") as handle:
                handle.write(data)
                handle.flush()
                os.fsync(handle.fileno())
        with pending.open("x") as handle:
            handle.write(canonical(record) + "\n")
            handle.flush()
            os.fsync(handle.fileno())
        destination.parent.mkdir(parents=True, exist_ok=True)
        with destination.open("xb") as handle:
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        return record


def verify_delivery(output_root, record, original, profile, check_audio=True):
    if record.get("sourceRecordSha256") != sha256(canonical(original).encode()) or record.get("profile") != profile:
        raise NormalizationError("Resume request or normalization settings changed.")
    expected = f"{original['voice']}/{original['id']}.mp3"
    if record.get("file") != expected or record.get("originalFile") != original["file"] or record.get("originalSha256") != original["sha256"]:
        raise NormalizationError("Resume media identity changed.")
    if any(record.get(key) != value for key, value in original.items() if key != "file"):
        raise NormalizationError("Resume request metadata changed.")
    after = record.get("after", {})
    loudness, peak = after.get("integratedLufs"), after.get("truePeakDbtp")
    if not all(isinstance(value, (int, float)) and math.isfinite(value) for value in (loudness, peak)):
        raise NormalizationError("Invalid resume measurement.")
    if peak > profile["truePeakCeilingDbtp"] or (abs(loudness - profile["targetLufs"]) > TOLERANCE and not (record.get("targetLimited") and loudness < profile["targetLufs"])):
        raise NormalizationError("Resume measurement exceeds its profile.")
    if not isinstance(record.get("decodedFrames"), int) or record["decodedFrames"] <= 0:
        raise NormalizationError("Invalid resume frame count.")
    if check_audio:
        data = inside(output_root, expected).read_bytes()
        if record.get("deliverySha256") != sha256(data) or record.get("deliveryBytes") != len(data):
            raise NormalizationError(f"Delivery integrity mismatch: {expected}.")


def normalize_batch(source_root, output_root, ffmpeg, manifest=None, target=-22.0, peak=-2.0, max_boost=9.0, workers=4):
    source_root, output_root = Path(source_root).resolve(), Path(output_root).resolve()
    if source_root == output_root:
        raise NormalizationError("Input and output directories must differ.")
    if not (-70 <= target <= -5 and -9 <= peak <= 0 and 0 <= max_boost <= 24 and 1 <= workers <= 8):
        raise NormalizationError("Invalid loudness, peak, boost, or worker settings.")
    manifest = Path(manifest) if manifest else source_root / "originals.jsonl"
    if not manifest.is_file():
        raise NormalizationError("Originals manifest does not exist.")
    originals = read_jsonl(manifest)
    validate_originals(source_root, originals)
    profile = {"version": PROFILE_VERSION, "targetLufs": target, "truePeakCeilingDbtp": peak, "maxBoostDb": max_boost,
               "rate": RATE, "bitrate": "128k", "dualMono": True, "shortClipAnalysis": "pad-to-500ms-only-for-measurement"}
    output_root.mkdir(parents=True, exist_ok=True)
    with (output_root / ".normalization.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise NormalizationError("Another normalization process owns this output directory.") from error
        journal_path = output_root / "deliveries.jsonl"
        existing = recover_delivery_journal(journal_path)
        done = {}
        original_map = {(record["voice"], record["id"]): record for record in originals}
        for record in existing:
            key = (record.get("voice"), record.get("id"))
            if key not in original_map or key in done:
                raise NormalizationError("Unknown or duplicate delivery record.")
            verify_delivery(output_root, record, original_map[key], profile)
            done[key] = record
        journal_lock = threading.Lock()
        with journal_path.open("a") as journal:
            def append(record):
                with journal_lock:
                    journal.write(canonical(record) + "\n")
                    journal.flush()
                    os.fsync(journal.fileno())
                    done[(record["voice"], record["id"])] = record
                    if len(done) % 100 == 0:
                        print(f"Normalized {len(done)}/{len(originals)} recordings.", file=sys.stderr, flush=True)

            def process(original):
                key = (original["voice"], original["id"])
                if key in done:
                    return
                pending = inside(output_root, f".pending/{original['voice']}/{original['id']}.json")
                if pending.exists():
                    record = json.loads(pending.read_text())
                    verify_delivery(output_root, record, original, profile, check_audio=False)
                    destination = inside(output_root, record.get("file"))
                    if not destination.exists():
                        pending_audio = pending.with_suffix(".mp3")
                        data = pending_audio.read_bytes()
                        if sha256(data) != record.get("deliverySha256") or len(data) != record.get("deliveryBytes"):
                            raise NormalizationError("Pending audio integrity mismatch.")
                        destination.parent.mkdir(parents=True, exist_ok=True)
                        with destination.open("xb") as handle:
                            handle.write(data)
                            handle.flush()
                            os.fsync(handle.fileno())
                    verify_delivery(output_root, record, original, profile)
                else:
                    record = normalize_one(source_root, output_root, original, profile, ffmpeg)
                append(record)

            with ThreadPoolExecutor(max_workers=workers) as pool:
                list(pool.map(process, originals))
        records = [done[(original["voice"], original["id"])] for original in originals]
        summary = {"profile": profile, "clips": len(records), "resumed": len(existing),
                   "targetLimited": sum(record["targetLimited"] for record in records),
                   "shortClipMeasurements": sum(record["before"]["analysisPadding"] for record in records),
                   "originalsPreserved": True, "processing": "Constant gain; each delivered MP3 encoded directly from its provider original. No dynamics compression, trimming, or timing changes."}
        (output_root / "normalization-summary.json").write_text(json.dumps(summary, indent=2) + "\n")
        return summary


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", required=True, type=Path, help="Batch root containing originals.jsonl and originals/<voice>/<id>.mp3")
    parser.add_argument("--output", required=True, type=Path, help="Separate delivery root; existing verified deliveries are resumed")
    parser.add_argument("--manifest", type=Path, help="Override the input originals.jsonl path")
    parser.add_argument("--ffmpeg", default="ffmpeg", help="FFmpeg executable with loudnorm and libmp3lame support")
    parser.add_argument("--target", type=float, default=-22.0, help="Integrated LUFS target, default -22 with dual-mono compensation")
    parser.add_argument("--peak", type=float, default=-2.0, help="Maximum delivered true peak in dBTP, default -2")
    parser.add_argument("--max-boost", type=float, default=9.0, help="Maximum gain increase in dB; bounded clips are flagged, default 9")
    parser.add_argument("--workers", type=int, default=4, help="Local processing workers, 1–8, default 4")
    args = parser.parse_args()
    try:
        print(json.dumps(normalize_batch(args.input, args.output, args.ffmpeg, args.manifest, args.target, args.peak, args.max_boost, args.workers)))
    except (NormalizationError, OSError, subprocess.SubprocessError, json.JSONDecodeError) as error:
        print(f"Normalization stopped: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
