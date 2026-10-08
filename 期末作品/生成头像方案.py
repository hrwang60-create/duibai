# -*- coding: utf-8 -*-
"""生成「对白」小程序头像候选方案（代码绘制，非 AI 生成）。
先在 512px 上绘制再降采样到 144px，边缘平滑。
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageChops

S = 512
OUT = 144
TEAL = (15, 110, 86)
CORAL = (255, 122, 89)
WHITE = (255, 255, 255)
LIGHT = (247, 245, 240)

DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "小程序头像方案")
os.makedirs(DIR, exist_ok=True)


def font(size, bold=True):
    for p in (r"C:\Windows\Fonts\msyhbd.ttc", r"C:\Windows\Fonts\msyh.ttc",
              r"C:\Windows\Fonts\simhei.ttf"):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def base(bg):
    im = Image.new("RGB", (S, S), bg)
    return im, ImageDraw.Draw(im)


def dual_waveform(bg, c_left, c_right):
    """双色波形：左半一个颜色、右半另一个颜色，象征双音色。"""
    im, d = base(bg)
    heights = [86, 178, 300, 214, 330, 168, 92]
    w, gap = 38, 22
    total = len(heights) * w + (len(heights) - 1) * gap
    x0 = (S - total) // 2
    layer = Image.new("L", (S, S), 0)
    ld = ImageDraw.Draw(layer)
    for i, h in enumerate(heights):
        x = x0 + i * (w + gap)
        y0 = (S - h) // 2
        ld.rounded_rectangle([x, y0, x + w, y0 + h], radius=w // 2, fill=255)
    half = Image.new("L", (S, S), 0)
    ImageDraw.Draw(half).rectangle([0, 0, S // 2, S], fill=255)
    m_left = ImageChops.darker(layer, half)
    m_right = ImageChops.subtract(layer, half)
    im.paste(Image.new("RGB", (S, S), c_left), (0, 0), m_left)
    im.paste(Image.new("RGB", (S, S), c_right), (0, 0), m_right)
    return im


def bubble_play():
    """对话气泡 + 播放三角。"""
    im, d = base(CORAL)
    d.rounded_rectangle([106, 116, 406, 396], radius=64, fill=WHITE)
    d.polygon([(220, 196), (220, 316), (312, 256)], fill=TEAL)
    return im


def headphone():
    """耳机：头梁 + 两个耳罩。"""
    im, d = base(TEAL)
    d.arc([126, 140, 386, 400], start=180, end=360, fill=WHITE, width=34)
    d.rounded_rectangle([96, 250, 158, 372], radius=31, fill=WHITE)
    d.rounded_rectangle([354, 250, 416, 372], radius=31, fill=WHITE)
    return im


def venn():
    """双圆重叠：两个人 / 两种音色的交集。"""
    im, d = base(TEAL)
    m1 = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m1).ellipse([96, 146, 316, 366], fill=255)
    m2 = Image.new("L", (S, S), 0)
    ImageDraw.Draw(m2).ellipse([196, 146, 416, 366], fill=255)
    im.paste(Image.new("RGB", (S, S), CORAL), (0, 0), m1)
    im.paste(Image.new("RGB", (S, S), WHITE), (0, 0), m2)
    lens = ImageChops.darker(m1, m2)
    im.paste(Image.new("RGB", (S, S), (247, 196, 170)), (0, 0), lens)
    return im


def hanzi():
    """汉字「对白」。"""
    im, d = base(TEAL)
    d.text((S // 2, S // 2), "对白", font=font(178), fill=WHITE, anchor="mm")
    return im


def light_wave():
    """浅色底 + 深色双色波形。"""
    return dual_waveform(LIGHT, TEAL, CORAL)


PLANS = [
    ("01-双色波形", lambda: dual_waveform(TEAL, CORAL, WHITE)),
    ("02-气泡加播放", bubble_play),
    ("03-耳机", headphone),
    ("04-双圆重叠", venn),
    ("05-汉字对白", hanzi),
    ("06-浅色底波形", light_wave),
]

made = []
for name, fn in PLANS:
    big = fn()
    small = big.resize((OUT, OUT), Image.LANCZOS)
    p = os.path.join(DIR, f"{name}.png")
    small.save(p, optimize=True)
    made.append((name, p, big))
    print(f"  {name:16s} {os.path.getsize(p):>6d} bytes")

# ---------- 对比图（3 列 x 2 行） ----------
CELL, LAB, PAD, COLS = 180, 34, 14, 3
ROWS = (len(made) + COLS - 1) // COLS
cw, ch = CELL + PAD * 2, CELL + LAB + PAD * 2
sheet = Image.new("RGB", (cw * COLS, ch * ROWS), (245, 244, 240))
sd = ImageDraw.Draw(sheet)
lf = font(18)
for i, (name, _, big) in enumerate(made):
    r, c = divmod(i, COLS)
    x, y = c * cw + PAD, r * ch + PAD
    sheet.paste(big.resize((CELL, CELL), Image.LANCZOS), (x, y))
    sd.rectangle([x - 1, y - 1, x + CELL, y + CELL], outline=(200, 198, 192))
    sd.text((x + CELL // 2, y + CELL + LAB // 2), name, font=lf,
            fill=(40, 40, 38), anchor="mm")
sp = os.path.join(DIR, "对比图.png")
sheet.save(sp, optimize=True)
print("\n对比图:", sp, os.path.getsize(sp), "bytes")
