# -*- coding: utf-8 -*-
"""
实验2 报告 PDF 生成脚本（版式对齐实验1 原始版）

思路：直接解析 Markdown 源文件，生成 PDF，保证 md 与 PDF 内容、编号一致。
版式参照 实验一/24111302137-王浩然-实验1-AI软件开发环境安装与配置.pdf：
  - 文档标题黑色加下划线，其下为"标签：值"式信息栏
  - 章节标题深蓝，表头浅灰底黑字，表题在表格上方左对齐
  - 图居中、图题居中，代码块浅灰底，无页脚
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
SRC = ROOT / "实验2-个人软件选题与需求分析.md"
OUT = ROOT / "24软件工程-24111302137-王浩然-实验2-个人软件选题与需求分析.pdf"

FONT = r"C:\Windows\Fonts\msyh.ttc"          # Microsoft YaHei UI
FONT_BOLD = r"C:\Windows\Fonts\msyhbd.ttc"   # Microsoft YaHei UI Bold
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

# ---------------------------------------------------------------- 样式
# 参数取自实验1 原版 PDF 的实际字体信息：Microsoft YaHei UI，正文 9pt
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
S["TableCenter"] = ParagraphStyle("TableCenter", parent=S["TableCell"],
                                  alignment=TA_CENTER)
S["TableCaption"] = ParagraphStyle("TableCaption", parent=base["Normal"],
                                   fontName="MSYaHei", fontSize=8.8, leading=11.5,
                                   alignment=TA_LEFT, textColor=INK,
                                   spaceBefore=3, spaceAfter=3)
S["Callout"] = ParagraphStyle("Callout", parent=base["BodyText"], fontName="MSYaHei",
                              fontSize=9, leading=13, backColor=colors.HexColor("#F5F5F5"),
                              borderColor=LINE_GRAY, borderWidth=0.5,
                              borderPadding=6, textColor=INK, spaceAfter=6)
S["CodeBlock"] = ParagraphStyle("CodeBlock", parent=base["BodyText"], fontName="Consolas",
                                fontSize=8, leading=11.5, textColor=INK,
                                backColor=colors.HexColor("#F5F5F5"),
                                leftIndent=6, rightIndent=6, spaceBefore=4, spaceAfter=6)
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
        # Consolas 不含中文字形，含中文时改用中文字体，否则中文会整段消失
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
    joined = "".join(headers)
    if n == 7:                        # 表9 用例描述
        return [36, 52, 116, 34, 44, 42, CONTENT_W - 324]
    if n == 5 and "链接" in joined:    # 表21 调研来源
        return [28, 132, 148, 46, CONTENT_W - 354]
    if n == 5:                        # 表6 三维对比 / 表18 四阶段
        return [46, 106, 100, 100, CONTENT_W - 352]
    if n == 2:
        return [34 * mm, CONTENT_W - 34 * mm]
    if n == 3:
        return [CONTENT_W * 0.18, CONTENT_W * 0.36, CONTENT_W * 0.46]
    if n == 4:
        return [CONTENT_W * 0.20, CONTENT_W * 0.27, CONTENT_W * 0.27, CONTENT_W * 0.26]
    return [CONTENT_W / n] * n


def cover_lines(rows):
    """把「项目 / 信息」两列表转成信息行（短项同行，长项独立成行）"""
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


# ---------------------------------------------------------------- 图
def draw_usecase():
    W, H = CONTENT_W, 205
    d = Drawing(W, H)
    d.add(Rect(118, 12, 264, 166, fillColor=colors.HexColor("#FAFAFA"),
               strokeColor=colors.HexColor("#8C8C8C"), strokeWidth=0.9))
    d.add(String(250, 188, "「对白」系统", fontSize=9.5, fontName="MSYaHeiBold",
                 fillColor=INK, textAnchor="middle"))
    cases = [
        ("UC1 上传文章", 133, 148), ("UC2 选择口吻", 253, 148),
        ("UC3 生成对话稿", 133, 114), ("UC4 出处回溯", 253, 114),
        ("UC5 单句修正", 133, 80), ("UC6 合成音频", 253, 80),
        ("UC7 术语插播·二期", 133, 46), ("UC8 时长控制·二期", 253, 46),
    ]
    for label, x, y in cases:
        d.add(Rect(x, y, 112, 26, fillColor=colors.white,
                   strokeColor=colors.HexColor("#9E9E9E"), strokeWidth=0.7))
        d.add(String(x + 56, y + 9, label, fontSize=7.6, fontName="MSYaHei",
                     fillColor=INK, textAnchor="middle"))
    d.add(Rect(8, 78, 88, 30, fillColor=colors.white,
               strokeColor=colors.HexColor("#8C8C8C"), strokeWidth=0.9))
    d.add(String(52, 89, "在校学生", fontSize=8.2, fontName="MSYaHei",
                 fillColor=INK, textAnchor="middle"))
    d.add(Rect(392, 78, 92, 30, fillColor=colors.white,
               strokeColor=colors.HexColor("#8C8C8C"), strokeWidth=0.9))
    d.add(String(438, 89, "内容提供者", fontSize=8.2, fontName="MSYaHei",
                 fillColor=INK, textAnchor="middle"))
    d.add(Line(96, 93, 118, 93, strokeColor=colors.HexColor("#8C8C8C"), strokeWidth=1))
    d.add(Line(392, 93, 382, 93, strokeColor=colors.HexColor("#8C8C8C"), strokeWidth=1))
    return d


def draw_flow():
    W, H = CONTENT_W, 126
    d = Drawing(W, H)
    labels = ["上传文章", "选择口吻", "生成对话稿", "确认可疑处", "合成音频", "播放回看"]
    bw, gap = 66, 13
    y = 62
    xs, x = [], 8
    for idx, lb in enumerate(labels):
        d.add(Rect(x, y, bw, 32, fillColor=colors.white,
                   strokeColor=colors.HexColor("#8C8C8C"), strokeWidth=0.9))
        d.add(String(x + bw / 2, y + 12, lb, fontSize=8, fontName="MSYaHei",
                     fillColor=INK, textAnchor="middle"))
        xs.append(x)
        if idx < len(labels) - 1:
            a = x + bw
            d.add(Line(a, y + 16, a + gap, y + 16,
                       strokeColor=colors.HexColor("#8C8C8C"), strokeWidth=1))
            d.add(Polygon([a + gap, y + 16, a + gap - 4, y + 13, a + gap - 4, y + 19],
                          fillColor=colors.HexColor("#8C8C8C"), strokeColor=None))
        x += bw + gap
    x4, x3 = xs[3] + bw / 2, xs[2] + bw / 2
    d.add(Line(x4, y + 32, x4, y + 46, strokeColor=colors.HexColor("#8C8C8C"), strokeWidth=0.8))
    d.add(Line(x4, y + 46, x3, y + 46, strokeColor=colors.HexColor("#8C8C8C"), strokeWidth=0.8))
    d.add(Line(x3, y + 46, x3, y + 32, strokeColor=colors.HexColor("#8C8C8C"), strokeWidth=0.8))
    d.add(Polygon([x3, y + 32, x3 - 4, y + 37, x3 + 4, y + 37],
                  fillColor=colors.HexColor("#8C8C8C"), strokeColor=None))
    d.add(String((x3 + x4) / 2, y + 49, "用户修正", fontSize=6.6, fontName="MSYaHei",
                 fillColor=INK, textAnchor="middle"))
    x6, x5 = xs[5] + bw / 2, xs[4] + bw / 2
    d.add(Line(x6, y, x6, y - 14, strokeColor=colors.HexColor("#8C8C8C"), strokeWidth=0.8))
    d.add(Line(x6, y - 14, x5, y - 14, strokeColor=colors.HexColor("#8C8C8C"), strokeWidth=0.8))
    d.add(Line(x5, y - 14, x5, y, strokeColor=colors.HexColor("#8C8C8C"), strokeWidth=0.8))
    d.add(Polygon([x5, y, x5 - 4, y - 5, x5 + 4, y - 5],
                  fillColor=colors.HexColor("#8C8C8C"), strokeColor=None))
    d.add(String((x5 + x6) / 2, y - 22, "仅重做该句", fontSize=6.6, fontName="MSYaHei",
                 fillColor=INK, textAnchor="middle"))
    return d


class Doc(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(filename, pagesize=A4, leftMargin=MARGIN_L, rightMargin=MARGIN_R,
                         topMargin=MARGIN_T, bottomMargin=MARGIN_B,
                         title="实验2：个人软件选题与需求分析", author="王浩然")
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="n")
        self.addPageTemplates([PageTemplate(id="main", frames=frame)])


# ---------------------------------------------------------------- 解析
def parse(md_text):
    lines = md_text.split("\n")
    story, tbl, i = [], [], 0

    def flush_table():
        nonlocal tbl
        if not tbl:
            return
        rows = []
        for ln in tbl:
            rows.append([c.strip() for c in ln.strip().strip("|").split("|")])
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
                story.append(draw_usecase() if "UC1" in joined else draw_flow())
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
            story.append(P("• " + s[2:], "ListItem") if "ListItem" in S else P("• " + s[2:]))
            i += 1
            continue
        if re.match(r"^\*\*表\d+.*\*\*$", s):
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
