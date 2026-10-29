"""Turns the masks from bake-earth.ts into the globe's distance-field images.

earth-sdf.png (4096x2048, RGB): land, desert and ice as signed distances to
their edges, 128 on the edge, brighter inside, 16 levels per texel, out to
8 texels either side. earth-borders.png (4096x2048, RGB): R is the distance
to the nearest country border's centre line, 64 levels per texel, out to 4
texels; G is the same distance signed by which side of the line the texel is
on, 128 on the line, 32 levels per texel. Plain distances form a V across a
line, which blends between texels into a line that fades when magnified; the
signed one crosses zero exactly on the line, so the shader uses it up close.
Area distances are measured on the 8192-wide masks; border distances exactly,
from points every 1/20 texel along the lines. Both wrap across the 180th
meridian.
"""
import json

import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt
from scipy.spatial import cKDTree

PAD = 128  # columns copied from the other side, so distances wrap at 180°


def mask(name):
    m = np.asarray(Image.open(f"scripts/.masks/{name}.png").convert("L")) > 127
    return np.concatenate([m[:, -PAD:], m, m[:, :PAD]], axis=1)


def unpad_half(d):
    # back to the original width, sampled at the centres of 4096x2048 texels, in output texels
    d = d[:, PAD:-PAD]
    return 0.5 * (d[0::2, 0::2] + d[1::2, 1::2] + d[0::2, 1::2] + d[1::2, 0::2]) / 4


def signed(name):
    m = mask(name)
    inside = distance_transform_edt(m)
    outside = distance_transform_edt(~m)
    return unpad_half(inside - outside)


rgb = np.stack([signed(n) for n in ("land", "desert", "ice")], axis=-1)
Image.fromarray(np.clip(128 + rgb * 16, 0, 255).round().astype(np.uint8), "RGB").save(
    "assets/earth-sdf.png", optimize=True
)

W, H = 4096, 2048
pts = []
dirs = []
for line in json.load(open("scripts/.masks/borders.json")):
    line = np.asarray(line, dtype=float)
    for a, b in zip(line[:-1], line[1:]):
        if abs(b[0] - a[0]) > W / 2:  # a piece crossing the 180th meridian
            continue
        n = max(1, int(np.ceil(np.hypot(*(b - a)) * 20)))
        t = np.linspace(0, 1, n + 1)[:, None]
        pts.append(a + (b - a) * t)
        dirs.append(np.repeat([(b - a) / np.hypot(*(b - a))], n + 1, axis=0))
pts = np.concatenate(pts)
dirs = np.concatenate(dirs)
pts = np.concatenate([pts, pts + [W, 0], pts - [W, 0]])
dirs = np.concatenate([dirs, dirs, dirs])
yy, xx = np.mgrid[0:H, 0:W] + 0.5
xy = np.stack([xx.ravel(), yy.ravel()], axis=1)
dist, idx = cKDTree(pts).query(xy, distance_upper_bound=4.5, workers=-1)
near = idx < len(pts)
side = np.ones(len(xy))
d = xy[near] - pts[idx[near]]
side[near] = np.where(dirs[idx[near], 0] * d[:, 1] - dirs[idx[near], 1] * d[:, 0] >= 0, 1.0, -1.0)
dist = np.minimum(dist, 4.5)
r = np.clip(dist * 64, 0, 255).reshape(H, W)
g = np.clip(128 + side * np.minimum(dist, 3.9) * 32, 0, 255).reshape(H, W)
Image.fromarray(np.stack([r, g, np.zeros_like(r)], axis=-1).round().astype(np.uint8), "RGB").save(
    "assets/earth-borders.png", optimize=True
)
