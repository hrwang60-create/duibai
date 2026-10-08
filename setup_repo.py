# -*- coding: utf-8 -*-
"""
整理个人项目的文档目录结构，供提交到个人仓库。
按实验2、实验3 报告中声明的文件路径拆分设计文档。
"""
from pathlib import Path

ROOT = Path(r"C:\Users\MI\Desktop\个人软件选题与需求分析2")

r2 = (ROOT / "实验2-个人软件选题与需求分析.md").read_text(encoding="utf-8")
r3 = (ROOT / "实验3-软件架构与界面设计(报告).md").read_text(encoding="utf-8")

docs = ROOT / "docs"
design = docs / "design"
design.mkdir(parents=True, exist_ok=True)

# ---------------- 实验2 -> 项目方案.md / 需求说明V1.md
i21 = r2.index("### 2.1 ")
i24 = r2.index("### 2.4 ")
i26 = r2.index("### 2.6 ")
i3 = r2.index("## 3. 操作记录汇总")
i4 = r2.index("## 4. 实验小结")

plan = (
    "# 「对白」项目方案\n\n"
    "> 来源：实验2《个人软件选题与需求分析》。章节编号沿用原报告。\n\n"
    + r2[i21:i24]
    + "\n"
    + r2[i26:i3]
    + "\n"
    + r2[i4:]
)

req = (
    "# 「对白」需求说明 V1\n\n"
    "> 来源：实验2《个人软件选题与需求分析》。章节编号沿用原报告。\n\n"
    + r2[i24:i26]
)

(docs / "项目方案.md").write_text(plan, encoding="utf-8")
(docs / "需求说明V1.md").write_text(req, encoding="utf-8")

# ---------------- 实验3 -> 架构设计.md / 数据与接口设计.md / 界面原型.md
j23 = r3.index("### 2.3 ")
j24 = r3.index("### 2.4 ")
j25 = r3.index("### 2.5 ")
j26 = r3.index("### 2.6 ")

src = "> 来源：实验3《软件架构与界面设计》。章节编号沿用原报告。\n\n"
(design / "架构设计.md").write_text(
    "# 「对白」架构设计\n\n" + src + r3[j23:j24], encoding="utf-8")
(design / "数据与接口设计.md").write_text(
    "# 「对白」数据与接口设计\n\n" + src + r3[j24:j25], encoding="utf-8")
(design / "界面原型.md").write_text(
    "# 「对白」界面原型\n\n" + src + r3[j25:j26], encoding="utf-8")

# ---------------- README 与 .gitignore
(ROOT / "README.md").write_text(
    "# 对白（Duibai）——把文章，聊给你听\n\n"
    "面向碎片时间（通勤、睡前、做家务）的听觉内容产品：把一篇文章的书面语，"
    "用指定口吻重构成两个人的口语对话，再由语音合成输出双音色音频。\n\n"
    "核心用户流程：上传文章 → 选择口吻 → 生成双人对话稿 → 确认可疑处 → "
    "合成双音色音频 → 播放并逐句回看。\n\n"
    "## 目录\n\n"
    "- `docs/项目方案.md` —— 项目方案（问题陈述、用户画像、现有方案比较、MVP 与计划）\n"
    "- `docs/需求说明V1.md` —— 需求说明 V1（用户故事、用例、非功能需求、验收条件、AI 能力分析）\n"
    "- `docs/design/架构设计.md` —— 总体架构、模块职责与职责划分\n"
    "- `docs/design/数据与接口设计.md` —— 数据模型、接口清单与核心流程\n"
    "- `docs/design/界面原型.md` —— 页面结构、导航关系与 3 张界面原型\n\n"
    "## 说明\n\n"
    "本项目为课程个人项目，当前处于需求与设计阶段，尚未开始编码。\n",
    encoding="utf-8")

(ROOT / ".gitignore").write_text(
    "# 逐页核对用的临时渲染文件\n"
    "__*\n"
    "# Python\n"
    "__pycache__/\n"
    "*.pyc\n"
    "# 系统文件\n"
    ".DS_Store\n"
    "Thumbs.db\n",
    encoding="utf-8")

print("docs ready:")
for p in sorted(docs.rglob("*")):
    if p.is_file():
        print(" ", p.relative_to(ROOT), p.stat().st_size, "bytes")
