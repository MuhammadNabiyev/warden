"""Generates one MP3 per narration line with a free Microsoft Edge neural voice (default en-GB-RyanNeural).

    pip install edge-tts imageio-ffmpeg
    python scripts/make-narration-edge.py [voice] [outDir]

Writes <outDir>/<id>.mp3 and durations.json, the inputs record-demo.mjs and mux-narration.mjs expect.
"""
import asyncio
import json
import pathlib
import re
import subprocess
import sys

import edge_tts
import imageio_ffmpeg

VOICE = sys.argv[1] if len(sys.argv) > 1 else "en-GB-RyanNeural"
OUT = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else "narration")
RATE = "-4%"

lines = json.loads((pathlib.Path(__file__).parent / "narration.json").read_text(encoding="utf-8"))
OUT.mkdir(parents=True, exist_ok=True)
ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()


def duration(path: pathlib.Path) -> float:
    info = subprocess.run([ffmpeg, "-hide_banner", "-i", str(path)], capture_output=True, text=True).stderr
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", info)
    return int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3]) if m else 4.0


async def main() -> None:
    durations = {}
    for line in lines:
        mp3 = OUT / f"{line['id']}.mp3"
        await edge_tts.Communicate(line["say"], VOICE, rate=RATE).save(str(mp3))
        durations[line["id"]] = duration(mp3)
        print(line["id"], f"{durations[line['id']]:.2f}s")
    (OUT / "durations.json").write_text(json.dumps(durations, indent=2), encoding="utf-8")


asyncio.run(main())
