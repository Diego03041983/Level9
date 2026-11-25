#!/usr/bin/env python3
"""Generate original, normalized arcade sound effects using only Python stdlib."""

from __future__ import annotations

import math
import shutil
import struct
import subprocess
import wave
from pathlib import Path

RATE = 44_100
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "public" / "assets" / "audio" / "sfx"

SOUNDS: dict[str, tuple[float, tuple[float, ...]]] = {
    "intro": (2.4, (110, 220, 330, 440)),
    "ambient-loop": (4.0, (82.41, 123.47, 164.81)),
    "player-unlocked": (1.2, (261.63, 392, 523.25, 783.99)),
    "roulette-loop": (1.6, (220, 277.18, 329.63, 440)),
    "player-selected": (0.8, (392, 523.25, 783.99)),
    "team-selected": (1.0, (329.63, 493.88, 659.25)),
    "versus-impact": (0.7, (65.41, 98, 196)),
    "countdown-tick": (0.25, (880, 1320)),
    "match-start": (1.0, (220, 440, 880)),
    "victory": (1.8, (261.63, 329.63, 392, 523.25)),
    "mission-alert": (1.2, (146.83, 138.59, 146.83)),
    "access-denied": (0.9, (196, 174.61, 146.83)),
    "access-granted": (1.4, (261.63, 392, 523.25, 1046.5)),
    "treasure-unlocked": (2.2, (196, 293.66, 392, 587.33, 783.99)),
    "champion": (2.5, (261.63, 392, 523.25, 659.25, 783.99)),
    "notification": (0.45, (659.25, 987.77)),
    "birthday-celebration": (3.0, (261.63, 261.63, 293.66, 261.63, 349.23, 329.63)),
}


def envelope(position: float, duration: float) -> float:
    attack = min(1.0, position / 0.025)
    release = min(1.0, max(0.0, duration - position) / 0.12)
    return attack * release


def synthesize(path: Path, duration: float, notes: tuple[float, ...]) -> None:
    frames = bytearray()
    note_length = duration / len(notes)
    for sample_index in range(int(duration * RATE)):
        time = sample_index / RATE
        note_index = min(len(notes) - 1, int(time / note_length))
        frequency = notes[note_index]
        local_time = time - note_index * note_length
        value = (
            math.sin(2 * math.pi * frequency * time) * 0.58
            + math.sin(2 * math.pi * frequency * 2 * time) * 0.18
            + math.sin(2 * math.pi * frequency * 0.5 * time) * 0.12
        )
        pulse = 0.88 if math.sin(2 * math.pi * 8 * local_time) > -0.55 else 0.62
        amplitude = int(18_000 * value * pulse * envelope(time, duration))
        frames.extend(struct.pack("<h", max(-32767, min(32767, amplitude))))

    with wave.open(str(path), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(RATE)
        audio.writeframes(frames)


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    ffmpeg = shutil.which("ffmpeg")
    for name, (duration, notes) in SOUNDS.items():
        wav_path = OUTPUT / f"{name}.wav"
        synthesize(wav_path, duration, notes)
        if ffmpeg:
            mp3_path = OUTPUT / f"{name}.mp3"
            subprocess.run(
                [ffmpeg, "-y", "-loglevel", "error", "-i", wav_path, "-codec:a", "libmp3lame", "-q:a", "4", mp3_path],
                check=True,
            )

    print(f"Generated {len(SOUNDS)} original effects in {OUTPUT}")
    print("MP3 conversion available" if ffmpeg else "ffmpeg unavailable; valid WAV files retained")


if __name__ == "__main__":
    main()

