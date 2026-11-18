"""Cut a menu screen's painted pieces out of its transparent mockups into one atlas.

    python tools/extract-screen-kit.py profile

Each screen group (SCREENS below) reads its mockups from assets/source/ui/screens/<name>.png: the painted screen,
transparent round its pieces, kept at 1.5x the size it was drawn at. Pieces are given in that drawing's 2x pixels (the
mockup at twice its size; the tool scales them to the stored 1.5x), so they can be read straight off a 2x view of the
mockup, and so can every place the game puts its own text on them (the screen modules use the same 2x numbers, with
`mockFit` mapping them onto the view). Sample text and numbers on a piece are wiped by filling the box from one clean
column of the piece (each row keeps its colour, so the piece's shading carries across). The tool writes
assets/ui/<group>-kit.png, assets/ui/<group>-kit-gold.png (its gold alone, for the glints) and
src/data/<group>-kit.ts (the layout: per piece its cell and its body, in atlas pixels, as `KitPiece`).
"""

import json
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCREENS_DIR = os.path.join(ROOT, 'assets', 'source', 'ui', 'screens')

# The mockups are stored at 1.5x; pieces are given at 2x.
STORED = 0.75

# group: {piece: (source, body (x0, y0, x1, y1), wipes)}, all at 2x; a wipe is (x0, y0, x1, y1, the clean column x to
# fill it from, an (x, y) point whose colour fills it, 'dark' for the
# middle colour of its darker half, or None to clear it), or ('circle', x, y, r) to cut a round
# hole.
SCREENS = {
    'profile': {
        'title': ('profile-record', (1146, 2, 2340, 219), []),
        'tabsRecord': ('profile-record', (1072, 229, 2466, 371), []),
        'tabsHistory': ('profile-history', (1100, 205, 2360, 350), []),
        'card': (
            'profile-record',
            (134, 90, 1010, 1474),
            [(370, 856, 905, 926, 340), (262, 960, 905, 1060, 240), (355, 1212, 905, 1420, 720)],
        ),
        'tileWins': ('profile-record', (1062, 398, 1839, 590), [(1330, 478, 1810, 572, 1322)]),
        'tileChain': ('profile-record', (1857, 398, 2652, 591), [(2118, 478, 2620, 572, 2110)]),
        'tileFevers': ('profile-record', (2670, 398, 3519, 592), [(2945, 478, 3480, 572, 2937)]),
        'tileFlawless': ('profile-record', (1061, 604, 1840, 794), [(1330, 682, 1810, 778, 1322)]),
        'tileFairies': ('profile-record', (1858, 604, 2652, 794), [(2132, 682, 2620, 778, 2124)]),
        'tileTrophies': ('profile-record', (2671, 604, 3519, 794), [(2932, 676, 3497, 782, 2925)]),
        'tileEndless': (
            'profile-record',
            (1062, 804, 2091, 985),
            [(1330, 878, 2060, 975, 1322), (1700, 862, 2060, 880, 1322)],
        ),
        'fairies': (
            'profile-record',
            (1056, 995, 3388, 1399),
            [(1100, 1108, 3345, 1372, 1465), (2640, 960, 3320, 1050, None)],
        ),
        'rowEndless': ('profile-history', (1062, 501, 3325, 643), [(1440, 512, 3268, 632, 1762)]),
        'rowCpu': ('profile-history', (1062, 1063, 3325, 1205), [(1440, 1074, 3268, 1194, 1762)]),
        'rowVersus': ('profile-history', (1062, 1203, 3325, 1345), [(1440, 1214, 3268, 1334, 1762)]),
        'rowOnline': ('profile-history', (1062, 1203, 3325, 1345), [(1095, 1214, 3268, 1334, 1762)]),
    },
    'match': {
        'title': ('match-overview', (1119, 25, 2428, 225), []),
        'tabOn': ('match-overview', (923, 231, 1492, 357), [(1000, 250, 1440, 340, 990)]),
        'tabOff': ('match-overview', (1500, 235, 2110, 353), [(1560, 250, 2060, 340, 1550)]),
        'tag': ('match-overview', (1570, 376, 1995, 448), [(1625, 385, 1950, 440, 1612)]),
        'banner': ('match-overview', (1279, 450, 2274, 674), [(1440, 470, 2110, 665, 1430)]),
        'frame': (
            'match-overview',
            (1004, 600, 1357, 1088),
            [(1110, 612, 1250, 665, 1100), (1045, 1000, 1320, 1070, 1035), ('circle', 1181, 832, 152)],
        ),
        'roundsPill': ('match-overview', (1624, 940, 1922, 1034), [(1655, 955, 1895, 1020, 1645)]),
        'tile': ('match-overview', (1880, 1120, 2319, 1319), [(1905, 1140, 2295, 1300, 1895)]),
        'watch': ('match-overview', (996, 1380, 1931, 1537), []),
        'copy': ('match-overview', (1962, 1382, 2740, 1541), []),
        'boardHead': ('match-scoreboard', (440, 385, 3555, 490), []),
        'rowGold': (
            'match-scoreboard',
            (55, 500, 3540, 725),
            [
                (395, 530, 810, 705, 1000),
                (1000, 520, 3520, 705, 1000),
                (840, 540, 960, 690, 828),
                ('circle', 222, 614, 90),
            ],
        ),
        'rowDark': (
            'match-scoreboard',
            (55, 745, 3540, 950),
            [
                (395, 765, 810, 935, 1000),
                (1000, 765, 3520, 935, 1000),
                (840, 780, 960, 925, 828),
                ('circle', 222, 845, 88),
            ],
        ),
        'ribbon': ('match-scoreboard', (572, 532, 808, 600), []),
        'roundsHead': ('match-scoreboard', (900, 950, 2662, 1062), []),
        'roundBlue': (
            'match-scoreboard',
            (535, 1063, 1346, 1311),
            [(700, 1066, 1190, 1152, 'dark'), (690, 1150, 1200, 1265, 'dark')],
        ),
        'roundGold': (
            'match-scoreboard',
            (1365, 1059, 2196, 1312),
            [(1520, 1066, 2040, 1152, 'dark'), (1510, 1150, 2050, 1265, 'dark')],
        ),
        'subOn': ('match-graphs', (588, 345, 1162, 445), [(640, 360, 1110, 430, 630)]),
        'subOff': ('match-graphs', (1168, 350, 1730, 445), [(1215, 360, 1680, 430, 1205)]),
        'chart': ('match-graphs', (160, 525, 3520, 1315), [(205, 560, 3475, 1285, None)]),
        'hintBar': ('match-graphs', (960, 1570, 2620, 1715), [(1060, 1610, 2530, 1690, 1030)]),
    },
}


def gold_mask(rgba):
    """The gold of a picture as white, as opaque as each pixel is gold (bright, warm), for the glints."""
    rgb = rgba[:, :, :3].astype(np.float32) / 255
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    r, g, b = rgb[:, :, 0], rgb[:, :, 1], rgb[:, :, 2]
    warm = np.clip((r - b) * 2.2, 0, 1) * np.clip((g - b) * 3, 0, 1)
    bright = np.clip((mx - 0.5) / 0.35, 0, 1)
    pale = np.clip((mn - 0.8) / 0.15, 0, 1)
    k = np.maximum(warm * bright * np.clip(sat * 2, 0, 1), pale * bright)
    k = k * (rgba[:, :, 3].astype(np.float32) / 255)
    out = np.zeros_like(rgba)
    out[:, :, :3] = 255
    out[:, :, 3] = np.round(np.clip(k, 0, 1) * 255).astype(np.uint8)
    return out


def own(alpha):
    """A 0/1 mask of the parts of a cut piece that are its own: each solid patch whose middle lies inside the box's
    inner part (a neighbour or a flower caught at the box's edge has its middle near the edge)."""
    h, w = alpha.shape
    lab, _n = ndimage.label(ndimage.binary_dilation(alpha > 20, iterations=2))
    keep = np.zeros_like(alpha, dtype=np.uint8)
    for i, sl in enumerate(ndimage.find_objects(lab), start=1):
        cy = (sl[0].start + sl[0].stop) / 2
        cx = (sl[1].start + sl[1].stop) / 2
        if 0.1 * w < cx < 0.9 * w and 0.1 * h < cy < 0.9 * h:
            keep[lab == i] = 1
    return keep


def at(v):
    """A 2x coordinate in the stored mockup's pixels."""
    return int(round(v * STORED))


def main(group):
    pieces = SCREENS[group]
    sheets = {}
    cells = {}
    for name, (src, body, wipes) in pieces.items():
        if src not in sheets:
            sheets[src] = np.array(Image.open(os.path.join(SCREENS_DIR, src + '.png')).convert('RGBA'))
        sheet = sheets[src]
        x0, y0, x1, y1 = map(at, body)
        piece = sheet[y0:y1, x0:x1].copy()
        for wipe in wipes:
            if wipe[0] == 'circle':
                # A round hole, where the game draws its own picture under the piece.
                _k, ccx, ccy, cr = wipe
                yy, xx = np.mgrid[0 : y1 - y0, 0 : x1 - x0]
                piece[(xx - (at(ccx) - x0)) ** 2 + (yy - (at(ccy) - y0)) ** 2 < at(cr) ** 2, 3] = 0
                continue
            wx0, wy0, wx1, wy1, cx = wipe
            a, b, c, d = max(at(wx0), x0), max(at(wy0), y0), min(at(wx1), x1), min(at(wy1), y1)
            if cx is None:
                piece[b - y0 : d - y0, a - x0 : c - x0, 3] = 0
                continue
            if cx == 'dark':
                # The plate's own dark, under the text: the middle colour of the region's darker half.
                reg = sheet[b:d, a:c].reshape(-1, 4).astype(np.int32)
                lum = reg[:, :3].sum(axis=1)
                dark = reg[lum <= np.percentile(lum, 45)]
                piece[b - y0 : d - y0, a - x0 : c - x0] = np.median(dark, axis=0).astype(np.uint8)
                continue
            if isinstance(cx, tuple):
                # One flat colour, from the given point, where no clean column runs through.
                piece[b - y0 : d - y0, a - x0 : c - x0] = sheet[at(cx[1]), at(cx[0])]
                continue
            piece[b - y0 : d - y0, a - x0 : c - x0] = sheet[b:d, at(cx)][:, None, :]
        # Only the piece itself: whatever else the box caught near its edges (a neighbour, a flower) goes.
        piece[:, :, 3] = piece[:, :, 3] * own(piece[:, :, 3])
        cells[name] = piece
    width = max(2048, max(c.shape[1] for c in cells.values()))
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
    Image.fromarray(atlas).save(os.path.join(ROOT, 'assets', 'ui', f'{group}-kit.png'), optimize=True)
    Image.fromarray(gold_mask(atlas)).save(os.path.join(ROOT, 'assets', 'ui', f'{group}-kit-gold.png'), optimize=True)
    layout = {}
    for name, (ax, ay) in spots.items():
        h, w = cells[name].shape[:2]
        layout[name] = {'x': ax, 'y': ay, 'w': w, 'h': h, 'bx': 0, 'by': 0, 'bw': w, 'bh': h}
    const = group.upper() + '_KIT'
    with open(os.path.join(ROOT, 'src', 'data', f'{group}-kit.ts'), 'w') as f:
        f.write(f"// Generated by tools/extract-screen-kit.py ({group}): don't hand-edit.\n")
        f.write("import type { KitPiece } from '@/types';\n\n")
        f.write(f'/** Where each of the {group} screen\'s painted pieces sits in `assets/ui/{group}-kit.png`. */\n')
        f.write(f'export const {const}: Record<string, KitPiece> = ')
        f.write(json.dumps(layout, indent=4).replace('"', "'"))
        f.write(';\n')
    print(group, 'atlas', atlas.shape[1], 'x', atlas.shape[0])


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'profile')
