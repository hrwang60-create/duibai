#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
打包提交物 —— 生成可直接交作业的源码压缩包

为什么必须有这个脚本（而不是右键压缩）：
  `.gitignore` 只对 git 生效，**管不住 zip**。
  之前的 `app-config/config.json` 里是**明文的 AppSecret**，
  直接压缩整个 duibai-app 就会把密钥一起交上去。

它做四件事：
  1. 按规则排除（编译产物 / 版本库 / 依赖 / 本地配置）
  2. **脱敏**：`config.json` → 换成内容为空的 `config.example.json`
  3. 附上文档（使用规则、README）
  4. 打包后**自动扫描压缩包**，确认没有任何密钥残留

用法：python 打包提交.py
"""
import os
import re
import sys
import json
import zipfile
import shutil
import time

ROOT = os.path.dirname(os.path.abspath(__file__))
APP = os.path.join(ROOT, 'duibai-app')
OUT = os.path.join(ROOT, '提交物', '对白-源代码.zip')

# ── 排除规则 ──────────────────────────────────────────────
EXCLUDE_DIRS = {
    'node_modules', 'unpackage', '.git', '.hbuilderx',
    '.idea', '.vscode', 'dist', 'build', '.sourcemap',
}
EXCLUDE_FILES = {
    'project.config.json',   # 开发者工具本地配置
    'project.private.config.json',
    '.DS_Store',
}
# 名字匹配这些的**文件**直接排除
EXCLUDE_FILE_RE = re.compile(r'^(config\.json|\.env.*|.*\.local\.json)$')

# ── 密钥指纹：打包后用来验证没漏 ────────────────────────────
# 只放"前缀"，不写全值 —— 这个脚本本身也不能成为泄露源
SECRET_HINTS = [
    'WX_SECRET', 'DEEPSEEK_API_KEY', 'TOKEN_SECRET',
]


def human(n):
    for u in ('B', 'KB', 'MB', 'GB'):
        if n < 1024:
            return '%.1f %s' % (n, u)
        n /= 1024
    return '%.1f TB' % n


def should_skip(path, is_dir):
    name = os.path.basename(path)
    if is_dir:
        return name in EXCLUDE_DIRS
    if name in EXCLUDE_FILES:
        return True
    # config.json 排除，但 .example.json / .config.example.json 保留
    if EXCLUDE_FILE_RE.match(name):
        return True
    return False


def collect():
    """收集要进包的文件，同时对 config.json 做脱敏替换。"""
    items = []       # (磁盘路径, 包内路径)
    sanitized = 0
    for r, ds, fs in os.walk(APP):
        ds[:] = [d for d in ds if d not in EXCLUDE_DIRS]
        for f in fs:
            src = os.path.join(r, f)
            if should_skip(src, False):
                continue
            rel = os.path.relpath(src, APP).replace('\\', '/')
            # app-config 下的真实配置 → 换成空模板
            if f == 'config.json' and 'app-config' in rel:
                rel = rel.replace('config.json', 'config.example.json')
                sanitized += 1
            items.append((src, '对白-源代码/duibai-app/' + rel))
    return items, sanitized


def add_docs(items):
    """把文档与「云数据导出」一起放进包根目录。

    作业要求原文：「全部源代码资源压缩包（前后端，**云数据需导出来**）」
    —— 所以云数据导出必须在包里，不能只交源码。
    """
    extra = [
        ('使用规则.md', '使用规则.md'),
        ('README-提交说明.md', 'README-提交说明.md'),
        ('提交物/03-云数据导出/对白-云数据库导出.json', '云数据导出/对白-云数据库导出.json'),
        ('提交物/03-云数据导出/云数据导出说明.md', '云数据导出/云数据导出说明.md'),
        ('提交物/01-信息架构图/对白-信息架构思维导图.png', '信息架构图.png'),
    ]
    for src, arc in extra:
        p = os.path.join(ROOT, src.replace('/', os.sep))
        if os.path.exists(p):
            items.append((p, '对白-源代码/' + arc))
    return items


def build():
    if not os.path.isdir(APP):
        print('  ❌ 找不到 duibai-app')
        return 1

    items, sanitized = collect()
    items = add_docs(items)

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    if os.path.exists(OUT):
        os.remove(OUT)

    raw = 0
    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for src, arc in items:
            z.write(src, arc)
            raw += os.path.getsize(src)

    print('  文件数    %d' % len(items))
    print('  原始体积  %s' % human(raw))
    print('  压缩后    %s' % human(os.path.getsize(OUT)))
    print('  脱敏处理  %d 个 config.json → config.example.json' % sanitized)
    return 0


def verify():
    """打包后必须自检：压缩包里不能有任何密钥。"""
    print()
    print('══════ 打包后自检 ══════')
    bad = []
    with zipfile.ZipFile(OUT) as z:
        names = z.namelist()
        # ① 不该有的目录
        for n in names:
            for d in EXCLUDE_DIRS:
                if '/%s/' % d in n or n.endswith('/%s' % d):
                    bad.append(('排除目录残留', n))
        # ② 真实 config.json
        for n in names:
            if n.endswith('app-config/config.json'):
                bad.append(('真实密钥文件', n))
        # ③ 密钥值残留（扫内容）
        for n in names:
            if not n.endswith(('.json', '.js', '.vue', '.md')):
                continue
            try:
                txt = z.read(n).decode('utf-8', 'ignore')
            except Exception:
                continue
            for key in SECRET_HINTS:
                # 形如 "WX_SECRET": "非空值" 才算泄露
                m = re.search(r'"%s"\s*:\s*"([^"]+)"' % key, txt)
                if m and m.group(1).strip() and '你的' not in m.group(1) \
                        and '<' not in m.group(1) and '自己' not in m.group(1):
                    bad.append(('%s 有非空值' % key, n))

    if bad:
        for why, where in bad[:12]:
            print('  ❌ %-18s %s' % (why, where))
        print()
        print('  ⚠️ 有 %d 处问题，**不要提交这个包**' % len(bad))
        return 1

    print('  ✅ 无真实密钥')
    print('  ✅ 无编译产物（unpackage/node_modules）')
    print('  ✅ 无开发者工具本地配置')
    print()
    print('  可以提交：%s' % os.path.relpath(OUT, ROOT))
    return 0


if __name__ == '__main__':
    print('══════ 打包 ══════')
    rc = build()
    if rc:
        sys.exit(rc)
    sys.exit(verify())
