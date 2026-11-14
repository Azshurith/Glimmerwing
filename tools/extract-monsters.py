"""Usage: python extract-monsters.py <sheet.png> <out.png> <out.json>

Cut a map's monster sheet (five monsters x eight "appear" frames, then one row of a
reusable appear overlay, on black) into an atlas of equal cells, one row per monster.

The sheet's background is black, so alpha comes from brightness: glow frames (sparkles,
outlines) are fully soft, solid frames are opaque inside and soft only at their rim.
Colours are un-premultiplied so the glow keeps its hue when drawn over the scenery."""
import sys, json
from PIL import Image
import numpy as np
from scipy import ndimage

SRC, OUT_PNG, OUT_JSON = sys.argv[1], sys.argv[2], sys.argv[3]
im = np.array(Image.open(SRC).convert('RGB')).astype(np.float64)

CELL = 112  # atlas cell size; source frames are about 140 px
COLS = [98, 240, 381, 524, 668, 813, 960, 1110]
SLOT = 70  # half the width each frame may take
BOX = 164  # every frame is centred in a square this big before scaling
# name: (top, bottom just above the frame numbers, label box to blank out x0, x1, y1)
ROWS = [
    ('slime', 112, 231, (0, 330, 120)),
    ('mushroom', 268, 428, (0, 378, 322)),
    ('bee', 460, 619, (0, 318, 518)),
    ('leaf', 650, 802, (0, 320, 707)),
    ('tree', 836, 996, (0, 318, 890)),
    ('appear', 1110, 1220, (0, 0, 0)),
]
RIGHT = 1168  # nothing to the right of this is part of a frame
SOLID_FROM = 4  # frames 5-8 are the monster itself; 1-4 are sparkles and glowing outlines


def cut(y0, y1, x0, x1, label, soft):
    """Returns the RGBA crop of one frame with alpha keyed from the black background."""
    px = im[y0:y1, x0:x1].copy()
    if x1 > RIGHT:  # the overlay row's frame border runs down the sheet's right side
        px[:, RIGHT - x0 :] = 0
    lx0, lx1, ly1 = label
    if ly1 > y0:  # blank the row's title box where it overlaps this slot
        a, b = max(lx0, x0) - x0, min(lx1, x1) - x0
        if b > a:
            px[: ly1 - y0, a:b] = 0
    lum = px.max(axis=2)
    if soft:
        alpha = np.clip(lum / 210.0, 0, 1)
    else:
        bg = lum <= 22
        lab, _ = ndimage.label(bg)
        edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
        outside = np.isin(lab, list(edge))
        dist = ndimage.distance_transform_edt(~outside)
        rim = np.clip(lum / 90.0, 0, 1)
        alpha = np.where(outside, 0, np.where(dist > 3, 1, np.maximum(rim, (dist - 1) / 3)))
        alpha = np.clip(alpha, 0, 1)
    # Drop specks: keep only pieces of real size.
    lab, n = ndimage.label(alpha > 0.08)
    if n:
        sizes = ndimage.sum(np.ones_like(alpha), lab, range(1, n + 1))
        keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= 6])
        alpha = alpha * keep
    rgb = np.where(alpha[..., None] > 0, px / np.maximum(alpha[..., None], 1e-3), 0)
    return np.dstack([np.clip(rgb, 0, 255), alpha * 255])


def fit(rgba, scale):
    """Downscales a crop with premultiplied alpha and centres it in an atlas cell."""
    h, w = rgba.shape[:2]
    pre = rgba.copy()
    pre[..., :3] *= rgba[..., 3:4] / 255
    img = Image.fromarray(np.clip(pre, 0, 255).astype(np.uint8), 'RGBA')
    img = img.resize((max(1, round(w * scale)), max(1, round(h * scale))), Image.LANCZOS)
    a = np.array(img).astype(np.float64)
    a[..., :3] = np.where(a[..., 3:4] > 0, a[..., :3] * 255 / np.maximum(a[..., 3:4], 1), 0)
    cell = np.zeros((CELL, CELL, 4))
    ch, cw = a.shape[:2]
    oy, ox = (CELL - ch) // 2, (CELL - cw) // 2
    cell[max(0, oy) : oy + ch, max(0, ox) : ox + cw] = a[max(0, -oy) : CELL - oy, max(0, -ox) : CELL - ox]
    return cell


atlas = np.zeros((CELL * len(ROWS), CELL * len(COLS), 4))
scale = CELL / BOX
for r, (name, y0, y1, label) in enumerate(ROWS):
    for c, cx in enumerate(COLS):
        x0, x1 = cx - SLOT, cx + SLOT
        soft = name == 'appear' or c < SOLID_FROM
        crop = cut(y0, y1, x0, x1, label, soft)
        # Centre on the slot horizontally and on the row's middle vertically, so frames line up.
        pad = np.zeros((BOX, BOX, 4))
        top, left = (BOX - (y1 - y0)) // 2, (BOX - 2 * SLOT) // 2
        pad[top : top + (y1 - y0), left : left + 2 * SLOT] = crop
        atlas[r * CELL : (r + 1) * CELL, c * CELL : (c + 1) * CELL] = fit(pad, scale)

# A 256-colour palette keeps the inlined atlas small; the art is pixel art, so it barely shows.
out = Image.fromarray(np.clip(atlas, 0, 255).astype(np.uint8), 'RGBA')
out.quantize(256, method=Image.FASTOCTREE, dither=Image.NONE).save(OUT_PNG, optimize=True)
json.dump({'cell': CELL, 'rows': [r[0] for r in ROWS], 'frames': len(COLS)}, open(OUT_JSON, 'w'), indent=1)
print('wrote', OUT_PNG, atlas.shape)
