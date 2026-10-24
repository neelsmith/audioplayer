"""Make app icons from scratch/white_ipod.png (kept as the source).

Usage (needs Pillow):  python3 build/make_icons.py scratch/white_ipod.png src/icons

The outline numbers below were measured from that photo; a different source
image needs new L/T/R/B/RADIUS values.

apple-touch-icon.png  180x180, opaque white, device ~85% of height (iOS rounds the corners)
favicon-32/64.png     transparent background: the device cut out along its rounded-rectangle
                      outline (measured from the photo), so the drop shadow is left behind.
"""
import sys
from PIL import Image, ImageDraw

src = Image.open(sys.argv[1]).convert('RGB')
out = sys.argv[2]

# Device outline in the 1254x1254 source, measured from its edges.
L, T, R, B, RADIUS = 320, 146, 933, 1101, 57
cx, cy, h = (L + R) / 2, (T + B) / 2, B - T

def square(side):
    return (round(cx - side / 2), round(cy - side / 2), round(cx + side / 2), round(cy + side / 2))

touch = src.crop(square(h / 0.85)).resize((180, 180), Image.LANCZOS)
touch.save(f'{out}/apple-touch-icon.png', optimize=True)

# Anti-aliased rounded-rectangle mask, drawn at 4x and scaled down.
S = 4
big = Image.new('L', (src.width * S, src.height * S), 0)
ImageDraw.Draw(big).rounded_rectangle((L * S, T * S, (R + 1) * S, (B + 1) * S), RADIUS * S, fill=255)
mask = big.resize(src.size, Image.LANCZOS)
rgba = src.copy()
rgba.putalpha(mask)
fav = rgba.crop(square(h * 1.04))
for size in (32, 64):
    fav.resize((size, size), Image.LANCZOS).save(f'{out}/favicon-{size}.png', optimize=True)
