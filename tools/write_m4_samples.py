#!/usr/bin/env python3
"""Decode public/audio/weapons/m4_*.wav.b64 → .wav (no ffmpeg)."""
from pathlib import Path
import base64
root = Path(__file__).resolve().parents[1] / "public" / "audio" / "weapons"
root.mkdir(parents=True, exist_ok=True)
for p in sorted(root.glob("m4_*.wav.b64")):
    out = Path(str(p)[:-4])  # strip .b64
    out.write_bytes(base64.b64decode(p.read_text().strip()))
    print("wrote", out, out.stat().st_size)
