"""Turns the masks from bake-earth.ts into the globe's distance-field images.

earth-sdf.png (4096x2048, RGB): land, desert and ice as signed distances to
their edges, 128 on the edge, brighter inside, 16 levels per texel, out to
8 texels either side. earth-borders.png (4096x2048, grey): distance to the
nearest country border, 64 levels per texel, out to 4 texels.
Distances are measured on the 8192-wide masks and wrap across the 180th
meridian.
"""
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt

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

borders = unpad_half(distance_transform_edt(~mask("borders")))
Image.fromarray(np.clip(borders * 64, 0, 255).round().astype(np.uint8), "L").save(
    "assets/earth-borders.png", optimize=True
)
