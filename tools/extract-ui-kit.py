"""Cut the lobby's UI pieces out of the vector UI sheet into one atlas.

    python tools/extract-ui-kit.py

Reads assets/source/ui/lobby-kit-vector.png, the vector UI sheet (traced from the painted kit at 4x) rendered at its
full 7096x3548 on near-black, and works at half that (2x the painted sheet). It keys the black away: whatever lies
inside a piece's bright, closed border is solid, and outside it a glow is as opaque as it is bright, its colour
brought back up to full strength. It then wipes the sample text off the pieces whose text the game draws itself
(filling it with the flat colour of the plate's inside), and writes assets/ui/lobby-kit.png with
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

# name: body (x0, y0, x1, y1), wipes [(x0, y0, x1, y1, sample x, sample y)], stretch (x0, x1) and, if given, the
# margin round the body to keep (GLOW if not). PLAY's body is its gold face, its frame and crest standing out round it.
# The crop is the body plus the margin all round. A wipe fills its box with the colour at its sample point, the plate's flat inside.
PIECES = {
    'name': ((30, 15, 930, 285), [(330, 62, 760, 205, 600, 50)], (340, 740)),
    'quickHistory': ((60, 303, 585, 452), [], None),
    'quickRanking': ((60, 466, 585, 615), [], None),
    'quickGuide': ((60, 628, 586, 777), [], None),
    'badgeHistory': ((61, 305, 206, 450), [], None),
    'badgeRanking': ((61, 468, 206, 613), [], None),
    'badgeGuide': ((61, 630, 206, 775), [], None),
    'counterStage': ((2310, 30, 2648, 132), [(2470, 45, 2612, 112, 2460, 60)], (2480, 2600)),
    'counterTrophy': ((2662, 33, 3050, 133), [(2800, 48, 3012, 114, 2795, 60)], (2812, 2995)),
    'online': ((3146, 30, 3522, 132), [], None),
    'offline': ((3146, 147, 3523, 250), [], None),
    'stage': ((1318, 925, 2162, 1040), [(1356, 952, 1996, 1014, 1900, 960)], (1390, 2090)),
    'arrow': ((1160, 926, 1243, 1037), [], None),
    'bar': ((146, 1158, 1300, 1352), [(300, 1182, 1252, 1328, 820, 1300)], (500, 1100)),
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
    src = src.resize((src.width // 2, src.height // 2), Image.LANCZOS)
    # Padded by PAD all round, so pieces at the sheet's edge still get their full margin: sheet[y + PAD, x + PAD]
    # is the sheet's (x, y).
    sheet = np.pad(key(np.array(src)), ((PAD, PAD), (PAD, PAD), (0, 0)))
    cells = {}
    for name, (body, wipes, _stretch, *rest) in PIECES.items():
        m = rest[0] if rest else GLOW
        x0, y0 = body[0] - m, body[1] - m
        x1, y1 = body[2] + m, body[3] + m
        piece = sheet[y0 + PAD : y1 + PAD, x0 + PAD : x1 + PAD].copy()
        for wx0, wy0, wx1, wy1, sx, sy in wipes:
            piece[wy0 - y0 : wy1 - y0, wx0 - x0 : wx1 - x0] = sheet[sy + PAD, sx + PAD]
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
        m = PIECES[name][3] if len(PIECES[name]) > 3 else GLOW
        ox, oy = ax + cx - (bx - m), ay + cy - (by - m)
        gold[(xx - ox) ** 2 + (yy - oy) ** 2 < r * r, 3] = 0
    Image.fromarray(gold).save(GOLD, optimize=True)
    layout = {}
    for name, (body, _wipes, stretch, *rest) in PIECES.items():
        m = rest[0] if rest else GLOW
        ax, ay = spots[name]
        h, w = cells[name].shape[:2]
        entry = {'x': ax, 'y': ay, 'w': w, 'h': h, 'bx': m, 'by': m, 'bw': body[2] - body[0], 'bh': body[3] - body[1]}
        if stretch:
            entry['s0'] = stretch[0] - (body[0] - m)
            entry['s1'] = stretch[1] - (body[0] - m)
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
