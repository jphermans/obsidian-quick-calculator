#!/usr/bin/env python3
"""Generate banner.png for obsidian-quick-calculator README."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

W, H = 1280, 640
OUT = os.path.join(os.path.dirname(__file__) or ".", "banner.png")

# Font loading helper
def load_font(size, candidates=None):
    if candidates is None:
        candidates = ["/System/Library/Fonts/Helvetica.ttc"]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            pass
    return ImageFont.load_default()

font_title   = load_font(56, ["/System/Library/Fonts/Helvetica.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"])
font_sub     = load_font(28, ["/System/Library/Fonts/Helvetica.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"])
font_tag     = load_font(17, ["/System/Library/Fonts/Helvetica.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"])
font_key     = load_font(16, ["/System/Library/Fonts/Helvetica.ttc", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"])
font_disp    = load_font(24, ["/System/Library/Fonts/Menlo.ttc", "/System/Library/Fonts/SF-Mono.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"])
font_sym     = load_font(48, ["/System/Library/Fonts/STIXGeneral.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"])
font_latex   = load_font(20, ["/System/Library/Fonts/Latin Modern Math.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"])

# ── Canvas ─────────────────────────────────────────────────
img = Image.new("RGBA", (W, H), (30, 30, 46, 255))

# Grid
grid = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gdraw = ImageDraw.Draw(grid)
for sp in [32]:
    for x in range(0, W, sp):
        gdraw.line([(x, 0), (x, H)], fill=(255, 255, 255, 5), width=1)
    for y in range(0, H, sp):
        gdraw.line([(0, y), (W, y)], fill=(255, 255, 255, 5), width=1)
img = Image.alpha_composite(img, grid)

# Top accent gradient
for x in range(W):
    r = int(124 + (100 - 124) * x / W)
    g = int(58 + (143 - 58) * x / W)
    b = int(237 + (220 - 237) * x / W)
    img.putpixel((x, 0), (r, g, b, 255))

draw = ImageDraw.Draw(img)

# ── Calculator illustration ────────────────────────────────
cx, cy = 360, 320
bw, bh = 220, 280
rx = 20

# Shadow
shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
sdraw = ImageDraw.Draw(shadow)
sdraw.rounded_rectangle([cx - bw // 2 + 6, cy - bh // 2 + 6, cx + bw // 2 + 6, cy + bh // 2 + 6],
                        radius=rx, fill=(0, 0, 0, 60))
img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(8)))
draw = ImageDraw.Draw(img)

# Body
draw.rounded_rectangle([cx - bw // 2, cy - bh // 2, cx + bw // 2, cy + bh // 2],
                       radius=rx, fill=(45, 45, 60, 255), outline=(80, 80, 100, 255), width=2)

# Display
dm = 16
draw.rounded_rectangle([cx - bw // 2 + dm, cy - bh // 2 + dm,
                        cx + bw // 2 - dm, cy - bh // 2 + 55],
                       radius=8, fill=(25, 25, 35, 255))
draw.text((cx + bw // 2 - dm - 12, cy - bh // 2 + 18), "42\u00d7\u03c0",
          fill=(124, 58, 237, 255), font=font_disp, anchor="ra")

# Keys
kw, kh, gap = 40, 32, 6
gl = cx - bw // 2 + dm + 4
gt = cy - bh // 2 + 72
cols = {
    "fn": (60, 60, 75), "op": (124, 58, 237), "num": (55, 55, 68), "eq": (124, 58, 237)
}
keys = [
    ("C", "fn"), ("\u232b", "fn"), ("%", "op"), ("\u00f7", "op"),
    ("7", "num"), ("8", "num"), ("9", "num"), ("\u00d7", "op"),
    ("4", "num"), ("5", "num"), ("6", "num"), ("\u2212", "op"),
    ("1", "num"), ("2", "num"), ("3", "num"), ("+", "op"),
    ("\u00b1", "fn"), ("0", "num"), (".", "num"), ("=", "eq"),
]
for i, (label, kind) in enumerate(keys):
    row, col = i // 4, i % 4
    kx, ky = gl + col * (kw + gap), gt + row * (kh + gap)
    draw.rounded_rectangle([kx, ky, kx + kw, ky + kh], radius=5, fill=cols.get(kind, (55, 55, 68)))
    bbox = draw.textbbox((0, 0), label, font=font_key)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx, ty = kx + (kw - tw) // 2, ky + (kh - th) // 2 - 1
    color = (255, 255, 255) if kind == "eq" else (220, 220, 230)
    draw.text((tx, ty), label, fill=color, font=font_key)

# ── Title & text ───────────────────────────────────────────
tx = cx + bw // 2 + 70
draw.text((tx, 200), "Quick Calculator", fill=(255, 255, 255), font=font_title)
draw.text((tx, 278), "Obsidian Plugin", fill=(180, 180, 200), font=font_sub)
draw.rounded_rectangle([tx, 314, tx + 180, 318], radius=2, fill=(124, 58, 237, 255))

# Feature tags
tags = ["desktop \u00b7 mobile", "scientific", "LaTeX export", "no eval"]
tag_x, tag_y = tx, 350
for tag in tags:
    bbox = draw.textbbox((0, 0), tag, font=font_tag)
    tw = bbox[2] - bbox[0]
    tag_w = tw + 20
    draw.rounded_rectangle([tag_x, tag_y, tag_x + tag_w, tag_y + 28], radius=12,
                           fill=(60, 60, 80, 200))
    draw.text((tag_x + 10, tag_y + 5), tag, fill=(200, 200, 220), font=font_tag)
    tag_x += tag_w + 10

# ── Decorative math symbols ─────────────────────────────────
symbols = [
    ("\u03c0", 1100, 100, 48, (124, 58, 237, 40)),
    ("\u221a", 100, 500, 52, (124, 58, 237, 30)),
    ("\u03a3", 1150, 520, 40, (124, 58, 237, 35)),
    ("\u222b", 80, 160, 44, (124, 58, 237, 25)),
    ("\u221e", 1180, 300, 36, (124, 58, 237, 30)),
    ("e", 50, 330, 38, (124, 58, 237, 28)),
]
for sym, sx, sy, size, color in symbols:
    try:
        f = load_font(size, ["/System/Library/Fonts/STIXGeneral.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"])
    except:
        f = font_sym
    draw.text((sx, sy), sym, fill=color, font=f)

# LaTeX formula
draw.text((tx, 500), "$\\sin(45) + \\sqrt{16} = 4.7071$",
          fill=(160, 160, 180, 120), font=font_latex)

# ── Save ────────────────────────────────────────────────────
img.save(OUT, "PNG", optimize=True)
print(f"OK  {OUT}  ({img.width}x{img.height})  {os.path.getsize(OUT)} bytes")
