"""Cut the pencil figure sheets into single views for the Body tab.

Each sheet is one wide image with the same figure drawn three times: front, side, back. This finds
the two widest blank columns between the figures, crops each figure with a little paper around it,
and writes public/figures/<sex>/<key>-<view>.webp. Every view keeps the sheet's full height so the
feet sit on the same line in all of them.

    python3 scripts/slice-figures.py <sheet dir>

The sheet dir holds <sex>/<key>.png, where key is one of A B C D1 D2 D3 E1 E2 E3 (see KEYS in
public/figures.js for what each one means).
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

KEYS = ['A', 'B', 'C', 'D1', 'D2', 'D3', 'E1', 'E2', 'E3']
VIEWS = ['front', 'side', 'back']
OUT = Path(__file__).resolve().parent.parent / 'public' / 'figures'
HEIGHT = 720  # output height in pixels


def ink_columns(img):
    """True for each column that has drawing in it, ignoring paper grain and the floor line."""
    g = np.asarray(img.convert('L').filter(ImageFilter.GaussianBlur(2)), dtype=np.float32)
    h = g.shape[0]
    body = g[: int(h * 0.94)]  # skip the shared floor line at the bottom
    paper = np.median(body)
    dark = (paper - body) > 28
    return dark.sum(axis=0) > 3


def runs(mask, value):
    out, start = [], None
    for i, v in enumerate(list(mask) + [not value]):
        if v == value and start is None:
            start = i
        elif v != value and start is not None:
            out.append((start, i))
            start = None
    return out


def split(img):
    cols = ink_columns(img)
    first = int(np.argmax(cols))
    last = len(cols) - int(np.argmax(cols[::-1]))
    gaps = [g for g in runs(cols[first:last], False)]
    gaps = sorted(gaps, key=lambda g: g[1] - g[0], reverse=True)[:2]
    if len(gaps) < 2:
        raise ValueError('could not find two gaps between the figures')
    cuts = sorted(first + (a + b) // 2 for a, b in gaps)
    edges = [0, *cuts, img.width]
    boxes = []
    for i in range(3):
        seg = cols[edges[i]: edges[i + 1]]
        ink = np.nonzero(seg)[0]
        a, b = edges[i] + ink[0], edges[i] + ink[-1] + 1
        pad = 18
        boxes.append((max(edges[i], a - pad), 0, min(edges[i + 1], b + pad), img.height))
    return boxes


def main(src):
    for sex in ['male', 'female']:
        for key in KEYS:
            path = Path(src) / sex / f'{key}.png'
            if not path.exists():
                print('missing', path)
                continue
            img = Image.open(path).convert('RGB')
            (OUT / sex).mkdir(parents=True, exist_ok=True)
            for view, box in zip(VIEWS, split(img)):
                part = img.crop(box)
                w = round(part.width * HEIGHT / part.height)
                part = part.resize((w, HEIGHT), Image.LANCZOS)
                dest = OUT / sex / f'{key}-{view}.webp'
                part.save(dest, 'WEBP', quality=80, method=6)
                print(dest.relative_to(OUT.parent), part.size, dest.stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'art')
