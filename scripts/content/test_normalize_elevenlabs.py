"""Behavior checks for local volume matching (#86); no provider calls."""
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import wave


SPEC = importlib.util.spec_from_file_location("normalize_elevenlabs", Path(__file__).with_name("normalize-elevenlabs.py"))
audio = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(audio)
FFMPEG = os.environ.get("FFMPEG") or shutil.which("ffmpeg")


class FixtureBase(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="kikimashta-normalize-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.source = self.root / "source"
        self.output = self.root / "delivery"
        self.source.mkdir()

    def record(self, content=b"fixture", **overrides):
        record = {"id": "ja-test", "voice": "otani", "voiceId": "provider-id", "voiceName": "Otani", "text": "ねこ", "spelling": "猫", "meaning": "Cat", "file": "originals/otani/ja-test.mp3", "sha256": hashlib.sha256(content).hexdigest(), "bytes": len(content), "requestId": "request-test"}
        record.update(overrides)
        return record

    def write_manifest(self, records):
        (self.source / "originals.jsonl").write_text("".join(json.dumps(record) + "\n" for record in records))

    def put_original(self, record, content):
        path = self.source / record["file"]
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)


class ProvenanceTests(FixtureBase):
    def test_invalid_identity_hash_duplicate_and_traversal_fail_before_output_or_ffmpeg(self):
        valid = self.record()
        self.put_original(valid, b"fixture")
        for records in [[self.record(sha256="0" * 64)], [valid, valid], [self.record(file="../escape.mp3")], [self.record(id="../escape")], [self.record(text="")]]:
            with self.subTest(records=records):
                self.write_manifest(records)
                with patch.object(audio.subprocess, "run") as run:
                    with self.assertRaises(audio.NormalizationError):
                        audio.normalize_batch(self.source, self.output, "unused-ffmpeg")
                    run.assert_not_called()
                self.assertFalse(self.output.exists())

    def test_original_symlink_escape_is_rejected(self):
        outside = self.root / "outside.mp3"
        outside.write_bytes(b"fixture")
        record = self.record()
        path = self.source / record["file"]
        path.parent.mkdir(parents=True)
        path.symlink_to(outside)
        self.write_manifest([record])
        with self.assertRaisesRegex(audio.NormalizationError, "escapes"):
            audio.normalize_batch(self.source, self.output, "unused-ffmpeg")
        self.assertFalse(self.output.exists())

    def test_same_root_is_rejected(self):
        with self.assertRaisesRegex(audio.NormalizationError, "must differ"):
            audio.normalize_batch(self.source, self.source, "unused-ffmpeg")


@unittest.skipUnless(FFMPEG, "Set FFMPEG to run real MP3 measurement/encoding checks")
class MediaTests(FixtureBase):
    def make_clip(self, item_id, amplitude=0.1, duration=0.8, pulse=False, silent=False):
        frames = round(duration * audio.RATE)
        wav_path = self.root / f"{item_id}.wav"
        with wave.open(str(wav_path), "wb") as handle:
            handle.setnchannels(1)
            handle.setsampwidth(2)
            handle.setframerate(audio.RATE)
            values = []
            for index in range(frames):
                level = amplitude
                if pulse:
                    level = 0.85 if 2000 <= index < 2022 else 0.0001
                value = 0 if silent else round(math.sin(2 * math.pi * 750 * index / audio.RATE) * level * 32767)
                values.append(struct.pack("<h", value))
            handle.writeframes(b"".join(values))
        path = self.source / f"originals/otani/{item_id}.mp3"
        path.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run([FFMPEG, "-v", "error", "-nostdin", "-n", "-i", str(wav_path), "-c:a", "libmp3lame", "-b:a", "128k", str(path)], capture_output=True, check=True)
        record = self.record(path.read_bytes(), id=item_id, file=str(path.relative_to(self.source)))
        return record

    def run_batch(self, records, **kwargs):
        self.write_manifest(records)
        result = audio.normalize_batch(self.source, self.output, FFMPEG, workers=2, **kwargs)
        return result, audio.read_jsonl(self.output / "deliveries.jsonl")

    def test_matches_distinct_levels_preserves_originals_frames_and_provenance_and_resumes(self):
        originals = [self.make_clip("ja-quiet", 0.05), self.make_clip("ja-loud", 0.3)]
        source_bytes = {(record["voice"], record["id"]): (self.source / record["file"]).read_bytes() for record in originals}
        result, deliveries = self.run_batch(originals)
        self.assertEqual(result["clips"], 2)
        self.assertEqual(result["targetLimited"], 0)
        self.assertGreater(abs(deliveries[0]["before"]["integratedLufs"] - deliveries[1]["before"]["integratedLufs"]), 10)
        for record in deliveries:
            self.assertAlmostEqual(record["after"]["integratedLufs"], -22, delta=0.25)
            self.assertLessEqual(record["after"]["truePeakDbtp"], -2)
            self.assertEqual(record["voiceName"], "Otani")
            self.assertEqual(record["requestId"], "request-test")
            self.assertEqual((self.source / record["originalFile"]).read_bytes(), source_bytes[(record["voice"], record["id"])])
            self.assertEqual(audio.decode(FFMPEG, self.output / record["file"]), record["decodedFrames"])
        with patch.object(audio, "normalize_one", side_effect=AssertionError("Verified deliveries must not be rendered again")):
            resumed = audio.normalize_batch(self.source, self.output, FFMPEG)
        self.assertEqual(resumed["resumed"], 2)
        self.assertEqual(len(audio.read_jsonl(self.output / "deliveries.jsonl")), 2)

    def test_short_clip_uses_analysis_padding_and_delivery_retains_duration(self):
        original = self.make_clip("ja-short", amplitude=0.1, duration=0.15)
        result, deliveries = self.run_batch([original])
        self.assertEqual(result["shortClipMeasurements"], 1)
        record = deliveries[0]
        self.assertTrue(record["before"]["analysisPadding"])
        self.assertEqual(record["before"]["measurementMethod"], "r128-analysis-padded-to-500ms")
        self.assertEqual(record["decodedFrames"], audio.decode(FFMPEG, self.source / original["file"]))
        self.assertLess(record["decodedFrames"], audio.RATE // 2)
        self.assertAlmostEqual(record["after"]["integratedLufs"], -22, delta=0.25)

    def test_high_crest_is_peak_limited_and_flagged_without_clipping(self):
        original = self.make_clip("ja-transient", pulse=True)
        result, deliveries = self.run_batch([original], max_boost=24)
        self.assertEqual(result["targetLimited"], 1)
        record = deliveries[0]
        self.assertIn("true_peak_headroom", record["limitingReasons"])
        self.assertLess(record["after"]["integratedLufs"], -22.25)
        self.assertLessEqual(record["after"]["truePeakDbtp"], -2)

    def test_discontinuous_encoded_measurements_keep_a_quieter_safe_trial_and_flag_it(self):
        original = self.make_clip("ja-meter-jump")
        self.write_manifest([original])
        calls = 0
        def discontinuous_measure(_ffmpeg, _path, _frames, _profile):
            nonlocal calls
            calls += 1
            loudness = -21.07 if calls == 1 else (-22.6 if calls % 2 == 0 else -21.0)
            return {"integratedLufs": loudness, "truePeakDbtp": -6.0, "measurementMethod": "r128", "analysisPadding": False}
        with patch.object(audio, "measure", side_effect=discontinuous_measure):
            result = audio.normalize_batch(self.source, self.output, FFMPEG)
        self.assertEqual(result["targetLimited"], 1)
        record = audio.read_jsonl(self.output / "deliveries.jsonl")[0]
        self.assertIn("encoded_loudness_resolution", record["limitingReasons"])
        self.assertEqual(record["after"]["integratedLufs"], -22.6)
        self.assertLessEqual(record["after"]["truePeakDbtp"], -2)
        self.assertEqual(record["decodedFrames"], audio.decode(FFMPEG, self.source / original["file"]))

    def test_silent_original_is_not_delivered(self):
        original = self.make_clip("ja-silent", silent=True)
        self.write_manifest([original])
        with self.assertRaisesRegex(audio.NormalizationError, "no usable signal"):
            audio.normalize_batch(self.source, self.output, FFMPEG)
        self.assertEqual(audio.read_jsonl(self.output / "deliveries.jsonl"), [])
        self.assertFalse((self.output / "otani/ja-silent.mp3").exists())

    def test_resume_rejects_corruption_changed_profile_and_changed_request(self):
        original = self.make_clip("ja-resume")
        self.run_batch([original])
        with self.assertRaisesRegex(audio.NormalizationError, "settings changed"):
            audio.normalize_batch(self.source, self.output, FFMPEG, target=-23)
        self.write_manifest([{**original, "text": "いぬ"}])
        with self.assertRaisesRegex(audio.NormalizationError, "settings changed"):
            audio.normalize_batch(self.source, self.output, FFMPEG)
        self.write_manifest([original])
        (self.output / "otani/ja-resume.mp3").write_bytes(b"corrupted")
        with patch.object(audio, "normalize_one", side_effect=AssertionError("Must reject before rendering")):
            with self.assertRaisesRegex(audio.NormalizationError, "integrity mismatch"):
                audio.normalize_batch(self.source, self.output, FFMPEG)

    def test_recovers_published_output_when_journal_append_was_interrupted(self):
        original = self.make_clip("ja-recover")
        self.run_batch([original])
        (self.output / "deliveries.jsonl").write_text("")
        with patch.object(audio, "normalize_one", side_effect=AssertionError("Recovery should reuse verified output")):
            result = audio.normalize_batch(self.source, self.output, FFMPEG)
        self.assertEqual(result["clips"], 1)
        self.assertEqual(len(audio.read_jsonl(self.output / "deliveries.jsonl")), 1)

    def test_recovers_pending_audio_when_publication_was_interrupted(self):
        original = self.make_clip("ja-pending")
        self.run_batch([original])
        destination = self.output / "otani/ja-pending.mp3"
        destination.rename(self.root / "removed-delivery.mp3")
        (self.output / "deliveries.jsonl").write_text("")
        with patch.object(audio, "normalize_one", side_effect=AssertionError("Pending audio should be recoverable")):
            result = audio.normalize_batch(self.source, self.output, FFMPEG)
        self.assertEqual(result["clips"], 1)
        self.assertTrue(destination.is_file())

    def test_recovers_truncated_final_journal_append_and_preserves_raw_journal(self):
        originals = [self.make_clip("ja-one"), self.make_clip("ja-two")]
        self.run_batch(originals)
        journal = self.output / "deliveries.jsonl"
        first_line = journal.read_text().splitlines()[0]
        interrupted = first_line + '\n{"id":"ja-'
        journal.write_text(interrupted)
        with patch.object(audio, "normalize_one", side_effect=AssertionError("Pending records should recover without rendering")):
            result = audio.normalize_batch(self.source, self.output, FFMPEG)
        self.assertEqual(result["clips"], 2)
        self.assertEqual(len(audio.read_jsonl(journal)), 2)
        backups = list(self.output.glob("deliveries.jsonl.interrupted-*.txt"))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_text(), interrupted)


if __name__ == "__main__":
    unittest.main()
