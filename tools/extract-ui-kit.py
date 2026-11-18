"""Cut the lobby's UI pieces out of the painted kit sheet into one atlas.

    python tools/extract-ui-kit.py

Reads assets/source/ui/lobby-kit.png (the painted sheet, transparent), wipes the sample text off the pieces whose
text the game draws itself (blending across it from the clean inside either side), and writes
assets/ui/lobby-kit.png with src/data/lobby-kit.ts, the atlas's layout: per piece its cell in the atlas, its body
(the solid shape inside the glow, relative to the cell) and, for pieces stretched along their length, where the
stretchable middle starts and ends. It also writes assets/ui/lobby-kit-gold.png, the same atlas with only its gold
(in white, as opaque as each pixel is gold), which the glints light up.
"""

import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'source', 'ui', 'lobby-kit.png')
OUT = os.path.join(ROOT, 'assets', 'ui', 'lobby-kit.png')
GOLD = os.path.join(ROOT, 'assets', 'ui', 'lobby-kit-gold.png')
TS = os.path.join(ROOT, 'src', 'data', 'lobby-kit.ts')

GLOW = 7

# name: crop (x0, y0, x1, y1), body (x0, y0, x1, y1), wipes [(x0, y0, x1, y1)], stretch (x0, x1)
# All in sheet pixels. PLAY's body is its gold capsule, under the crest.
PIECES = {
    'name': ((6, 4, 472, 152), (17, 13, 464, 146), [(166, 24, 384, 106)], (200, 380)),
    'quickHistory': ((26, 151, 288, 232), (33, 158, 281, 228), [], None),
    'quickRanking': ((26, 231, 288, 312), (33, 238, 281, 308), [], None),
    'quickGuide': ((26, 311, 288, 392), (33, 318, 280, 388), [], None),
    'badgeHistory': ((26, 151, 112, 235), (33, 158, 105, 229), [], None),
    'badgeRanking': ((26, 231, 112, 315), (33, 238, 105, 309), [], None),
    'badgeGuide': ((26, 311, 112, 395), (33, 318, 105, 389), [], None),
    'counterStage': ((1153, 12, 1328, 72), (1159, 18, 1322, 66), [(1234, 22, 1300, 62)], (1240, 1296)),
    'counterTrophy': ((1327, 12, 1534, 72), (1333, 18, 1528, 66), [(1422, 22, 1500, 62)], (1428, 1496)),
    'online': ((1571, 11, 1763, 70), (1577, 17, 1757, 65), [], None),
    'offline': ((1574, 73, 1764, 133), (1580, 79, 1758, 127), [], None),
    'stage': ((662, 468, 1078, 532), (668, 472, 1072, 528), [(704, 478, 1036, 522)], (720, 1020)),
    'arrow': ((584, 465, 632, 529), (589, 469, 627, 524), [], None),
    'bar': ((89, 572, 706, 696), (95, 580, 706, 690), [(170, 594, 652, 676)], (200, 640)),
    'play': ((698, 552, 1068, 708), (716, 586, 1052, 694), [], None),
    'panel': ((23, 704, 304, 791), (29, 710, 298, 785), [], None),
    'orbCharacters': ((24, 800, 101, 874), (30, 806, 95, 868), [], None),
    'orbMaps': ((111, 800, 185, 874), (117, 806, 179, 868), [], None),
    'orbProfile': ((195, 800, 269, 874), (201, 806, 263, 868), [], None),
    'orbSettings': ((279, 800, 353, 874), (285, 806, 347, 868), [], None),
    'friendProfile': ((368, 803, 436, 871), (374, 809, 430, 865), [], None),
    'friendAdd': ((445, 803, 512, 871), (451, 809, 506, 865), [], None),
    'friendRequests': ((523, 803, 589, 871), (529, 809, 583, 865), [], None),
    'toggleOn': ((1215, 710, 1294, 756), (1221, 716, 1288, 750), [], None),
    'toggleOff': ((1302, 710, 1379, 756), (1308, 716, 1373, 750), [], None),
}

# Pieces that overlap others on the sheet keep only their own shape: rounded boxes, ellipses and polygons
# (sheet pixels), feathered at the edge.
MASKS = {
    'badgeHistory': [('ellipse', (31, 156, 107, 231), 0)],
    'badgeRanking': [('ellipse', (31, 236, 107, 311), 0)],
    'badgeGuide': [('ellipse', (31, 316, 107, 391), 0)],
    'play': [
        ('round', (704, 576, 1064, 704), 64),
        ('poly', (880, 553, 925, 583, 925, 600, 880, 620, 838, 600, 838, 583), 0),
    ],
}

# Circles (sheet pixels: centre and radius) in pieces whose insides the glint leaves alone.
NO_GLINT = {'name': (105, 75, 45)}


def mask_for(name, crop):
    """An alpha mask (0-1) keeping only the piece's own shapes, or None for a piece that needs none."""
    if name not in MASKS:
        return None
    x0, y0, x1, y1 = crop
    m = Image.new('L', (x1 - x0, y1 - y0), 0)
    d = ImageDraw.Draw(m)
    for kind, pts, r in MASKS[name]:
        if kind == 'poly':
            d.polygon([(pts[i] - x0, pts[i + 1] - y0) for i in range(0, len(pts), 2)], fill=255)
            continue
        a, b, c, e = pts
        box = (a - x0, b - y0, c - x0, e - y0)
        if kind == 'round':
            d.rounded_rectangle(box, r, fill=255)
        else:
            d.ellipse(box, fill=255)
    m = m.filter(ImageFilter.GaussianBlur(2))
    return np.array(m, np.float32) / 255


def gold_mask(rgba):
    """The gold of a piece as a white picture whose alpha is how gold each pixel is (bright, warm, opaque), for the
    glint that runs along the trim."""
    rgb = rgba[:, :, :3].astype(np.float32) / 255
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    warm = np.clip((r - b) * 2.2, 0, 1) * np.clip((g - b) * 3, 0, 1)
    bright = np.clip((mx - 0.5) / 0.35, 0, 1)
    pale = np.clip((mn - 0.8) / 0.15, 0, 1)  # near-white highlights on the gold
    k = np.maximum(warm * bright * np.clip(sat * 2, 0, 1), pale * bright)
    k = k * (rgba[:, :, 3].astype(np.float32) / 255)
    out = np.zeros_like(rgba)
    out[:, :, :3] = 255
    out[:, :, 3] = np.round(np.clip(k, 0, 1) * 255).astype(np.uint8)
    return out


def main():
    sheet = np.array(Image.open(SRC).convert('RGBA'))
    cells = {}
    for name, (crop, _body, wipes, _stretch) in PIECES.items():
        x0, y0, x1, y1 = crop
        piece = sheet[y0:y1, x0:x1].copy()
        for wx0, wy0, wx1, wy1 in wipes:
            # Blend from the clean column just left of the text to the one just right of it, row by row.
            a = sheet[wy0:wy1, wx0 - 1].astype(np.float32)
            b = sheet[wy0:wy1, wx1].astype(np.float32)
            k = np.linspace(0, 1, wx1 - wx0, dtype=np.float32)[None, :, None]
            fill = a[:, None, :] * (1 - k) + b[:, None, :] * k
            piece[wy0 - y0 : wy1 - y0, wx0 - x0 : wx1 - x0] = np.round(fill).astype(np.uint8)
        keep = mask_for(name, crop)
        if keep is not None:
            piece[:, :, 3] = np.round(piece[:, :, 3] * keep).astype(np.uint8)
        cells[name] = piece
    # Shelf-pack the pieces, tallest first.
    width = 1024
    order = sorted(cells, key=lambda n: -cells[n].shape[0])
    x = y = shelf = 0
    spots = {}
    for name in order:
        h, w = cells[name].shape[:2]
        if x + w > width:
            x, y, shelf = 0, y + shelf + 2, 0
        spots[name] = (x, y)
        x += w + 2
        shelf = max(shelf, h)
    atlas = np.zeros((y + shelf, width, 4), np.uint8)
    for name, (ax, ay) in spots.items():
        h, w = cells[name].shape[:2]
        atlas[ay : ay + h, ax : ax + w] = cells[name]
    Image.fromarray(atlas).save(OUT, optimize=True)
    gold = gold_mask(atlas)
    # The sample face in the plate's ring isn't gold: the game draws the player's avatar over it.
    for name, (cx, cy, r) in NO_GLINT.items():
        ax, ay = spots[name]
        x0, y0 = PIECES[name][0][:2]
        yy, xx = np.mgrid[0 : gold.shape[0], 0 : gold.shape[1]]
        gold[(xx - (ax + cx - x0)) ** 2 + (yy - (ay + cy - y0)) ** 2 < r * r, 3] = 0
    Image.fromarray(gold).save(GOLD, optimize=True)
    layout = {}
    for name, (crop, body, _wipes, stretch) in PIECES.items():
        ax, ay = spots[name]
        h, w = cells[name].shape[:2]
        entry = {'x': ax, 'y': ay, 'w': w, 'h': h,
                 'bx': body[0] - crop[0], 'by': body[1] - crop[1],
                 'bw': body[2] - body[0], 'bh': body[3] - body[1]}
        if stretch:
            entry['s0'] = stretch[0] - crop[0]
            entry['s1'] = stretch[1] - crop[0]
        layout[name] = entry
    with open(TS, 'w') as f:
        f.write('// Generated by tools/extract-ui-kit.py from assets/source/ui/lobby-kit.png: don\'t hand-edit.\n')
        f.write("import type { KitPiece } from '@/types';\n\n")
        f.write('/** Where each of the lobby kit\'s pieces sits in `assets/ui/lobby-kit.png`, ')
        f.write('and its body inside it. */\n')
        f.write('export const LOBBY_KIT: Record<string, KitPiece> = ')
        f.write(json.dumps(layout, indent=4).replace('"', "'"))
        f.write(';\n')
    print('atlas', atlas.shape[1], 'x', atlas.shape[0])


if __name__ == '__main__':
    main()
