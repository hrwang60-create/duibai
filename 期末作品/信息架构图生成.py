# -*- coding: utf-8 -*-
"""「对白」信息架构思维导图 —— 生成高分辨率 PNG"""
from PIL import Image, ImageDraw, ImageFont
import os

SS = 2
W, H = 3000, 2700
img = Image.new("RGB", (W * SS, H * SS), "#FFFFFF")
d = ImageDraw.Draw(img, "RGBA")


def S(v):
    return int(round(v * SS))


FONT_DIR = "C:/Windows/Fonts/"
CAND = {
    "reg": ["Noto Sans SC (TrueType).otf", "msyh.ttc"],
    "med": ["Noto Sans SC Medium (TrueType).otf", "msyhbd.ttc", "msyh.ttc"],
    "bold": ["Noto Sans SC Bold (TrueType).otf", "msyhbd.ttc", "msyh.ttc"],
}


def _path(kind):
    for name in CAND[kind]:
        p = FONT_DIR + name
        if os.path.exists(p):
            return p
    raise RuntimeError("no font for " + kind)


_cache = {}


def F(kind, size):
    key = (kind, size)
    if key not in _cache:
        _cache[key] = ImageFont.truetype(_path(kind), S(size))
    return _cache[key]


def rbox(x0, y0, x1, y1, fill=None, outline=None, width=2, r=14):
    d.rounded_rectangle([S(x0), S(y0), S(x1), S(y1)], radius=S(r),
                        fill=fill, outline=outline, width=S(width) if outline else 0)


def txt(x, y, s, kind, size, fill, anchor="mm"):
    d.text((S(x), S(y)), s, font=F(kind, size), fill=fill, anchor=anchor)


def bez(p0, c1, c2, p1, n=56):
    pts = []
    for i in range(n + 1):
        t = i / n
        m = 1 - t
        x = m**3 * p0[0] + 3 * m * m * t * c1[0] + 3 * m * t * t * c2[0] + t**3 * p1[0]
        y = m**3 * p0[1] + 3 * m * m * t * c1[1] + 3 * m * t * t * c2[1] + t**3 * p1[1]
        pts.append((S(x), S(y)))
    return pts


def curve(p0, c1, c2, p1, color, w=3):
    d.line(bez(p0, c1, c2, p1), fill=color, width=S(w), joint="curve")


C = {
    "ink":   "#15202B",
    "sub":   "#6B7A8C",
    "panel": "#F8FAFC",
    "pline": "#E4EAF1",
    "L1": ("#3C3489", "#6B4FD8", "#F2EFFC"),
    "L2": ("#7A4A0B", "#C07A1F", "#FDF5E7"),
    "L3": ("#085041", "#0E8F78", "#E6F5F1"),
    "L4": ("#0B4F6C", "#1C7FA8", "#E6F2F9"),
    "L5": ("#2C3E50", "#5A6B7D", "#EFF2F5"),
    "R1": ("#8A3520", "#D4693A", "#FBEDE7"),
    "R2": ("#14513C", "#1D7A5F", "#E7F3EF"),
    "R3": ("#0C447C", "#2F6FD0", "#E8F0FC"),
    "R4": ("#5A3A7A", "#8E5FC0", "#F2EDF9"),
    "R5": ("#7A3A5A", "#C05A8A", "#FBEAF1"),
}

# ---------------- 标题 ----------------
txt(120, 78, "「对白」信息架构思维导图", "bold", 54, C["ink"], "lm")
txt(120, 132, "双人对谈听觉内容小程序  ·  C 端 10 页 + 管理端 4 页 + 组件 14 个  ·  云端 7 云函数 + 1 公共模块 / 数据库 11 张表",
    "reg", 27, C["sub"], "lm")
d.line([S(120), S(168), S(2880), S(168)], fill="#D8E0E8", width=S(2))

# ---------------- 背景面板 ----------------
rbox(320, 226, 1260, 2560, fill=C["panel"], outline=C["pline"], width=2, r=24)
rbox(1620, 226, 2560, 2560, fill=C["panel"], outline=C["pline"], width=2, r=24)
txt(320, 200, "一、产品逻辑（用户看到什么）", "med", 28, C["sub"], "lm")
txt(1620, 200, "二、技术与结构（怎么做到的）", "med", 28, C["sub"], "lm")

# ---------------- 布局 ----------------
LX_LEAF_R, LX_LEAF_W = 900, 560
LX_MAIN_R, LX_MAIN_W = 1240, 320
RX_MAIN_L, RX_MAIN_W = 1640, 320
RX_LEAF_L, RX_LEAF_W = 1980, 560
MAIN_H, LEAF_H = 76, 54
ROOT = (1440, 1350)

# ---------------- 内容 ----------------
LEFT = [
    ("L1", "① 核心链路", 430, [
        "投一篇文章 · 粘贴或选文件",
        "生成中 · 阶段反馈 + 对话预演",
        "确认 · 可疑处让对话「停住」",
        "结果 · 对话流而非播放器",
        "出处 · 就地展开不打断",
    ]),
    ("L2", "② 内容与口吻", 830, [
        "每日一集 · 离线预置 7 集",
        "用户上传文章（主链路）",
        "6 种口吻 · 选中即预览",
        "口吻提示词由管理端维护",
    ]),
    ("L3", "③ 回溯与修正", 1350, [
        "每条台词可点回原文",
        "原文页自动定位并高亮",
        "单句重做 · 三选一换说法",
        "历史显示「对话痕迹」",
        "长按可删除一场对谈",
    ]),
    ("L4", "④ 组件体系", 1810, [
        "14 个自研组件（0 个第三方 UI 库）",
        "基础 8 · 业务 6，分目录独立",
        "组件显式 import + 注册",
        "覆盖三态 · 触控 ≥88rpx",
    ]),
    ("L5", "⑤ 异常与降级", 2270, [
        "内容不适合转音频",
        "语音合成不可用",
        "未登录 / 未配密钥的提示",
        "降级 · 文字 + 阅读节奏",
        "空 / 加载 / 错误态齐全",
    ]),
]

RIGHT = [
    ("R1", "① C 端页面", 430, [
        "对白（首页 · 默认/输入两态）",
        "每日一集 · 今日大卡 + 往期",
        "历史 · 我的",
        "生成中 · 确认 · 结果",
        "原文 · 登录 · 错误降级",
    ]),
    ("R2", "② 云端架构", 890, [
        "业务云函数 7 个 + 公共模块 1",
        "云数据库 11 张表 · 权限全关",
        "data 为唯一数据网关",
        "app-config 密钥模块（环境变量）",
        "自签 HMAC 令牌 · 无 uni-id",
    ]),
    ("R3", "③ 第三方能力", 1350, [
        "DeepSeek · 文章 → 对话稿",
        "火山引擎语音合成 · 甲乙双音色",
        "微信登录 jscode2session",
        "仅此 2 个第三方 API",
    ]),
    ("R4", "④ 设计体系 · 纸墨", 1810, [
        "设计令牌 73 个 · 全部走令牌",
        "纸阶两层 · 墨与朱两色",
        "字号 9 级 · 间距 8 段",
        "对比度实测达 WCAG AA",
        "零渐变 · 零阴影 · 零第三方 UI",
    ]),
    ("R5", "⑤ 管理端 · 验收", 2270, [
        "管理端 4 页 · 数据/用户/Banner/口吻",
        "6 项自动验收脚本",
        "云端自检 64 项通过",
        "打包自动脱敏密钥",
        "使用规则与体验规范文档",
    ]),
]

SP = 68

# ---------------- 溢出检测 ----------------
def check(text, kind, size, box_w, pad, tag):
    w = d.textlength(text, font=F(kind, size)) / SS
    if w > box_w - 2 * pad:
        print("[溢出] %-30s 文字宽 %.0f > 可用宽 %.0f  (%s)" % (text, w, box_w - 2 * pad, tag))
        return False
    return True


_bad = 0
for key, title, cy, leaves in LEFT + RIGHT:
    if not check(title, "med", 29, 320, 12, "主节点"):
        _bad += 1
for key, title, cy, leaves in LEFT:
    for s in leaves:
        if not check(s, "reg", 26, 560, 16, "左叶子"):
            _bad += 1
for key, title, cy, leaves in RIGHT:
    for s in leaves:
        if not check(s, "reg", 26, 560, 16, "右叶子"):
            _bad += 1
check("对白", "bold", 32, 320, 16, "根节点")
print("溢出检测：%s" % ("全部通过" if _bad == 0 else "%d 处需修正" % _bad))

# ---------------- 连线 ----------------
for key, _, cy, leaves in LEFT:
    mid = C[key][1]
    curve((ROOT[0] - 160, ROOT[1]), (ROOT[0] - 200, ROOT[1]), (LX_MAIN_R, cy), (LX_MAIN_R, cy), mid, 4)
    n = len(leaves)
    y0 = cy - (n - 1) * SP / 2
    for i in range(n):
        ly = y0 + i * SP
        curve((LX_MAIN_R - LX_MAIN_W, cy), (LX_MAIN_R - LX_MAIN_W - 30, cy), (LX_LEAF_R, ly), (LX_LEAF_R, ly), mid, 3)

for key, _, cy, leaves in RIGHT:
    mid = C[key][1]
    curve((ROOT[0] + 160, ROOT[1]), (ROOT[0] + 200, ROOT[1]), (RX_MAIN_L, cy), (RX_MAIN_L, cy), mid, 4)
    n = len(leaves)
    y0 = cy - (n - 1) * SP / 2
    for i in range(n):
        ly = y0 + i * SP
        curve((RX_MAIN_L + RX_MAIN_W, cy), (RX_MAIN_L + RX_MAIN_W + 30, cy), (RX_LEAF_L, ly), (RX_LEAF_L, ly), mid, 3)

# ---------------- 根节点 ----------------
rbox(ROOT[0] - 160, ROOT[1] - 52, ROOT[0] + 160, ROOT[1] + 52, fill=C["ink"], r=18)
txt(ROOT[0], ROOT[1] - 16, "对白", "bold", 34, "#FFFFFF")
txt(ROOT[0], ROOT[1] + 22, "把文章，聊给你听", "reg", 22, "#B8C6D4")

# ---------------- 左节点 ----------------
for key, title, cy, leaves in LEFT:
    dark, mid, light = C[key]
    rbox(LX_MAIN_R - LX_MAIN_W, cy - MAIN_H / 2, LX_MAIN_R, cy + MAIN_H / 2, fill=mid, r=16)
    txt(LX_MAIN_R - LX_MAIN_W / 2, cy, title, "med", 29, "#FFFFFF")
    n = len(leaves)
    y0 = cy - (n - 1) * SP / 2
    for i, s in enumerate(leaves):
        ly = y0 + i * SP
        rbox(LX_LEAF_R - LX_LEAF_W, ly - LEAF_H / 2, LX_LEAF_R, ly + LEAF_H / 2,
             fill=light, outline=mid, width=2, r=14)
        txt(LX_LEAF_R - LX_LEAF_W / 2, ly, s, "reg", 26, dark)

# ---------------- 右节点 ----------------
for key, title, cy, leaves in RIGHT:
    dark, mid, light = C[key]
    rbox(RX_MAIN_L, cy - MAIN_H / 2, RX_MAIN_L + RX_MAIN_W, cy + MAIN_H / 2, fill=mid, r=16)
    txt(RX_MAIN_L + RX_MAIN_W / 2, cy, title, "med", 29, "#FFFFFF")
    n = len(leaves)
    y0 = cy - (n - 1) * SP / 2
    for i, s in enumerate(leaves):
        ly = y0 + i * SP
        rbox(RX_LEAF_L, ly - LEAF_H / 2, RX_LEAF_L + RX_LEAF_W, ly + LEAF_H / 2,
             fill=light, outline=mid, width=2, r=14)
        txt(RX_LEAF_L + RX_LEAF_W / 2, ly, s, "reg", 26, dark)

# ---------------- 页脚 ----------------
d.line([S(120), S(2600), S(2880), S(2600)], fill="#D8E0E8", width=S(2))
txt(120, 2646,
    "设计语言：纸阶两层 · 墨与朱两色 · 对话流代替播放器 · 可疑处让对话「停住」   |   "
    "核心链路：文章 → 对话稿 → 双人音频   |   每条台词均可回溯原文   |   14 个组件 0 个第三方 UI 库",
    "reg", 24, C["sub"], "lm")

OUT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "提交物", "01-信息架构图")
os.makedirs(OUT_DIR, exist_ok=True)
out = os.path.join(OUT_DIR, "对白-信息架构思维导图.png")
img.resize((W, H), Image.LANCZOS).save(out, "PNG", optimize=True)
print("saved:", out)
print("size:", os.path.getsize(out) // 1024, "KB")
