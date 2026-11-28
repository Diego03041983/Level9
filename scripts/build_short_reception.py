"""Build the three short Nexus registration films with embedded narration.

Usage: python3 scripts/build_short_reception.py SOURCE_DIRECTORY OUTPUT_DIRECTORY
The source directory contains nexus-registration-01..04.wav and
alta-con-audio-v3/{before-nickname-generic,before-photo,after-photo}.mp4.
Per-player *-name.wav files in alta-con-audio-v3 produce personalized intros.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path


def run(*args: str) -> None:
    subprocess.run(args, check=True)


def duration(path: Path) -> float:
    result = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], text=True
    )
    return float(result.strip())


def join_audio(parts: list[Path], output: Path) -> None:
    inputs = [item for part in parts for item in ("-i", str(part))]
    filters = ";".join(f"[{index}:a]aresample=48000,asetpts=PTS-STARTPTS[a{index}]" for index in range(len(parts)))
    filters += ";" + "".join(f"[a{index}]" for index in range(len(parts))) + f"concat=n={len(parts)}:v=0:a=1[out]"
    run("ffmpeg", "-y", "-loglevel", "error", *inputs, "-filter_complex", filters,
        "-map", "[out]", "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", str(output))


def film(source_video: Path, narration: Path, output: Path, *, start: float = 0) -> dict[str, object]:
    seconds = duration(narration) + 0.45
    run("ffmpeg", "-y", "-loglevel", "error", "-ss", str(start), "-i", str(source_video), "-i", str(narration),
        "-map", "0:v:0", "-map", "1:a:0",
        "-vf", "fps=24,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p,tpad=stop_mode=clone:stop_duration=3",
        "-af", "apad=pad_dur=0.45", "-t", f"{seconds:.3f}",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "25", "-profile:v", "baseline", "-level", "3.1",
        "-maxrate", "1800k", "-bufsize", "3600k", "-c:a", "aac", "-ar", "48000", "-ac", "2", "-b:a", "128k",
        "-movflags", "+faststart", str(output))
    return {"file": str(output), "durationMs": round(duration(output) * 1000), "embeddedAudio": True}


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    source = Path(sys.argv[1]).expanduser().resolve()
    output = Path(sys.argv[2]).expanduser().resolve()
    output.mkdir(parents=True, exist_ok=True)
    old = source / "alta-con-audio-v3"
    voices = [source / f"nexus-registration-0{index}.wav" for index in range(1, 5)]
    for path in [*voices, old / "before-nickname-generic.mp4", old / "before-photo.mp4", old / "after-photo.mp4"]:
        if not path.is_file():
            raise FileNotFoundError(path)

    manifest: dict[str, object] = {"generic": {}, "players": {}}
    generic_audio = output / "intro-generic.wav"
    join_audio(voices[:2], generic_audio)
    manifest["generic"]["DETECTION"] = film(old / "before-nickname-generic.mp4", generic_audio, output / "intro-generic.mp4")
    manifest["generic"]["NICKNAME_CONFIRMED"] = film(old / "before-photo.mp4", voices[2], output / "nickname-confirmed.mp4")
    manifest["generic"]["AVATAR_PROCESSING"] = film(old / "after-photo.mp4", voices[3], output / "avatar-activated.mp4", start=51)

    for name in sorted(old.glob("*-name.wav")):
        participant_id = name.name.removesuffix("-name.wav")
        if len(participant_id) != 36:
            continue
        combined = output / f"intro-{participant_id}.wav"
        join_audio([voices[0], name, voices[1]], combined)
        manifest["players"][participant_id] = film(old / "before-nickname-generic.mp4", combined, output / f"intro-{participant_id}.mp4")

    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"Built {len(manifest['players'])} personalized introductions and 3 generic scenes in {output}")


if __name__ == "__main__":
    main()
