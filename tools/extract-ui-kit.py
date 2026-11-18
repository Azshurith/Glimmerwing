"""Cut the lobby's UI pieces out of the vector UI sheet into one atlas.

    python tools/extract-ui-kit.py

Reads assets/source/ui/lobby-kit-vector.png, the UI sheet (the painted kit upscaled 4x, kept at 2x: 3548x1774; the main menu's sheet, with the shared pieces the other
menu screens use along its foot) on
near-black. It keys the black away: whatever lies
inside a piece's bright, closed border is solid, and outside it a glow is as opaque as it is bright, its colour
brought back up to full strength. It then wipes the sample text off the pieces whose text the game draws itself
(filling each row with the plate's clean inside from one column), and writes assets/ui/lobby-kit.png with
src/data/lobby-kit.ts, the atlas's layout: per piece its cell in the atlas, its body (the solid shape inside the
glow, relative to the cell) and, for pieces stretched along their length, where the stretchable middle starts and
ends. It also writes assets/ui/lobby-kit-gold.png, the same atlas with only its gold (in white, as opaque as each
pixel is gold), which the glints light up.

All coordinates below are pixels of the sheet at 2x (3548x1774).
"""

import json
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'source', 'ui', 'lobby-kit-vector.png')
OUT = os.path.join(ROOT, 'assets', 'ui', 'lobby-kit.png')
GOLD = os.path.join(ROOT, 'assets', 'ui', 'lobby-kit-gold.png')
TS = os.path.join(ROOT, 'src', 'data', 'lobby-kit.ts')

# How far a piece's glow reaches past its body.
GLOW = 10

# The sheet's padding, wider than any piece's margin.
PAD = 100

# name: body (x0, y0, x1, y1), wipes [(x0, y0, x1, y1) or (..., 'blend')], stretch (x0, x1) and, if given, the
# margin round the body to keep, all round or (left, top, right, bottom) (GLOW if not). PLAY's body is its gold face,
# its frame and crest standing out round it; the bar's halves end at it, so the three lie flush as on the sheet.
# The crop is the body plus the margin all round. A wipe fills its box with the colour at its sample point, the plate's flat inside.
PIECES = {
    'name': ((30, 15, 930, 285), [(330, 62, 760, 205, 'blend')], (340, 740)),
    'quickHistory': ((60, 303, 585, 452), [], None),
    'quickRanking': ((60, 466, 585, 615), [], None),
    'quickGuide': ((60, 628, 586, 777), [], None),
    'badgeHistory': ((61, 305, 206, 450), [], None),
    'badgeRanking': ((61, 468, 206, 613), [], None),
    'badgeGuide': ((61, 630, 206, 775), [], None),
    'counterStage': ((2310, 30, 2648, 132), [(2470, 40, 2605, 116, 'blend')], (2480, 2600)),
    'counterTrophy': ((2662, 33, 3050, 133), [(2822, 44, 3005, 118, 'blend')], (2812, 2995)),
    'online': ((3146, 30, 3522, 132), [], None),
    'offline': ((3146, 147, 3523, 250), [], None),
    'stage': ((1318, 925, 2162, 1040), [(1356, 952, 1996, 1014)], (1390, 2090)),
    'arrow': ((1160, 926, 1243, 1037), [], None),
    'barLeft': (
        (146, 1158, 1438, 1352),
        [(300, 1186, 1200, 1325), (1150, 1218, 1305, 1296)],
        (520, 1120),
        (GLOW, GLOW, 0, GLOW),
    ),
    'barRight': (
        (2118, 1158, 3399, 1352),
        [(2270, 1184, 3150, 1328), (2236, 1196, 3205, 1316)],
        (2430, 3050),
        (0, GLOW, GLOW, GLOW),
    ),
    'play': ((1438, 1148, 2118, 1366), [], None, 84),
    'panel': ((25, 1407, 590, 1560), [], None),
    'orbCharacters': ((46, 1596, 189, 1731), [], None),
    'orbMaps': ((218, 1596, 359, 1731), [], None),
    'orbProfile': ((388, 1596, 527, 1731), [], None),
    'orbSettings': ((557, 1596, 699, 1731), [], None),
    'friendProfile': ((733, 1600, 867, 1731), [], None),
    'friendAdd': ((894, 1600, 1027, 1731), [], None),
    'friendRequests': ((1053, 1599, 1186, 1731), [], None),
    'toggleOn': ((2445, 1414, 2590, 1492), [], None),
    'toggleOff': ((2621, 1417, 2761, 1492), [], None),
    # The shared pieces the other menu screens are built from.
    'panelPink': ((640, 1409, 1112, 1561), [], None),
    'pillGold': ((1158, 1409, 1459, 1485), [], (1215, 1400)),
    'pillGoldLow': ((1158, 1503, 1458, 1577), [], (1215, 1400)),
    'pillViolet': ((1506, 1412, 1745, 1484), [], (1555, 1695)),
    'pillVioletLow': ((1505, 1504, 1744, 1577), [], (1555, 1695)),
    'pillBlue': ((1989, 1418, 2193, 1492), [], (2035, 2145)),
    'pillLilac': ((2215, 1418, 2412, 1492), [], (2260, 2365)),
    'arrowLeft': ((1790, 1419, 1848, 1489), [], None, 4),
    'arrowRight': ((1877, 1419, 1935, 1490), [], None, 4),
    'checkbox': ((2806, 1414, 2887, 1493), [], None, 4),
    'checkboxOn': ((2926, 1414, 3006, 1493), [], None, 4),
    'divider': ((1792, 1514, 3058, 1596), [], None, 4),
    'crest': ((1751, 1593, 2445, 1727), [], None, 4),
    'wingLeft': ((1751, 1624, 1955, 1708), [], None, 4),
    'wingRight': ((2245, 1621, 2445, 1708), [], None, 4),
    'capsule': ((2522, 1609, 3036, 1717), [], (2600, 2960)),
    'cornerTL': ((3192, 1404, 3343, 1562), [], None, 4),
    'cornerTR': ((3379, 1402, 3525, 1561), [], None, 4),
    'cornerBL': ((3193, 1582, 3343, 1727), [], None, 4),
    'cornerBR': ((3378, 1582, 3524, 1729), [], None, 4),
    'sparkViolet': ((1229, 1627, 1316, 1709), [], None, 4),
    'sparkGold': ((1329, 1626, 1421, 1710), [], None, 4),
    'sparkBig': ((1558, 1618, 1695, 1719), [], None, 4),
}

# Shapes forced solid where the key would see through them: the plate's dark card, and the server pills, whose
# borders don't quite close.
SOLID = [
    ('poly', (250, 40, 845, 40, 905, 110, 870, 205, 780, 226, 250, 228), 0),
    ('round', (3150, 33, 3518, 129), 48),
    ('round', (3150, 150, 3519, 247), 48),
]

# Pieces that overlap others on the sheet keep only their own shape: rounded boxes, ellipses and polygons,
# feathered at the edge.
MASKS = {
    'badgeHistory': [('ellipse', (57, 301, 210, 454), 0)],
    'badgeRanking': [('ellipse', (57, 464, 210, 617), 0)],
    'badgeGuide': [('ellipse', (57, 626, 210, 779), 0)],
    'play': [
        ('round', (1386, 1098, 2164, 1398), 150),
        ('poly', (1752, 1078, 1866, 1112, 1866, 1182, 1752, 1196, 1638, 1182, 1638, 1112), 0),
    ],
}

# Pieces that sit over the bar on the sheet and drop its violet from round them.
NO_PURPLE = {'play'}

# Circles (centre and radius) in pieces whose insides the glint leaves alone: the sample face in the plate's ring,
# which the game covers with the player's avatar.
NO_GLINT = {'name': (205, 140, 90)}


def margins(rest):
    """A piece's margins (left, top, right, bottom) from what follows its stretch in PIECES."""
    if not rest:
        return GLOW, GLOW, GLOW, GLOW
    m = rest[0]
    return (m, m, m, m) if isinstance(m, int) else m


def shapes(size, origin, items):
    """A greyscale picture of the given shapes, filled white, over the box at `origin` of `size`."""
    x0, y0 = origin
    m = Image.new('L', size, 0)
    d = ImageDraw.Draw(m)
    for kind, pts, r in items:
        if kind == 'poly':
            d.polygon([(pts[i] - x0, pts[i + 1] - y0) for i in range(0, len(pts), 2)], fill=255)
            continue
        a, b, c, e = pts
        box = (a - x0, b - y0, c - x0, e - y0)
        if kind == 'round':
            d.rounded_rectangle(box, r, fill=255)
        else:
            d.ellipse(box, fill=255)
    return m


def key(rgb):
    """Keys the near-black away: solid inside each bright closed border (and the SOLID shapes), elsewhere as opaque as
    it is bright, its colour divided back up. Returns the RGBA sheet."""
    a = rgb.astype(np.float32)
    mx = a.max(axis=2)
    solid = ndimage.binary_fill_holes(mx > 150)
    solid |= np.array(shapes((rgb.shape[1], rgb.shape[0]), (0, 0), SOLID)) > 0
    solid = ndimage.binary_dilation(solid, iterations=1)
    alpha = np.where(solid, 1.0, np.clip((mx - 10) / 110, 0, 1))
    col = np.where(solid[:, :, None], a, np.clip(a / np.maximum(alpha[:, :, None], 1e-3), 0, 255))
    return np.dstack([col, alpha * 255]).round().astype(np.uint8)


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
    src = Image.open(SRC).convert('RGB')
    if src.width > 4000:
        src = src.resize((src.width // 2, src.height // 2), Image.LANCZOS)
    # Padded by PAD all round, so pieces at the sheet's edge still get their full margin: sheet[y + PAD, x + PAD]
    # is the sheet's (x, y).
    sheet = np.pad(key(np.array(src)), ((PAD, PAD), (PAD, PAD), (0, 0)))
    cells = {}
    for name, (body, wipes, _stretch, *rest) in PIECES.items():
        ml, mt, mr, mb = margins(rest)
        x0, y0 = body[0] - ml, body[1] - mt
        x1, y1 = body[2] + mr, body[3] + mb
        piece = sheet[y0 + PAD : y1 + PAD, x0 + PAD : x1 + PAD].copy()
        sx = None
        for wx0, wy0, wx1, wy1, *rest in wipes:
            # Each row takes the colour of the plate's clean inside from one column, keeping its shading: the darkest
            # column of the box (no text, icon or divider crosses it).
            if rest and rest[0] == 'blend':
                # Shaded across as well as down: blend each row from the clean column left of the box to the one
                # right of it.
                a = sheet[wy0 + PAD : wy1 + PAD, wx0 - 1 + PAD].astype(np.float32)
                b = sheet[wy0 + PAD : wy1 + PAD, wx1 + PAD].astype(np.float32)
                k = np.linspace(0, 1, wx1 - wx0, dtype=np.float32)[None, :, None]
                fill = a[:, None, :] * (1 - k) + b[:, None, :] * k
                piece[wy0 - y0 : wy1 - y0, wx0 - x0 : wx1 - x0] = np.round(fill).astype(np.uint8)
                continue
            # A later box in the same piece reuses the first one's column, so the two meet without a seam.
            if sx is None:
                band = sheet[wy0 + PAD : wy1 + PAD, wx0 + PAD : wx1 + PAD, :3].astype(np.int32)
                sx = wx0 + int(np.argmin(band.max(axis=2).max(axis=0)))
            col = sheet[wy0 + PAD : wy1 + PAD, sx + PAD]
            piece[wy0 - y0 : wy1 - y0, wx0 - x0 : wx1 - x0] = col[:, None, :]
        if name in MASKS:
            m = shapes((x1 - x0, y1 - y0), (x0, y0), MASKS[name]).filter(ImageFilter.GaussianBlur(2))
            keep = np.array(m, np.float32) / 255
            piece[:, :, 3] = np.round(piece[:, :, 3] * keep).astype(np.uint8)
        if name in NO_PURPLE:
            # The bar's violet showing round the button on the sheet goes.
            p = piece.astype(np.int32)
            violet = (p[:, :, 2] > p[:, :, 0] + 10) & (p[:, :, 2] > p[:, :, 1] + 10)
            piece[violet, 3] = 0
        cells[name] = piece
    # Shelf-pack the pieces, tallest first.
    width = 2048
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
    yy, xx = np.mgrid[0 : gold.shape[0], 0 : gold.shape[1]]
    for name, (cx, cy, r) in NO_GLINT.items():
        ax, ay = spots[name]
        bx, by = PIECES[name][0][:2]
        ml, mt, _mr, _mb = margins(PIECES[name][3:])
        ox, oy = ax + cx - (bx - ml), ay + cy - (by - mt)
        gold[(xx - ox) ** 2 + (yy - oy) ** 2 < r * r, 3] = 0
    Image.fromarray(gold).save(GOLD, optimize=True)
    layout = {}
    for name, (body, _wipes, stretch, *rest) in PIECES.items():
        ml, mt, _mr, _mb = margins(rest)
        ax, ay = spots[name]
        h, w = cells[name].shape[:2]
        entry = {'x': ax, 'y': ay, 'w': w, 'h': h, 'bx': ml, 'by': mt, 'bw': body[2] - body[0], 'bh': body[3] - body[1]}
        if stretch:
            entry['s0'] = stretch[0] - (body[0] - ml)
            entry['s1'] = stretch[1] - (body[0] - ml)
        layout[name] = entry
    with open(TS, 'w') as f:
        f.write('// Generated by tools/extract-ui-kit.py from assets/source/ui/lobby-kit-vector.png: don\'t hand-edit.\n')
        f.write("import type { KitPiece } from '@/types';\n\n")
        f.write('/** Where each of the lobby kit\'s pieces sits in `assets/ui/lobby-kit.png`, ')
        f.write('and its body inside it. */\n')
        f.write('export const LOBBY_KIT: Record<string, KitPiece> = ')
        f.write(json.dumps(layout, indent=4).replace('"', "'"))
        f.write(';\n')
    print('atlas', atlas.shape[1], 'x', atlas.shape[0])


if __name__ == '__main__':
    main()
