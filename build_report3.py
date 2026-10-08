# -*- coding: utf-8 -*-
"""
实验3 报告 PDF 生成脚本

沿用实验2 的 Markdown → reportlab 解析器，版式与实验1 原版一致。
不同之处：实验3 图较多（9 张，含 3 张界面原型线框图），由本脚本绘制。
"""
import re
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, PageTemplate, Paragraph, Spacer, Table, TableStyle,
    PageBreak, HRFlowable
)
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon

ROOT = Path(r"C:\Users\MI\Desktop\个人软件选题与需求分析2")
SRC = ROOT / "实验3-软件架构与界面设计(报告).md"
OUT = ROOT / "24软件工程-24111302137-王浩然-实验3-软件架构与界面设计.pdf"

FONT = r"C:\Windows\Fonts\msyh.ttc"
FONT_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"
CODE_FONT = r"C:\Windows\Fonts\consola.ttf"

pdfmetrics.registerFont(TTFont("MSYaHei", FONT, subfontIndex=1))
pdfmetrics.registerFont(TTFont("MSYaHeiBold", FONT_BOLD, subfontIndex=1))
pdfmetrics.registerFont(TTFont("Consolas", CODE_FONT))
pdfmetrics.registerFontFamily("MSYaHei", normal="MSYaHei", bold="MSYaHeiBold",
                              italic="MSYaHei", boldItalic="MSYaHeiBold")

PAGE_W, PAGE_H = A4
MARGIN_L = 20 * mm
MARGIN_R = 20 * mm
MARGIN_T = 18 * mm
MARGIN_B = 18 * mm
CONTENT_W = PAGE_W - MARGIN_L - MARGIN_R

INK = colors.HexColor("#111111")
LINE_GRAY = colors.HexColor("#DCDCDC")
LINE_MID = colors.HexColor("#9A9A9A")
WHITE = colors.HexColor("#FFFFFF")
FILL_SOFT = colors.HexColor("#F5F5F5")

base = getSampleStyleSheet()
S = {}
S["TitleCN"] = ParagraphStyle("TitleCN", parent=base["Title"], fontName="MSYaHeiBold",
                              fontSize=16.5, leading=22, alignment=TA_LEFT,
                              textColor=INK, spaceAfter=6)
S["SubTitle"] = ParagraphStyle("SubTitle", parent=base["Normal"], fontName="MSYaHei",
                               fontSize=9, leading=14, alignment=TA_LEFT,
                               textColor=INK, spaceAfter=2)
S["H1CN"] = ParagraphStyle("H1CN", parent=base["Heading1"], fontName="MSYaHeiBold",
                           fontSize=12.4, leading=17, textColor=INK,
                           spaceBefore=12, spaceAfter=7, keepWithNext=True)
S["H2CN"] = ParagraphStyle("H2CN", parent=base["Heading2"], fontName="MSYaHeiBold",
                           fontSize=9.7, leading=14, textColor=INK,
                           spaceBefore=10, spaceAfter=4, keepWithNext=True)
S["H3CN"] = ParagraphStyle("H3CN", parent=base["Heading3"], fontName="MSYaHeiBold",
                           fontSize=9.4, leading=13.5, textColor=INK,
                           spaceBefore=8, spaceAfter=3, keepWithNext=True)
S["BodyCN"] = ParagraphStyle("BodyCN", parent=base["BodyText"], fontName="MSYaHei",
                             fontSize=9, leading=14.2, alignment=TA_LEFT,
                             textColor=INK, spaceAfter=5)
S["SmallCN"] = ParagraphStyle("SmallCN", parent=base["BodyText"], fontName="MSYaHei",
                              fontSize=8.2, leading=12.5, textColor=INK, spaceAfter=3)
S["TableHead"] = ParagraphStyle("TableHead", parent=base["BodyText"], fontName="MSYaHeiBold",
                                fontSize=8.2, leading=10.8, alignment=TA_CENTER,
                                textColor=INK)
S["TableCell"] = ParagraphStyle("TableCell", parent=base["BodyText"], fontName="MSYaHei",
                                fontSize=7.9, leading=10.8, textColor=INK)
S["TableCaption"] = ParagraphStyle("TableCaption", parent=base["Normal"],
                                   fontName="MSYaHei", fontSize=8.8, leading=11.5,
                                   alignment=TA_LEFT, textColor=INK,
                                   spaceBefore=3, spaceAfter=3)
S["Callout"] = ParagraphStyle("Callout", parent=base["BodyText"], fontName="MSYaHei",
                              fontSize=9, leading=13, backColor=FILL_SOFT,
                              borderColor=LINE_GRAY, borderWidth=0.5,
                              borderPadding=6, textColor=INK, spaceAfter=6)
S["CodeBlock"] = ParagraphStyle("CodeBlock", parent=base["BodyText"], fontName="Consolas",
                                fontSize=7.4, leading=10.4, textColor=INK,
                                backColor=FILL_SOFT, leftIndent=6, rightIndent=6,
                                spaceBefore=4, spaceAfter=6)
S["ListItem"] = ParagraphStyle("ListItem", parent=S["BodyCN"], leftIndent=13,
                               bulletIndent=2, spaceAfter=3)

for _st in S.values():
    _st.wordWrap = "CJK"

HEADER_BG = colors.HexColor("#F2F2F2")
ZEBRA_BG = colors.HexColor("#F7F7F7")
GRID_COL = colors.HexColor("#DCDCDC")


def inline(text):
    t = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)

    def _code(m):
        s = m.group(1)
        if re.search(r"[\u4e00-\u9fff]", s):
            return '<font face="MSYaHei">%s</font>' % s
        return '<font face="Consolas">%s</font>' % s

    t = re.sub(r"`(.+?)`", _code, t)
    t = re.sub(r"\*([^*\n]+?)\*", r"\1", t)
    return t


def P(text, style="BodyCN"):
    return Paragraph(inline(text), S[style])


def make_table(headers, body, widths):
    n = len(headers)
    fs = 8.4 if n <= 4 else (7.8 if n == 5 else 7.2)
    hs = ParagraphStyle("hs", parent=S["TableHead"], fontSize=fs + 0.3)
    cs = ParagraphStyle("cs", parent=S["TableCell"], fontSize=fs, leading=fs * 1.36)
    data = [[Paragraph(inline(h), hs) for h in headers]]
    for row in body:
        row = (row + [""] * len(headers))[:len(headers)]
        data.append([Paragraph(inline(c), cs) for c in row])
    t = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
    cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), HEADER_BG),
        ("GRID", (0, 0), (-1, -1), 0.4, GRID_COL),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    for r in range(1, len(data)):
        if r % 2 == 0:
            cmds.append(("BACKGROUND", (0, r), (-1, r), ZEBRA_BG))
    t.setStyle(TableStyle(cmds))
    return t


def col_widths(headers):
    n = len(headers)
    j = "".join(headers)
    if n == 7:                                  # 表12 接口清单
        return [92, 50, 36, 72, 84, 84, CONTENT_W - 418]
    if n == 6 and "需求编号" in j:                # 表14 一致性检查表
        return [44, 108, 120, 74, 62, CONTENT_W - 408]
    if n == 6:                                  # 表10 职责划分表
        return [CONTENT_W / 6] * 6
    if n == 5 and "维度" in j:                    # 表4 技术方案比较
        return [64, 136, 136, CONTENT_W - 336]
    if n == 5:                                  # 表11 数据对象
        return [72, 108, 150, 70, CONTENT_W - 400]
    if n == 4 and "类别" in j:                    # 表1 需求输入
        return [42, 34, CONTENT_W - 190, 114]
    if n == 4 and "关键依赖" in j:                 # 表8 替代方案
        return [70, 140, 160, CONTENT_W - 370]
    if n == 4 and "请求" in j:                    # 表13 调用示例
        return [46, 116, 145, CONTENT_W - 307]
    if n == 4 and "检查发现" in j:                 # 表15 问题与调整
        return [34, 150, 122, CONTENT_W - 306]
    if n == 4 and "图号" in j:                    # 表17 图目录
        return [30, 130, 42, CONTENT_W - 202]
    if n == 4 and "模块" in j:                    # 表9 模块职责
        return [72, 180, 96, CONTENT_W - 348]
    if n == 4:
        return [CONTENT_W / 4] * 4
    if n == 3:
        return [CONTENT_W * 0.16, CONTENT_W * 0.42, CONTENT_W * 0.42]
    if n == 2:
        return [34 * mm, CONTENT_W - 34 * mm]
    return [CONTENT_W / n] * n


def cover_lines(rows):
    out, buf = [], []
    for k, v in rows:
        if v.startswith("http"):
            val = '<a href="%s"><font color="#0563C1"><u>%s</u></font></a>' % (v, inline(v))
        else:
            val = inline(v)
        item = "<b>%s</b>：%s" % (inline(k), val)
        if len(v) > 22:
            if buf:
                out.append("&nbsp;&nbsp;&nbsp;".join(buf))
                buf = []
            out.append(item)
        else:
            buf.append(item)
            if len(buf) == 3:
                out.append("&nbsp;&nbsp;&nbsp;".join(buf))
                buf = []
    if buf:
        out.append("&nbsp;&nbsp;&nbsp;".join(buf))
    return out


# ================================================================ 绘图工具
ROLE = dict(fontName="MSYaHei")

def _t(d, x, y, s, fs=7.5, bold=False, anchor="middle", color=None):
    d.add(String(x, y, s, fontSize=fs, fontName="MSYaHeiBold" if bold else "MSYaHei",
                 fillColor=color or INK, textAnchor=anchor))


def box(d, x, y, w, h, lines, fs=7.5, bold=False, fill=WHITE, stroke=LINE_GRAY, lw=0.9):
    d.add(Rect(x, y, w, h, fillColor=fill, strokeColor=stroke, strokeWidth=lw))
    if isinstance(lines, str):
        lines = [lines]
    n = len(lines)
    lh = fs * 1.32
    y0 = y + h / 2 + (n - 1) * lh / 2 - fs * 0.36
    for i, ln in enumerate(lines):
        _t(d, x + w / 2, y0 - i * lh, ln, fs=fs, bold=bold)


def arrow(d, x1, y1, x2, y2, color=LINE_MID, lw=0.9, dashed=False):
    d.add(Line(x1, y1, x2, y2, strokeColor=color, strokeWidth=lw,
               strokeDashArray=[2, 2] if dashed else None))
    import math
    ang = math.atan2(y2 - y1, x2 - x1)
    L, W = 5.0, 2.6
    p = [(x2, y2),
         (x2 - L * math.cos(ang) + W * math.sin(ang), y2 - L * math.sin(ang) - W * math.cos(ang)),
         (x2 - L * math.cos(ang) - W * math.sin(ang), y2 - L * math.sin(ang) + W * math.cos(ang))]
    d.add(Polygon([c for xy in p for c in xy], fillColor=color, strokeColor=None))


# ---------------------------------------------------------------- 图1 上下文
def draw_context():
    W, H = CONTENT_W, 250
    d = Drawing(W, H)
    box(d, 170, 95, 140, 60, ["「对白」软件", "(浏览器 + 本地服务)"], fs=8.5, bold=True,
        fill=FILL_SOFT, stroke=colors.HexColor("#8C8C8C"), lw=1.4)
    box(d, 20, 100, 110, 46, ["用户", "在校学生"], fs=8.5)
    box(d, 340, 168, 140, 50, ["大语言模型服务", "(云端 API)"], fs=8.5, fill=WHITE)
    box(d, 340, 38, 140, 50, ["语音合成服务", "(云端 API)"], fs=8.5, fill=WHITE)
    box(d, 178, 8, 130, 42, ["本地存储", "SQLite + 音频文件"], fs=8.5, fill=WHITE)
    arrow(d, 132, 130, 168, 130)
    _t(d, 150, 134, "上传/选口吻/确认", fs=6.2, anchor="middle")
    arrow(d, 168, 112, 132, 112)
    _t(d, 150, 104, "对话稿与音频", fs=6.2, anchor="middle")
    arrow(d, 310, 148, 342, 172)
    _t(d, 318, 168, "文章+口吻", fs=6.2, anchor="start")
    arrow(d, 342, 190, 312, 156)
    _t(d, 320, 200, "结构化对话稿", fs=6.2, anchor="start")
    arrow(d, 310, 108, 342, 76)
    _t(d, 316, 100, "台词+情绪指令", fs=6.2, anchor="start")
    arrow(d, 342, 56, 312, 96)
    _t(d, 350, 44, "音频流", fs=6.2, anchor="start")
    arrow(d, 232, 95, 238, 52)
    arrow(d, 250, 52, 244, 95)
    _t(d, 262, 70, "读写文稿与音频", fs=6.2, anchor="start")
    _t(d, 24, 214, "粗边框 = 本软件（含本地服务）", fs=7, anchor="start")
    _t(d, 24, 200, "细边框 = 用户、外部依赖（云端 API）与本地存储", fs=7, anchor="start",
       color=colors.HexColor("#5F5E5A"))
    return d


# ---------------------------------------------------------------- 图2 分层架构
def draw_layered():
    W, H = CONTENT_W, 330
    d = Drawing(W, H)
    tiers = [
        ("表现层（浏览器）", ["上传与口吻选择页", "生成与确认页", "结果页 / 播放器"], 275),
        ("应用服务层", ["文章解析服务", "对话生成编排", "确认与修订服务", "音频合成调度"], 215),
        ("领域层", ["实体：文章 / 段落 / 对话稿 / 对话条目 / 口吻",
                  "规则：听觉可用性校验 / 出处校验 / 可疑处规则"], 155),
        ("AI 能力层", ["LLM 客户端（结构化输出）", "Prompt 模板与口吻配置", "TTS 客户端"], 95),
        ("基础设施层", ["SQLite 数据库", "音频文件存储", "日志与错误记录"], 35),
    ]
    for name, items, y in tiers:
        d.add(Rect(24, y, CONTENT_W - 48, 50, fillColor=FILL_SOFT,
                   strokeColor=colors.HexColor("#8C8C8C"), strokeWidth=0.8))
        _t(d, 36, y + 34, name, fs=8.2, bold=True, anchor="start")
        n = len(items)
        bw = (CONTENT_W - 66) / n
        for i, it in enumerate(items):
            box(d, 30 + i * bw, y + 6, bw - 6, 22, it, fs=6.9)
        if y != 35:
            arrow(d, 60, y, 60, y - 10, lw=1.1)
            arrow(d, CONTENT_W - 60, y - 10, CONTENT_W - 60, y, lw=1.1)
    _t(d, 30, 16, "依赖方向：上层调用下层；AI 能力层与基础设施层不反向依赖表现层（保证模型服务可替换）",
       fs=7, anchor="start")
    return d


# ---------------------------------------------------------------- 图3 数据流向
def draw_dataflow():
    W, H = CONTENT_W, 175
    d = Drawing(W, H)
    steps = [
        ["用户输入", "文件+口吻"], ["表现层"], ["文章解析", "服务"],
        ["段落数据", "(DB)"], ["Prompt", "组装"], ["LLM 生成"],
        ["三项校验", "结构/出处/括号"], ["对话稿数据", "(DB)"],
        ["用户确认", "可疑处"], ["TTS 合成", "双音色"], ["音频片段", "(文件)"],
        ["播放与回看"],
    ]
    n = len(steps)
    bw = (CONTENT_W - 24 - (n - 1) * 6) / n
    y = 96
    xs = []
    for i, s in enumerate(steps):
        x = 12 + i * (bw + 6)
        xs.append(x)
        fill = FILL_SOFT if len(s) > 1 else WHITE
        box(d, x, y, bw, 34, s, fs=6.4, fill=fill)
        if i < n - 1:
            arrow(d, x + bw, y + 17, x + bw + 6, y + 17, lw=0.8)
    x_last = xs[-1] + bw / 2
    x_tts = xs[9] + bw / 2
    d.add(Line(x_last, y, x_last, y - 30, strokeColor=LINE_MID, strokeWidth=0.8))
    d.add(Line(x_last, y - 30, x_tts, y - 30, strokeColor=LINE_MID, strokeWidth=0.8))
    arrow(d, x_tts, y - 30, x_tts, y, lw=0.8)
    _t(d, (x_tts + x_last) / 2, y - 40, "修改某句 → 仅重做该句", fs=6.6)
    _t(d, 12, 150, "数据依次经过：解析落库 → 生成 → 校验 → 落库 → 用户确认 → 合成 → 播放", fs=7.2,
       anchor="start")
    _t(d, 12, 136, "灰底框为处理环节，白底框为数据对象；最后一条回边对应单句修正",
       fs=7, anchor="start", color=colors.HexColor("#5F5E5A"))
    return d


# ---------------------------------------------------------------- 图4 ER 图
def draw_er():
    W, H = CONTENT_W, 330
    d = Drawing(W, H)
    def ent(x, y, w, name, fields):
        h = 16 + len(fields) * 10.6
        d.add(Rect(x, y - h, w, h, fillColor=WHITE, strokeColor=colors.HexColor("#8C8C8C"),
                   strokeWidth=0.9))
        d.add(Rect(x, y - 16, w, 16, fillColor=HEADER_BG, strokeColor=colors.HexColor("#8C8C8C"),
                   strokeWidth=0.9))
        _t(d, x + w / 2, y - 11.5, name, fs=7.6, bold=True)
        for i, f in enumerate(fields):
            _t(d, x + 5, y - 16 - (i + 1) * 10.6 + 3.2, f, fs=6.3, anchor="start")
        return (x, y, w, h)

    ent(24, 320, 116, "TONE 口吻", ["code PK", "name", "description", "prompt_template"])
    ent(24, 214, 116, "ARTICLE 文章", ["id PK", "title", "content", "created_at"])
    ent(24, 108, 116, "PARAGRAPH 段落", ["id PK", "article_id FK", "seq", "text"])
    ent(190, 320, 132, "DIALOGUE_SCRIPT", ["id PK", "article_id FK", "tone_code FK", "status", "created_at"])
    ent(190, 190, 132, "DIALOGUE_LINE", ["id PK", "script_id FK", "seq / speaker", "text", "source_paragraph", "flag / confirmed"])
    ent(190, 72, 132, "AUDIO_SEGMENT", ["id PK", "line_id FK", "speaker", "file_path", "duration"])
    ent(360, 214, 116, "存储说明", ["文章与段落", "对话稿与条目", "音频文件（磁盘）", "均为本地保存"])
    dash = colors.HexColor("#9A9A9A")
    # TONE -> DIALOGUE_SCRIPT
    arrow(d, 140, 290, 188, 290, color=dash, dashed=True)
    _t(d, 164, 294, "1:N", fs=6.2)
    # ARTICLE -> DIALOGUE_SCRIPT
    arrow(d, 140, 206, 188, 258, color=dash, dashed=True)
    _t(d, 166, 224, "1:N", fs=6.2)
    # ARTICLE -> PARAGRAPH（同列，垂直连线）
    arrow(d, 82, 152, 82, 112, color=dash, dashed=True)
    _t(d, 92, 130, "1:N", fs=6.2, anchor="start")
    # DIALOGUE_SCRIPT -> DIALOGUE_LINE
    arrow(d, 256, 248, 256, 194, color=dash, dashed=True)
    _t(d, 264, 218, "1:N", fs=6.2, anchor="start")
    # DIALOGUE_LINE -> AUDIO_SEGMENT
    arrow(d, 256, 107, 256, 78, color=dash, dashed=True)
    _t(d, 264, 90, "1:1", fs=6.2, anchor="start")
    return d


# ---------------------------------------------------------------- 图5 顺序图
def draw_sequence():
    W, H = CONTENT_W, 430
    d = Drawing(W, H)
    parts = ["用户", "表现层", "应用服务层", "领域层", "LLM 服务", "TTS 服务", "本地存储"]
    n = len(parts)
    colw = (CONTENT_W - 24) / n
    top, bottom = H - 26, 20
    xs = []
    for i, pn in enumerate(parts):
        x = 12 + i * colw + colw / 2
        xs.append(x)
        box(d, x - colw / 2 + 3, top, colw - 6, 18, pn, fs=6.8, bold=True, fill=HEADER_BG)
        d.add(Line(x, top, x, bottom, strokeColor=LINE_GRAY, strokeWidth=0.7,
                   strokeDashArray=[2, 2]))
    msgs = [
        (0, 1, "上传文章", 1), (1, 2, "POST /api/articles", 1),
        (2, 3, "解析并切分段落", 1), (2, 6, "保存文章与段落", 1),
        (2, 1, "返回段落列表", 1), (0, 1, "选口吻并点击生成", 1),
        (1, 2, "POST /api/scripts", 1), (2, 3, "检查内容形态", 1),
        (2, 4, "提交文章与口吻参数", 1), (4, 2, "结构化对话稿 JSON", 1),
        (2, 3, "校验结构/出处/括号", 1), (3, 2, "校验结果与可疑项", 1),
        (2, 6, "保存对话稿与条目", 1), (2, 1, "返回对话稿与待确认项", 1),
        (0, 1, "确认或修正可疑项", 1), (1, 2, "confirm 接口", 1),
        (2, 6, "记录确认结果", 1), (0, 1, "触发合成音频", 1),
        (1, 2, "POST /audio", 1), (2, 5, "分句提交台词与情绪指令", 1),
        (5, 2, "返回音频片段", 1), (2, 6, "保存音频片段", 1),
        (2, 1, "返回音频列表", 1), (0, 1, "修改某句后重做该句", 1),
        (1, 2, "PATCH /lines/{id}", 1), (2, 5, "仅重合成该句", 1),
    ]
    y = top - 16
    step = 14.6
    for a, b, label, _ in msgs:
        y -= step
        if y < bottom + 4:
            break
        x1, x2 = xs[a], xs[b]
        arrow(d, x1, y, x2, y, lw=0.75)
        _t(d, (x1 + x2) / 2, y + 2.6, label, fs=6.1)
    _t(d, 12, 6, "含三条关键控制：内容形态判断失败即返回提示 · 存在未确认项则拒绝合成（409） · 合成失败降级为纯文字稿（503）",
       fs=6.8, anchor="start")
    return d


# ---------------------------------------------------------------- 图6 页面结构
def draw_pages():
    W, H = CONTENT_W, 224
    d = Drawing(W, H)
    box(d, 24, 130, 130, 44, ["首页 / 入口页", "上传+口吻+历史"], fs=8, bold=True, fill=FILL_SOFT)
    box(d, 210, 152, 110, 36, ["生成中", "进度提示"], fs=8)
    box(d, 210, 96, 110, 36, ["确认页", "可疑处确认与修正"], fs=8)
    box(d, 210, 40, 110, 36, ["错误与降级页", "不适合 / 合成失败"], fs=8)
    box(d, 380, 96, 110, 36, ["结果页", "播放器+逐句文字稿"], fs=8, bold=True, fill=FILL_SOFT)
    arrow(d, 156, 152, 208, 170)
    _t(d, 178, 172, "点击生成", fs=6.3)
    arrow(d, 265, 150, 265, 134)
    _t(d, 292, 140, "生成完成", fs=6.3, anchor="start")
    arrow(d, 210, 108, 158, 108)
    _t(d, 178, 112, "内容不适合", fs=6.3)
    arrow(d, 320, 114, 378, 114)
    _t(d, 348, 118, "确认后合成", fs=6.3)
    arrow(d, 320, 68, 380, 98)
    _t(d, 332, 76, "合成失败", fs=6.3, anchor="start")
    arrow(d, 435, 132, 435, 196, lw=0.8)
    d.add(Line(435, 196, 90, 196, strokeColor=LINE_MID, strokeWidth=0.8))
    arrow(d, 90, 196, 90, 174, lw=0.8)
    _t(d, 300, 201, "重新生成 / 换口吻", fs=6.3)
    arrow(d, 90, 130, 90, 96, lw=0.8)
    d.add(Line(90, 96, 208, 96, strokeColor=LINE_MID, strokeWidth=0.8))
    arrow(d, 208, 96, 208, 114, lw=0.8)
    _t(d, 152, 100, "修改某句", fs=6.3)
    return d


# ---------------------------------------------------------------- 界面线框
def _win(d, x, y, w, h, title):
    d.add(Rect(x, y, w, h, fillColor=WHITE, strokeColor=colors.HexColor("#8C8C8C"),
               strokeWidth=1.1))
    d.add(Rect(x, y + h - 18, w, 18, fillColor=HEADER_BG,
               strokeColor=colors.HexColor("#8C8C8C"), strokeWidth=1.1))
    _t(d, x + w / 2, y + h - 12.5, title, fs=8, bold=True)


def _sep(d, x1, x2, y):
    d.add(Line(x1, y, x2, y, strokeColor=LINE_GRAY, strokeWidth=0.7))


def draw_ui_home():
    W, H = CONTENT_W, 330
    d = Drawing(W, H)
    x, y, w, h = 24, 20, CONTENT_W - 48, 292
    _win(d, x, y, w, h, "「对白」把文章，聊给你听")
    # 上传区
    box(d, x + 18, y + 196, w - 36, 58,
        ["拖拽文件到此处，或点击选择文件", "支持 Markdown / txt，单篇不超过 3000 字"], fs=7.4)
    # 口吻
    _t(d, x + 18, y + 178, "选择口吻：", fs=7.6, anchor="start")
    tones = ["( ) 师生", "(•) 抬杠", "( ) 老少", "( ) 访谈", "( ) 播客对谈", "( ) 睡前"]
    for i, tn in enumerate(tones):
        _t(d, x + 24 + (i % 3) * 128, y + 160 - (i // 3) * 15, tn, fs=7.2, anchor="start")
    box(d, x + 18, y + 106, 110, 22, "开始生成", fs=7.8, fill=FILL_SOFT)
    _t(d, x + 138, y + 113, "← 未选择文件时置灰（禁用）", fs=6.6, anchor="start")
    _sep(d, x + 12, x + w - 12, y + 96)
    _t(d, x + 18, y + 80, "历史记录", fs=7.8, bold=True, anchor="start")
    box(d, x + 18, y + 46, w - 36, 24, "光合作用.docx     抬杠     42 句     09-28 10:20     [ 播放 ]",
        fs=7)
    box(d, x + 18, y + 18, w - 36, 24, "数据报告.pdf     师生     —     09-28 09:55     [ 重试 ]",
        fs=7)
    _t(d, x + 18, y + 6, "（无记录时显示：还没有生成过内容，上传一篇文章试试）", fs=6.6,
       anchor="start", color=colors.HexColor("#5F5E5A"))
    return d


def draw_ui_task():
    W, H = CONTENT_W, 320
    d = Drawing(W, H)
    x, y, w, h = 24, 20, CONTENT_W - 48, 282
    _win(d, x, y, w, h, "← 返回        光合作用.docx · 抬杠口吻")
    # 进度
    _t(d, x + 18, y + 238, "[ 生成中 ] 已解析 6 段 · 正在生成对话稿…", fs=7.4, anchor="start")
    d.add(Rect(x + 18, y + 220, w - 36, 10, fillColor=WHITE, strokeColor=LINE_GRAY, strokeWidth=0.7))
    d.add(Rect(x + 18, y + 220, (w - 36) * 0.56, 10, fillColor=colors.HexColor("#BFBFBF"),
               strokeColor=None))
    _t(d, x + 18, y + 208, "56%        预计还需 20 秒", fs=6.8, anchor="start")
    _sep(d, x + 12, x + w - 12, y + 198)
    _t(d, x + 18, y + 182, "待确认（2 项）  ← 人工确认点，必须处理后才可合成音频", fs=7.6, bold=True,
       anchor="start")
    box(d, x + 18, y + 126, w - 36, 48,
        ["[注意] 第 12 句 · 术语读法不确定", '"类囊体薄膜" 是否应读作 "类囊体膜"？',
         "[ 保留原文读法 ]   [ 改为：________ ]"], fs=7)
    box(d, x + 18, y + 78, w - 36, 42,
        ["[注意] 第 27 句 · 原文未支持", "该句无可对应的原文段落，是否删除？",
         "[ 删除该句 ]   [ 保留并标记 ]"], fs=7)
    _t(d, x + 18, y + 62, "对话稿预览（节选）", fs=7.4, bold=True, anchor="start")
    _t(d, x + 18, y + 46, '甲：叫"暗反应"？那我半夜把绿萝搬去没灯的地方…', fs=6.9, anchor="start")
    _t(d, x + 18, y + 34, '乙：不是。原文 P1 说的是"不需要光直接参与"…', fs=6.9, anchor="start")
    box(d, x + 18, y + 8, 150, 20, "全部确认并合成音频", fs=7.4, fill=FILL_SOFT)
    box(d, x + 180, y + 8, 110, 20, "仅保存文字稿", fs=7.4)
    return d


def draw_ui_result():
    W, H = CONTENT_W, 320
    d = Drawing(W, H)
    x, y, w, h = 24, 20, CONTENT_W - 48, 282
    _win(d, x, y, w, h, "← 返回        光合作用.docx · 抬杠口吻 · 42 句")
    _t(d, x + 18, y + 240, "播放器", fs=7.6, bold=True, anchor="start")
    _t(d, x + 18, y + 222, "[播放]  ━━━━━━━●━━━━━━━━━━━━━━━   03:12 / 12:40", fs=7.4, anchor="start")
    _t(d, x + 18, y + 206, "[ 上一句 ]  [ 暂停 ]  [ 下一句 ]     倍速 1.0x     音量 |||",
       fs=7.2, anchor="start")
    _t(d, x + 18, y + 192, "已支持：锁屏播放 · 断点续播", fs=6.8, anchor="start",
       color=colors.HexColor("#5F5E5A"))
    _sep(d, x + 12, x + w - 12, y + 182)
    _t(d, x + 18, y + 166, "文字稿（当前句高亮）", fs=7.6, bold=True, anchor="start")
    _t(d, x + 18, y + 148, '甲   叫"暗反应"？那我半夜把绿萝搬去没灯的地方…', fs=7, anchor="start")
    box(d, x + 14, y + 112, w - 28, 30, [""],
        fs=7, fill=colors.HexColor("#FAFAFA"))
    _t(d, x + 22, y + 130, '乙   不是。原文 P1 说的是"不需要光直接参与"…   ← 正在播放',
       fs=7, anchor="start")
    _t(d, x + 30, y + 118, "└ 出处：P1  点击查看原文      [ 修改这句 ]  [ 重做这句 ]",
       fs=6.7, anchor="start")
    _t(d, x + 18, y + 96, "甲   那中午太阳最猛，光合作用该最快吧？", fs=7, anchor="start")
    _t(d, x + 18, y + 82, '乙   原文 P6 说反而下降，这叫"光合午休"…', fs=7, anchor="start")
    _sep(d, x + 12, x + w - 12, y + 72)
    box(d, x + 18, y + 42, 160, 22, "换一种口吻重新生成", fs=7.4)
    box(d, x + 190, y + 42, 110, 22, "导出文字稿", fs=7.4)
    _t(d, x + 18, y + 24, "音频片段缺失时：该句显示『音频不可用』，仍可阅读文字（错误状态）",
       fs=6.6, anchor="start", color=colors.HexColor("#5F5E5A"))
    return d


# ================================================================ 文档
class Doc(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(filename, pagesize=A4, leftMargin=MARGIN_L, rightMargin=MARGIN_R,
                         topMargin=MARGIN_T, bottomMargin=MARGIN_B,
                         title="实验3：软件架构与界面设计", author="王浩然")
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="n")
        self.addPageTemplates([PageTemplate(id="main", frames=frame)])


def fig_for(mermaid_text, text_text):
    """按内容特征返回对应绘图"""
    if mermaid_text is not None:
        s = mermaid_text
        if "erDiagram" in s:
            return draw_er()
        if "sequenceDiagram" in s:
            return draw_sequence()
        if "大语言模型服务" in s and "本地存储" in s:
            return draw_context()
        if "表现层" in s and "应用服务层" in s and "基础设施层" in s:
            return draw_layered()
        if "段落数据" in s:
            return draw_dataflow()
        if "错误与降级页" in s:
            return draw_pages()
    if text_text is not None:
        s = text_text
        if "拖拽文件" in s:
            return draw_ui_home()
        if "待确认" in s:
            return draw_ui_task()
        if "播放器" in s:
            return draw_ui_result()
    return None


def parse(md_text):
    lines = md_text.split("\n")
    story, tbl, i = [], [], 0

    def flush_table():
        nonlocal tbl
        if not tbl:
            return
        rows = [[c.strip() for c in ln.strip().strip("|").split("|")] for ln in tbl]
        tbl = []
        rows = [r for r in rows if not all(c and set(c) <= set("-: ") for c in r)]
        if not rows:
            return
        headers, body = rows[0], rows[1:]
        if headers == ["项目", "信息"]:
            story.append(Spacer(1, 2))
            info = Table([[Paragraph(ln, S["SubTitle"])] for ln in cover_lines(body)],
                         colWidths=[CONTENT_W], hAlign="LEFT")
            info.setStyle(TableStyle([
                ("LINEBEFORE", (0, 0), (0, -1), 3, LINE_GRAY),
                ("LEFTPADDING", (0, 0), (-1, -1), 9),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 1.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ]))
            story.append(info)
            story.append(HRFlowable(width="100%", thickness=0.8, color=LINE_MID,
                                    spaceBefore=4, spaceAfter=8))
            return
        story.append(Spacer(1, 2))
        story.append(make_table(headers, body, col_widths(headers)))
        story.append(Spacer(1, 6))

    while i < len(lines):
        line = lines[i].rstrip()
        if line.startswith("|"):
            tbl.append(line)
            i += 1
            continue
        flush_table()

        if line.startswith("```"):
            lang = line[3:].strip()
            buf, i = [], i + 1
            while i < len(lines) and not lines[i].startswith("```"):
                buf.append(lines[i])
                i += 1
            i += 1
            joined = "\n".join(buf)
            if lang == "mermaid":
                fig = fig_for(joined, None)
            elif lang == "text":
                fig = fig_for(None, joined)
            else:
                fig = None
            if fig is not None:
                story.append(fig)
                story.append(Spacer(1, 6))
            else:
                txt = joined.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                story.append(Paragraph(txt.replace("\n", "<br/>"), S["CodeBlock"]))
            continue

        s = line.strip()
        if not s:
            i += 1
            continue
        if s == "---":
            story.append(Spacer(1, 3))
            i += 1
            continue
        if s.startswith("# "):
            story.append(P(s[2:], "TitleCN"))
            story.append(HRFlowable(width="100%", thickness=0.9, color=INK,
                                    spaceBefore=1, spaceAfter=6))
            i += 1
            continue
        if s.startswith("#### "):
            story.append(P(s[5:], "H3CN"))
            i += 1
            continue
        if s.startswith("### "):
            story.append(P(s[4:], "H2CN"))
            i += 1
            continue
        if s.startswith("## "):
            story.append(P(s[3:], "H1CN"))
            i += 1
            continue
        if s.startswith(">"):
            story.append(Paragraph(inline(s.lstrip("> ").strip()), S["Callout"]))
            i += 1
            continue
        if s.startswith("- "):
            story.append(P("• " + s[2:], "ListItem"))
            i += 1
            continue
        if re.match(r"^\*\*(表|图)\d+.*\*\*$", s):
            story.append(P(s.strip("*"), "TableCaption"))
            i += 1
            continue
        story.append(P(s, "SmallCN" if (s.startswith("*") and s.endswith("*")) else "BodyCN"))
        i += 1
        if s.startswith("**隐私与安全说明**"):
            story.append(PageBreak())
    flush_table()
    return story


def main():
    story = parse(SRC.read_text(encoding="utf-8"))
    Doc(str(OUT)).build(story)
    print("OK ->", OUT)


if __name__ == "__main__":
    main()
