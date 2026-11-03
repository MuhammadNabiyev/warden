"""Finds a primary (Atlassian blue) button in a screenshot, so the recording can click it with the
real mouse without touching the page through automation.

    python find-button.py snap.png X0 Y0 X1 Y1 [first|last]

Prints "x y" (screen pixels) of the centre of the first or last blue button inside the box.
"""
import sys

import numpy as np
from PIL import Image

path, x0, y0, x1, y1 = sys.argv[1], *map(int, sys.argv[2:6])
which = sys.argv[6] if len(sys.argv) > 6 else "last"
img = np.asarray(Image.open(path).convert("RGB")).astype(int)[y0:y1, x0:x1]
r, g, b = img[..., 0], img[..., 1], img[..., 2]
blue = (b > 180) & (r < 60) & (g > 70) & (g < 130)  # #0C66E4 and its hover shades

rows = blue.sum(axis=1) >= 60  # a button row has a long run of blue
bands, start = [], None
for y, on in enumerate(list(rows) + [False]):
    if on and start is None:
        start = y
    elif not on and start is not None:
        if y - start >= 14:
            bands.append((start, y))
        start = None
if not bands:
    sys.exit("no button")
top, bottom = bands[0] if which == "first" else bands[-1]
cols = np.where(blue[top:bottom].sum(axis=0) > (bottom - top) // 2)[0]
print(x0 + int((cols.min() + cols.max()) / 2), y0 + (top + bottom) // 2)
