#!/usr/bin/env python3
"""Edit the existing Nexus clips into one short film with two interaction cuts.

Usage: python3 scripts/build_reception_film.py SOURCE_DIRECTORY OUTPUT_DIRECTORY
Outputs film.mp4 and the three playback parts used around nickname and photo.
The video track is silent: general and personalized WAVs are synchronized by TV.
"""

from pathlib import Path
import subprocess
import sys


PHASES = (
    ("before-nickname", (
        ("detection.mp4", 0, 4),
        ("2 iniciando scaneo.mp4", 0, 4),
        ("revelacion de identidad.mp4", 0, 5),
        ("Nickname requerimiento.mp4", 0, 5),
    )),
    ("before-photo", (("solicitud de foto.mp4", 0, 14),)),
    ("after-photo", (
        ("Avatar creado con exito.mp4", 0, 7),
        ("calibration-nexus9.mp4", 0, 5),
        ("player-unlocked-nexus9.mp4", 6, 9),
    )),
)


def run(*args: str) -> None:
    subprocess.run(args, check=True)


def concat(parts: list[Path], destination: Path) -> None:
    list_file = destination.with_suffix(".txt")
    list_file.write_text("".join(f"file '{part.as_posix()}'\n" for part in parts))
    run("ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
        "-i", str(list_file), "-c", "copy", "-movflags", "+faststart", str(destination))
    list_file.unlink()


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Usage: build_reception_film.py SOURCE_DIRECTORY OUTPUT_DIRECTORY")
    source, output = Path(sys.argv[1]), Path(sys.argv[2])
    output.mkdir(parents=True, exist_ok=True)
    phases: list[Path] = []
    for phase_name, clips in PHASES:
        parts: list[Path] = []
        for index, (filename, start, duration) in enumerate(clips):
            input_file = source / filename
            if not input_file.is_file():
                raise FileNotFoundError(input_file)
            part = output / f"{phase_name}-{index}.mp4"
            run("ffmpeg", "-y", "-loglevel", "error", "-ss", str(start),
                "-t", str(duration), "-i", str(input_file),
                "-vf", "fps=24,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p",
                "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "24",
                "-profile:v", "main", "-level", "3.1", "-movflags", "+faststart", str(part))
            parts.append(part)
        phase = output / f"{phase_name}.mp4"
        concat(parts, phase)
        phases.append(phase)
        for part in parts:
            part.unlink()
    concat(phases, output / "film.mp4")


if __name__ == "__main__":
    main()
