"""Cuts the raw screen recording into narrated scenes and joins them into the demo video.

    python scripts/video/build-video.py

Inputs (in video-out/): raw.mp4 (screen recording), narration/<id>.mp3 + durations.json.
Output: video-out/warden-demo.mp4 (1920x1080, H.264 + AAC, narration only, no music).
"""
import json
import pathlib
import subprocess

import imageio_ffmpeg

ROOT = pathlib.Path(__file__).resolve().parents[2]
OUT = ROOT / "video-out"
WORK = OUT / "scenes"
WORK.mkdir(exist_ok=True)
FF = imageio_ffmpeg.get_ffmpeg_exe()
LINES = {l["id"]: l for l in json.loads((pathlib.Path(__file__).parent / "narration.json").read_text(encoding="utf-8"))}
DUR = json.loads((OUT / "narration" / "durations.json").read_text(encoding="utf-8"))

FONT = "C\\:/Windows/Fonts/segoeui.ttf"
FONT_B = "C\\:/Windows/Fonts/segoeuib.ttf"
FONT_L = "C\\:/Windows/Fonts/segoeuil.ttf"
INK, PAPER, AMBER = "0x1B1F27", "0xF6F4EF", "0xB7791F"
LEAD, TAIL = 0.35, 0.65  # silence before and after each narration line

# Crops of the 1920x1080 recording (screen pixels; the Jira sidebar ends at x=467). Each keeps 16:9.
# Every crop stays clear of the orange automation glow along the screen edges.
FULL = "crop=1888:1062:14:12"
PAGE = "crop=1424:801:474:74"  # the Warden page without the Jira sidebar and top bar
RECEIPT = "crop=1424:801:474:210"  # lower, so the receipt's buttons stay in frame
ROVO = "crop=1424:801:474:100"  # the Warden page and the Rovo panel side by side

# scene id -> (crop, [(source in, source out), ...]) in seconds of raw.mp4
SCENES = {
    "idea": (FULL, [(5.5, 15.0)]),
    "mandate": (PAGE, [(20.0, 47.0)]),
    "cleared": (ROVO, [(162.0, 166.5), (173.0, 175.5), (179.0, 181.5), (187.0, 196.0)]),
    "risky": (ROVO, [(202.5, 206.0), (210.0, 212.5), (220.5, 223.5), (228.0, 234.0), (248.0, 251.0), (256.0, 263.0)]),
    "insist": (ROVO, [(264.5, 282.0)]),
    "receipt": (RECEIPT, [(297.0, 318.0)]),
    "simulate": (PAGE, [(327.0, 353.0)]),
    "graph": (PAGE, [(111.0, 128.0)]),
    "ledger": (PAGE, [(367.0, 378.0), (381.0, 384.5)]),
}
ORDER = ["hook", "idea", "mandate", "cleared", "risky", "insist", "receipt", "simulate", "graph", "ledger", "close"]


def run(args):
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-y", *args], check=True)


def text_file(name, text):
    p = WORK / f"{name}.txt"
    p.write_text(text, encoding="utf-8")
    return str(p).replace("\\", "/").replace(":", "\\:")


# The screen sits in a frame on the paper background; the caption gets its own band underneath,
# so it never covers a button.
SW, SH, SX, SY = 1680, 945, 120, 26


def frame_filter(sid):
    f = text_file(f"cap-{sid}", LINES[sid]["caption"])
    return (
        f"scale={SW}:{SH}:flags=lanczos,pad=1920:1080:{SX}:{SY}:color={PAPER},"
        f"drawbox=x={SX - 1}:y={SY - 1}:w={SW + 2}:h={SH + 2}:color=0xD6D1C6:t=1,"
        f"drawtext=fontfile='{FONT}':textfile='{f}':fontcolor={INK}:fontsize=36:"
        f"x=(w-text_w)/2:y={SY + SH}+(1080-{SY + SH}-text_h)/2"
    )


def audio_inputs(sid, length):
    return ["-i", str(OUT / "narration" / f"{sid}.mp3")], (
        f"[1:a]volume=6dB,adelay={int(LEAD * 1000)}|{int(LEAD * 1000)},apad,atrim=0:{length:.3f},"
        "aformat=sample_rates=48000:channel_layouts=stereo[a]"
    )


def build_scene(sid):
    length = DUR[sid] + LEAD + TAIL
    crop, parts = SCENES[sid]
    source = sum(b - a for a, b in parts)
    speed = source / length
    chains = [f"[0:v]trim={a}:{b},setpts=PTS-STARTPTS[p{i}]" for i, (a, b) in enumerate(parts)]
    joined = "".join(f"[p{i}]" for i in range(len(parts)))
    look = f"{crop}," if crop else ""
    video = (
        f"{joined}concat=n={len(parts)}:v=1:a=0,{look}"
        f"setpts=PTS/{speed:.4f},fps=30,tpad=stop_mode=clone:stop_duration=5,trim=0:{length:.3f},"
        f"{frame_filter(sid)},fade=t=in:st=0:d=0.25,format=yuv420p[v]"
    )
    a_in, a_chain = audio_inputs(sid, length)
    out = WORK / f"{sid}.mp4"
    run(["-i", str(OUT / "raw.mp4"), *a_in, "-filter_complex", ";".join([*chains, video, a_chain]),
         "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "slow", "-crf", "18",
         "-c:a", "aac", "-b:a", "192k", "-r", "30", str(out)])
    print(f"{sid}: {source:.1f}s source -> {length:.1f}s ({speed:.2f}x)")
    return out


def build_card(sid, lines):
    """Title and closing cards: warm paper background, ink type, one amber rule."""
    length = DUR[sid] + LEAD + TAIL
    draws = [f"drawbox=x=160:y=470:w=6:h=150:color={AMBER}:t=fill"]
    for i, (text, font, size, color, y) in enumerate(lines):
        f = text_file(f"card-{sid}-{i}", text)
        draws.append(f"drawtext=fontfile='{font}':textfile='{f}':fontcolor={color}:fontsize={size}:x=200:y={y}")
    video = (
        f"color=c={PAPER}:s=1920x1080:r=30:d={length:.3f}[bg];[bg]{','.join(draws)},"
        f"fade=t=in:st=0:d=0.4,fade=t=out:st={length - 0.4:.3f}:d=0.4,format=yuv420p[v]"
    )
    a_in, a_chain = audio_inputs(sid, length)
    a_chain = a_chain.replace("[1:a]", "[0:a]")
    out = WORK / f"{sid}.mp4"
    run([*a_in, "-filter_complex", f"{video};{a_chain}", "-map", "[v]", "-map", "[a]",
         "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-c:a", "aac", "-b:a", "192k", "-r", "30", str(out)])
    print(f"{sid}: card {length:.1f}s")
    return out


def main():
    clips = []
    for sid in ORDER:
        if sid == "hook":
            clips.append(build_card("hook", [
                ("Warden", FONT_B, 120, INK, 455),
                ("A policy firewall for Rovo agents in Jira", FONT_L, 52, INK, 610),
                ("The model proposes. Plain code decides.", FONT, 34, AMBER, 700),
            ]))
        elif sid == "close":
            clips.append(build_card("close", [
                ("Warden", FONT_B, 120, INK, 455),
                ("Let agents work, without handing them the keys.", FONT_L, 52, INK, 610),
                ("Rovo agent  ·  MCP  ·  Teamwork Graph  ·  Atlassian Forge", FONT, 32, AMBER, 700),
                ("github.com/MuhammadNabiyev/warden", FONT, 30, "0x5B616E", 760),
            ]))
        else:
            clips.append(build_scene(sid))
    listing = WORK / "list.txt"
    listing.write_text("".join(f"file '{c.as_posix()}'\n" for c in clips), encoding="utf-8")
    final = OUT / "warden-demo.mp4"
    run(["-f", "concat", "-safe", "0", "-i", str(listing), "-c", "copy", "-movflags", "+faststart", str(final)])
    print("done:", final)


if __name__ == "__main__":
    main()
