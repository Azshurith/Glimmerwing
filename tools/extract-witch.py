"""Usage: python extract-witch.py <sheet.png> <out_dir>

Cut the witch sprite sheet into frames: flood-fill background removal, bow-anchored, uniform cells."""
import sys, json
from PIL import Image
import numpy as np
from scipy import ndimage

SRC, OUT_DIR = sys.argv[1], sys.argv[2]
im = np.array(Image.open(SRC).convert('RGB')).astype(np.int32)

# name: (y0, y1, label x-centres, soft-alpha effects?)
ROWS = {
  'fly':     (41, 141, [369,444,518,593,667,739,812,883], False),
  'idle':    (41, 141, [1002,1072,1143,1213,1283,1353,1421,1490], False),
  'tiltL':   (208, 301, [82,173,262,351,441,527,613,699], False),
  'tiltR':   (208, 301, [839,928,1014,1101,1190,1280,1369,1458], False),
  'hit':     (673, 781, [67,170,272,374,476,576], True),
  'death':   (673, 779, [722,827,931,1036,1142,1250,1358,1464], True),
  'remains': (860, 976, [80,195,308,421], True),
  'revive':  (860, 976, [572,686,801,918], True),
}

def slots(cs):
    out = []
    for i, c in enumerate(cs):
        l = (cs[i-1] + c) // 2 if i else c - (cs[1] - cs[0]) // 2
        r = (c + cs[i+1]) // 2 if i + 1 < len(cs) else c + (cs[-1] - cs[-2]) // 2
        out.append((l + 2, r - 2))
    return out

def cut(y0, y1, x0, x1, soft):
    px = im[y0:y1, x0:x1]
    h, w, _ = px.shape
    border = np.concatenate([px[0], px[-1], px[:, 0], px[:, -1]])
    bg = np.median(border, axis=0)
    d = np.abs(px - bg).max(axis=2)
    cand = d <= 13
    lab, n = ndimage.label(cand)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    flooded = np.isin(lab, list(edge))
    fg = ~flooded
    # drop specks
    fl, fn = ndimage.label(fg)
    sizes = ndimage.sum(fg, fl, range(1, fn + 1))
    for i, s in enumerate(sizes):
        if s < (4 if soft else 12): fg[fl == i + 1] = False
    if not soft and fn:
        # Flight frames are one connected figure: keep only the biggest piece.
        fg = fl == (int(np.argmax(sizes)) + 1)
    if soft:
        # Glows: screen-style alpha (how far above the background each channel rises), so dark
        # fringes fade out; the outline right next to solid art stays fully opaque.
        lift = np.clip((px - bg) / np.maximum(255 - bg, 1), 0, 1).max(axis=2)
        a = np.clip(lift * 1.5, 0, 1)
        solid = ndimage.binary_dilation(d > 70, iterations=2)
        a = np.where(fg & solid, 1.0, a)
        a = np.where(a > 0.06, a, 0)
    else:
        a = fg.astype(float)
    a3 = a[..., None]
    col = np.where(a3 > 0, (px - bg * (1 - a3)) / np.maximum(a3, 1e-3), 0)
    rgba = np.dstack([np.clip(col, 0, 255), a * 255]).astype(np.uint8)
    return rgba

def bow_anchor(rgba):
    r, g, b, a = [rgba[..., i].astype(int) for i in range(4)]
    red = (a > 200) & (r > 170) & (g < 90) & (b < 110)
    ys, xs = np.nonzero(red[: rgba.shape[0] // 2])
    if len(xs) < 15: return None
    return float(xs.mean()), float(ys.mean())

LOOP4 = {'fly', 'idle', 'tiltL', 'tiltR'}
frames = {}
for name, (y0, y1, cs, soft) in ROWS.items():
    fl = []
    for (x0, x1) in slots(cs):
        rgba = cut(y0, y1, x0, x1, soft)
        fl.append({'rgba': rgba, 'ox': x0, 'oy': y0, 'bow': bow_anchor(rgba)})
    frames[name] = fl[::2] if name in LOOP4 else fl

# Reference: in fly frames, where is the hitbox (body) relative to the bow centroid? Use fixed offset.
# Anchor convention: each frame's anchor = bow centroid (sheet coords). Loop rows: per-frame bow (kills jitter).
# Effect rows: one row-wide anchor taken from the frame with the clearest bow, applied to every frame,
# so authored motion (rise, fall, sparkle spread) is preserved.
tops = []
for f in frames['fly']:
    ys = np.nonzero(f['rgba'][..., 3] > 128)[0]; tops.append(f['bow'][1] - ys.min())
BOW_DROP = float(np.mean(tops)); 
for name, fl in frames.items():
    soft = ROWS[name][3]
    centres = ROWS[name][2][::2] if name in LOOP4 else ROWS[name][2]
    if not soft:
        for f in fl:
            bx, by = f['bow']; f['ax'], f['ay'] = f['ox'] + bx, f['oy'] + by
    else:
        pick = {'hit': 0, 'death': 0, 'revive': 3}.get(name)
        refs = [(pick, fl[pick])] if pick is not None and fl[pick]['bow'] else []
        if name == 'remains':
            # grey bow: align its bbox top with where the bow sits in the 'hit' frame 1 relative to the row band
            ax = None
        if refs:
            i, f = refs[0]
            bx, by = f['bow']
            dx = f['ox'] + bx - (centres[i]); ay = f['oy'] + by
            for k, g in enumerate(fl): g['ax'] = centres[k] + dx; g['ay'] = ay
        else:
            # remains: bow top is the frame's top; bow centroid sits ~9px below the top of its bbox in fly frames
            ys = np.nonzero(fl[0]['rgba'][..., 3] > 128)[0]
            ay = fl[0]['oy'] + ys.min() + BOW_DROP
            for k, g in enumerate(fl): g['ax'] = centres[k]; g['ay'] = ay
    print(name, [(round(f['ax'] - f['ox'], 1), round(f['ay'] - f['oy'], 1)) for f in fl])

# Uniform cell: anchor at (AX, AY) in every cell.
AX, AY = 56, 26
CW, CH = 112, 124
order = list(ROWS.keys())
cols = 8
sheet = Image.new('RGBA', (CW * cols, CH * len(order)), (0, 0, 0, 0))
meta = {'cell': [CW, CH], 'anchor': [AX, AY], 'anims': {}}
for r, name in enumerate(order):
    meta['anims'][name] = {'row': r, 'count': len(frames[name])}
    for c, f in enumerate(frames[name]):
        img = Image.fromarray(f['rgba'], 'RGBA')
        px = int(round(AX - (f['ax'] - f['ox']))); py = int(round(AY - (f['ay'] - f['oy'])))
        cell = Image.new('RGBA', (CW, CH), (0, 0, 0, 0))
        cell.alpha_composite(img, (max(px,0), max(py,0)), (max(-px,0), max(-py,0)))
        sheet.alpha_composite(cell, (c * CW, r * CH))
sheet.quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE).save(f'{OUT_DIR}/witch.png', optimize=True)
json.dump(meta, open(f'{OUT_DIR}/witch.json', 'w'), indent=1)
# debug preview on a mid-tone checker, 2x
dbg = Image.new('RGBA', sheet.size, (60, 70, 110, 255))
for y in range(0, sheet.size[1], 8):
    for x in range(0, sheet.size[0], 8):
        if (x // 8 + y // 8) % 2: dbg.paste((80, 90, 130, 255), (x, y, x + 8, y + 8))
dbg.alpha_composite(sheet)
from PIL import ImageDraw
dr = ImageDraw.Draw(dbg)
for r in range(len(order)):
    for c in range(cols):
        dr.line([(c*CW+AX-3, r*CH+AY), (c*CW+AX+3, r*CH+AY)], fill=(0,255,0,255))
        dr.rectangle([c*CW, r*CH, c*CW+CW-1, r*CH+CH-1], outline=(255,255,255,60))
dbg.save(f'{OUT_DIR}/witch_debug.png')
