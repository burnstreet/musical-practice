"""App icons from the LKG logo: the cross on white, "20" over "26" to its lower right.

Everything sits inside the Android maskable safe zone (circle of 80 % diameter), so launchers can
mask the icon to any shape without cutting the cross or the year.

usage: python tools/make_icons.py   (reads public/logo.png, writes public/icons/icon-{180,192,512}.png)
"""

import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BLUE = (31, 95, 171)  # tokens.css --bg #1F5FAB
FONTS = ["C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]
SAFE = 0.39  # radius of the content, fraction of the icon size (safe zone is 0.40)
U = 2000  # layout units: the cross is 1600 high, as on the previous 0.8-of-the-icon design


def cross(logo: Image.Image) -> Image.Image:
    """The cross: left part of the logo, with the lettering (right of the stem, below the right arm) cleared."""
    w, h = logo.size
    c = logo.convert("RGBA").crop((0, 0, round(w * 0.462), h))
    ImageDraw.Draw(c).rectangle((round(w * 0.28), round(h * 0.44), c.width, c.height), fill=(0, 0, 0, 0))
    return c.crop(c.getbbox())


def artwork(mark: Image.Image, font_path: str) -> Image.Image:
    """Cross plus year on a transparent layer, cropped to the content."""
    art = Image.new("RGBA", (U, U), (0, 0, 0, 0))
    ch = round(U * 0.8)
    cw = round(mark.width * ch / mark.height)
    left = round(U * 0.2)  # room in case the year reaches past the left arm
    art.alpha_composite(mark.resize((cw, ch), Image.LANCZOS), (left, 0))
    font = ImageFont.truetype(font_path, round(U * 0.16))  # same size as the one-line version
    d = ImageDraw.Draw(art)
    # Year left of the stem, under the left arm: Chrome overlays its badge on the bottom right corner.
    stem_left = left + round(cw * 0.380 / 0.922)  # stem's left edge in the logo, relative to the cross width
    line = font.getbbox("20")
    lh = line[3] - line[1]
    gap = round(lh * 0.25)
    x = stem_left - round(U * 0.05) - (line[2] - line[0])
    bottom = round(ch * 0.86)  # a bit above the stem's foot
    for i, text in enumerate(("20", "26")):
        top = bottom - (2 - i) * lh - (1 - i) * gap
        d.text((x - line[0], top - line[1]), text, font=font, fill=BLUE)
    return art.crop(art.getbbox())


def fit_radius(art: Image.Image) -> float:
    """Largest distance of an opaque pixel from the artwork's centre, in artwork pixels."""
    small = art.getchannel("A").resize((art.width // 8, art.height // 8))
    cx, cy = small.width / 2, small.height / 2
    px = small.load()
    r = max(math.hypot(x + 0.5 - cx, y + 0.5 - cy) for y in range(small.height) for x in range(small.width) if px[x, y] > 16)
    return (r + 1) * 8


def icon(size: int, art: Image.Image, radius: float) -> Image.Image:
    img = Image.new("RGBA", (size, size), "white")
    k = SAFE * size / radius
    a = art.resize((round(art.width * k), round(art.height * k)), Image.LANCZOS)
    img.alpha_composite(a, (round((size - a.width) / 2), round((size - a.height) / 2)))
    return img.convert("RGB")


def main() -> int:
    font = next((f for f in FONTS if Path(f).exists()), None)
    if not font:
        print("no bold font found", file=sys.stderr)
        return 1
    art = artwork(cross(Image.open(ROOT / "public" / "logo.png")), font)
    radius = fit_radius(art)
    out = ROOT / "public" / "icons"
    for size in (180, 192, 512):
        icon(size, art, radius).save(out / f"icon-{size}.png", optimize=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
