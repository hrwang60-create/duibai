# -*- coding: utf-8 -*-
"""
生成底部 tabBar 图标（墨与朱两色，线性风格）

设计约束（依据 UI设计规范.md）：
  · 线性图标，统一 3px 描边，统一 81×81（微信推荐尺寸）
  · **未选中用中性灰，选中用朱红** —— 与全站「墨与朱」一致
  · 不画五颜六色的图标
"""

import os
from PIL import Image, ImageDraw

OUT = r'C:\Users\MI\Desktop\个人软件选题与需求分析2\期末作品\duibai-app\static\icons'

SIZE = 81          # 微信推荐 81×81
W = 3              # 描边宽度
IDLE = (189, 185, 176, 255)     # #BDB9B0 未选中
ACTIVE = (200, 69, 44, 255)     # #C8452C 朱红


def new_canvas():
    img = Image.new('RGBA', (SIZE * 4, SIZE * 4), (0, 0, 0, 0))   # 4 倍超采样
    return img, ImageDraw.Draw(img)


def S(v):
    return v * 4


def save(img, name):
    path = os.path.join(OUT, name)
    img.resize((SIZE, SIZE), Image.LANCZOS).save(path, 'PNG', optimize=True)
    return path


def draw_home(d, c):
    """对白 —— 两个对话气泡，一上一下，代表「两个人的谈话」"""
    # 气泡一（右上，先画，下层）
    d.rounded_rectangle([S(20), S(12), S(68), S(40)], radius=S(6),
                        outline=c, width=S(W))
    d.polygon([(S(28), S(40)), (S(28), S(47)), (S(37), S(40))], fill=c)
    # 气泡二（左下，压在上层）
    d.rounded_rectangle([S(12), S(40), S(60), S(68)], radius=S(6),
                        outline=c, width=S(W))
    d.polygon([(S(52), S(68)), (S(52), S(75)), (S(43), S(68))], fill=c)


def draw_history(d, c):
    """历史 —— 时钟（往回看）"""
    d.ellipse([S(14), S(14), S(67), S(67)], outline=c, width=S(W))
    cx = cy = S(40.5)
    d.line([(cx, cy), (cx, S(26))], fill=c, width=S(W))          # 时针
    d.line([(cx, cy), (S(53), S(46))], fill=c, width=S(W))      # 分针
    d.ellipse([S(37), S(37), S(44), S(44)], fill=c)              # 中心点


def draw_mine(d, c):
    """我的 —— 圆头 + 肩线"""
    d.ellipse([S(28), S(15), S(53), S(40)], outline=c, width=S(W))          # 头
    d.arc([S(17), S(44), S(64), S(91)], start=180, end=360, fill=c, width=S(W))  # 肩


ICONS = [('tab-home', draw_home), ('tab-history', draw_history), ('tab-mine', draw_mine)]

os.makedirs(OUT, exist_ok=True)
made = []
for name, fn in ICONS:
    for state, color in (('off', IDLE), ('on', ACTIVE)):
        img, d = new_canvas()
        fn(d, color)
        p = save(img, '%s-%s.png' % (name, state))
        made.append(os.path.basename(p))

print('已生成 %d 个图标：' % len(made))
for m in made:
    print('  static/icons/%s' % m)
