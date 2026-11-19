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
from PIL import Image, ImageDraw
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCREENS_DIR = os.path.join(ROOT, 'assets', 'source', 'ui', 'screens')

# The mockups are stored at 1.5x; pieces are given at 2x.
STORED = 0.75

# group: {piece: (source, body (x0, y0, x1, y1), wipes)}, all at 2x; a wipe is (x0, y0, x1, y1, the clean column x to
# fill it from, an (x, y) point whose colour fills it, 'dark' for the
# middle colour of its darker half, or None to clear it), ('circle', x, y, r) to cut a round
# hole, ('rrect', x0, y0, x1, y1, r) to cut a rounded window (where the game draws a portrait or a live meadow), or
# ('poly', [(x, y), …]) to cut a window of that shape, or ('keep', x, y, r, rect or None) to keep only the disc round (x, y) and the rect (x0, y0, x1, y1), softly edged (a
# medallion lifted off the tray it sits on).


def roster_skill(y):
    """One of the Characters mockup's four skill rows, its top at `y`: its orb and kind kept, its name and what it
    does wiped."""
    return ('roster', (1000, y - 6, 2506, y + 130), [(1212, y + 52, 1720, y + 117, 1200), (1720, y + 12, 2455, y + 117, 1700)])


def maps_card(x0, x1):
    """One of the Maps mockup's five monster cards, from x0 to x1: its role kept, the monster and its name wiped."""
    return ('maps', (x0 - 8, 718, x1 + 8, 1150), [(x0 + 24, 795, x1 - 24, 1046, x0 + 20), (x0 + 26, 1060, x1 - 26, 1114, 'dark')])


# Mockups whose transparency left a red fringe round their pieces: it's taken off as they're cut.
DEFRINGE = {'select', 'mapselect'}

# The centres of the Maps tray's seven stage discs (y 1300) and the Characters tray's seven medallions (y 1218).
MAP_DISCS = [431, 729, 1028, 1330, 1629, 1927, 2230]
STAGE_ICONS = [(30, 205), (225, 398), (405, 582), (608, 772), (783, 978), (978, 1170), (1182, 1362)]
SCREENS = {
    'profile': {
        'title': ('profile-record', (1146, 2, 2340, 219), []),
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
    'roster': {
        'title': ('roster', (846, 0, 2698, 232), []),
        'statsL': ('roster', (980, 326, 1728, 508), [(1262, 350, 1690, 488, 1252)]),
        'statsR': ('roster', (1753, 326, 2507, 508), [(2040, 350, 2470, 488, 2028)]),
        'skill0': roster_skill(521),
        'skill1': roster_skill(661),
        'skill2': roster_skill(801),
        'skill3': roster_skill(941),
        'demo': ('roster', (2520, 218, 3523, 1130), [('rrect', 2556, 241, 3487, 1093, 50)]),
        'tray': ('roster', (900, 1095, 2700, 1350), [(1085, 1095, 2520, 1345, 1497), ('mirrorleft', 186)]),
        'medOn': ('roster', (1080, 1100, 1320, 1340), [('circle', 1200, 1222, 78), ('keep', 1200, 1222, 116, None)]),
        'medOff': ('roster', (1311, 1127, 1491, 1307), [('circle', 1401, 1217, 64), ('keep', 1401, 1217, 84, None)]),
    },
    'maps': {
        'title': ('maps', (436, 20, 2083, 240), []),
        'plate': (
            'maps',
            (30, 232, 1100, 500),
            [('circle', 244, 365, 90), (392, 290, 985, 392, 385), (416, 422, 900, 474, 405)],
        ),
        'difficulty': ('maps', (1110, 333, 1822, 454), [(1415, 368, 1765, 422, 1400)]),
        'monsters': ('maps', (78, 588, 1787, 697), []),
        'card0': maps_card(53, 396),
        'card1': maps_card(416, 753),
        'card2': maps_card(777, 1110),
        'card3': maps_card(1136, 1469),
        'card4': maps_card(1493, 1812),
        'preview': ('maps', (1830, 240, 2625, 1160), [('rrect', 1866, 276, 2588, 1124, 50)]),
        'tray': ('maps', (60, 1170, 2600, 1470), [(300, 1170, 2345, 1465, 580)]),
        'medOn': (
            'maps',
            (220, 1165, 645, 1448),
            [('circle', 431, 1300, 93), (290, 1378, 572, 1424, 'dark'), ('keep', 431, 1300, 122, (280, 1358, 582, 1438))],
        ),
        'medOff': (
            'maps',
            (590, 1180, 870, 1440),
            [('circle', 729, 1300, 88), (640, 1380, 818, 1424, 'dark'), ('keep', 729, 1300, 104, (634, 1362, 824, 1434))],
        ),
        **{
            f'disc{i}': ('maps', (cx - 92, 1208, cx + 92, 1392), [('keep', cx, 1300, 86, None), (cx - 92, 1362, cx + 92, 1392, None)])
            for i, cx in enumerate(MAP_DISCS)
        },
        **{f'icon{i}': ('maps', (x0, 1578, x1, 1758), []) for i, (x0, x1) in enumerate(STAGE_ICONS)},
    },
    'select': {
        'title': ('select', (680, 0, 2860, 205), []),
        'cardL': (
            'select',
            (45, 220, 1120, 1755),
            [
                ('poly', [(108, 345), (412, 345), (412, 272), (1044, 272), (1044, 1102), (108, 1102)]),
                (165, 245, 370, 322, 155),
                (300, 1118, 860, 1222, 290),
                (100, 1248, 1045, 1692, 150),
            ],
        ),
        'cardR': (
            'select',
            (2420, 215, 3505, 1750),
            [
                ('poly', [(2476, 290), (3122, 290), (3122, 345), (3442, 345), (3442, 1103), (2560, 1103)]),
                (3180, 250, 3355, 325, 3170),
                (2680, 1118, 3300, 1222, 2670),
                (2490, 1248, 3440, 1692, 2540),
            ],
        ),
        'time': ('select', (1450, 225, 2105, 510), [(1630, 322, 1922, 490, 1620)]),
        'ring': ('select', (1500, 560, 1780, 840), [('circle', 1640, 700, 104), ('keep', 1640, 700, 134, None)]),
        'vs': ('select', (1290, 1150, 2260, 1500), []),
        'prompt': ('select', (1140, 1510, 2405, 1640), [(1290, 1535, 2262, 1612, 1280)]),
        'sub': ('select', (1295, 1640, 2235, 1740), [(1400, 1658, 2160, 1722, 1390)]),
    },
    'mapselect': {
        'title': ('mapselect', (920, 20, 2680, 210), [('unpurple', 920, 90, 1130, 210), ('unpurple', 2470, 90, 2680, 210)]),
        'trophies': ('mapselect', (3040, 56, 3524, 196), [(3215, 82, 3440, 170, 'dark')]),
        'cardOn': ('mapselect', (380, 240, 1095, 893), [('rrect', 432, 290, 1050, 727, 26), (520, 742, 965, 838, 500), (432, 727, 456, 862, None), (1026, 727, 1050, 862, None)]),
        'cardOff': (
            'mapselect',
            (1090, 240, 1795, 893),
            [('rrect', 1131, 292, 1763, 727, 26), (1200, 742, 1700, 838, 1190), (1131, 727, 1155, 862, None), (1739, 727, 1763, 862, None)],
        ),
        'hint': ('mapselect', (550, 1566, 3040, 1722), [(720, 1600, 2880, 1690, 705)]),
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
        keep = None
        for wipe in wipes:
            if wipe[0] == 'mirrorleft':
                # The right end made the left end turned round (the painting's two ends differ).
                n = at(wipe[1])
                piece[:, -n:] = piece[:, :n][:, ::-1]
                continue
            if wipe[0] == 'lum':
                # An icon lifted off its pill: as opaque as it is dark (on gold) or light (on violet).
                rgb = piece[:, :, :3].astype(np.float32)
                lum = rgb @ np.array([0.3, 0.59, 0.11], np.float32)
                if wipe[1] == 'dark':
                    k = np.clip((150 - lum) / 90, 0, 1)
                else:
                    k = np.clip((lum - 120) / 80, 0, 1) * np.clip((rgb.min(axis=2) - 80) / 60, 0, 1)
                piece[:, :, 3] = np.round(piece[:, :, 3] * k).astype(np.uint8)
                continue
            if wipe[0] == 'unpurple':
                # Clears the violet (a strip of a bar running on behind a piece) from a corner, keeping the gold.
                _k, ux0, uy0, ux1, uy1 = wipe
                reg = piece[at(uy0) - y0 : at(uy1) - y0, at(ux0) - x0 : at(ux1) - x0]
                r, g, b = (reg[:, :, k].astype(np.int32) for k in range(3))
                reg[b > g + 5, 3] = 0
                continue
            if wipe[0] == 'poly':
                # A window of any shape cut right through.
                mask = Image.new('L', (x1 - x0, y1 - y0), 0)
                ImageDraw.Draw(mask).polygon([(at(px) - x0, at(py) - y0) for px, py in wipe[1]], fill=255)
                piece[np.array(mask) > 0, 3] = 0
                continue
            if wipe[0] == 'rrect':
                # A rounded window cut right through, where the game draws its own picture under the frame.
                _k, rx0, ry0, rx1, ry1, rr = wipe
                yy, xx = np.mgrid[0 : y1 - y0, 0 : x1 - x0]
                ax0, ay0, ax1, ay1, ar = at(rx0) - x0, at(ry0) - y0, at(rx1) - x0, at(ry1) - y0, at(rr)
                dx = np.maximum(np.maximum(ax0 + ar - xx, xx - (ax1 - ar)), 0)
                dy = np.maximum(np.maximum(ay0 + ar - yy, yy - (ay1 - ar)), 0)
                piece[(dx**2 + dy**2 <= ar**2) & (xx >= ax0) & (xx < ax1) & (yy >= ay0) & (yy < ay1), 3] = 0
                continue
            if wipe[0] == 'keep':
                # Only the disc (and a rect under it), fading out over a few pixels, so it lifts off what's round it.
                _k, kx, ky, kr, rect = wipe
                yy, xx = np.mgrid[0 : y1 - y0, 0 : x1 - x0].astype(np.float32)
                d = np.sqrt((xx - (at(kx) - x0)) ** 2 + (yy - (at(ky) - y0)) ** 2) - at(kr)
                if rect:
                    qx0, qy0, qx1, qy1 = at(rect[0]) - x0, at(rect[1]) - y0, at(rect[2]) - x0, at(rect[3]) - y0
                    rd = np.maximum(np.maximum(qx0 - xx, xx - qx1), np.maximum(qy0 - yy, yy - qy1))
                    d = np.minimum(d, rd)
                keep = np.clip(1 - d / 6, 0, 1)
                continue
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
            if isinstance(cx, tuple) and cx[0] == 'blend':
                # Each row fades from its colour at one clean column to its colour at the other.
                left = sheet[b:d, at(cx[1])].astype(np.float32)
                right = sheet[b:d, at(cx[2])].astype(np.float32)
                k = np.linspace(0, 1, c - a, dtype=np.float32)[None, :, None]
                piece[b - y0 : d - y0, a - x0 : c - x0] = np.round(left[:, None] * (1 - k) + right[:, None] * k)
                continue
            if isinstance(cx, tuple):
                # One flat colour, from the given point, where no clean column runs through.
                piece[b - y0 : d - y0, a - x0 : c - x0] = sheet[at(cx[1]), at(cx[0])]
                continue
            piece[b - y0 : d - y0, a - x0 : c - x0] = sheet[b:d, at(cx)][:, None, :]
        # Only the piece itself: whatever else the box caught near its edges (a neighbour, a flower) goes.
        if group in DEFRINGE:
            # The red the background left round the edges: see-through and far redder than green.
            r, g, b, a = (piece[:, :, k].astype(np.int32) for k in range(4))
            piece[(a < 235) & (r > 110) & (r * 10 > g * 16) & (b * 10 < r * 9), 3] = 0
        if not any(w[0] == 'lum' for w in wipes):
            piece[:, :, 3] = piece[:, :, 3] * own(piece[:, :, 3])
        if keep is not None:
            piece[:, :, 3] = np.round(piece[:, :, 3] * keep).astype(np.uint8)
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
