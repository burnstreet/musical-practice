"""App icons from the LKG logo: the cross on white, "2026" bottom right.

usage: python tools/make_icons.py   (reads public/logo.png, writes public/icons/icon-{180,192,512}.png)
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
BLUE = (31, 95, 171)  # tokens.css --bg #1F5FAB
FONTS = ["C:/Windows/Fonts/segoeuib.ttf", "C:/Windows/Fonts/arialbd.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]


def cross(logo: Image.Image) -> Image.Image:
    """The cross: left part of the logo, with the lettering (right of the stem, below the right arm) cleared."""
    w, h = logo.size
    c = logo.convert("RGBA").crop((0, 0, round(w * 0.462), h))
    ImageDraw.Draw(c).rectangle((round(w * 0.28), round(h * 0.44), c.width, c.height), fill=(0, 0, 0, 0))
    return c.crop(c.getbbox())


def icon(size: int, mark: Image.Image, font_path: str) -> Image.Image:
    img = Image.new("RGBA", (size, size), "white")
    ch = round(size * 0.80)
    cw = round(mark.width * ch / mark.height)
    m = mark.resize((cw, ch), Image.LANCZOS)
    img.alpha_composite(m, (round(size * 0.12), round((size - ch) / 2)))
    font = ImageFont.truetype(font_path, round(size * 0.16))
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = d.textbbox((0, 0), "2026", font=font)
    pad = round(size * 0.07)
    d.text((size - pad - x1, size - pad - y1), "2026", font=font, fill=BLUE)
    return img.convert("RGB")


def main() -> int:
    font = next((f for f in FONTS if Path(f).exists()), None)
    if not font:
        print("no bold font found", file=sys.stderr)
        return 1
    mark = cross(Image.open(ROOT / "public" / "logo.png"))
    out = ROOT / "public" / "icons"
    for size in (180, 192, 512):
        icon(size, mark, font).save(out / f"icon-{size}.png", optimize=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
