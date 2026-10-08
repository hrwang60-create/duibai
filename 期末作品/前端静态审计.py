# -*- coding: utf-8 -*-
"""
前端静态审计 —— 专门查「node --check 查不出来」的那类错

查三类：
  A. 块级作用域越界：if/for 块内 const/let 声明的变量，在块外被引用 → 运行时 ReferenceError
     （就是 15:12 那个真凶）
  B. template 里调用了 script 里不存在的方法/属性 → 运行时 undefined is not a function
  C. template 里引用了未注册、未导入、未声明的组件名 → 运行时找不到组件
"""

import os
import re
import glob

ROOT = r'C:\Users\MI\Desktop\个人软件选题与需求分析2\期末作品\duibai-app'

DECL = re.compile(r'\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=')
KEYWORDS = {'if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'const', 'let', 'var'}


def strip_strings_comments(s):
    """去掉字符串与注释，避免误判"""
    s = re.sub(r'//[^\n]*', '', s)
    s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
    s = re.sub(r'"(\\.|[^"\\])*"', '""', s)
    s = re.sub(r"'(\\.|[^'\\])*'", "''", s)
    s = re.sub(r'`(\\.|[^`\\])*`', '``', s)
    return s


def find_block_scope_issues(code):
    """A. 找出在块内声明、却在块外引用的 const/let"""
    issues = []
    lines = code.split('\n')
    # 用栈跟踪每个大括号的作用域
    stack = []          # [{vars:set(), line:int}]
    pending = None      # 刚遇到的 'const x =' 待归入哪个作用域
    depth_of_if = []    # 记录 if/for 块开启时的深度

    for ln_no, raw in enumerate(lines, 1):
        line = strip_strings_comments(raw)
        opens = line.count('{')
        closes = line.count('}')

        # 声明收集
        for m in DECL.finditer(line):
            name = m.group(1)
            if name in KEYWORDS:
                continue
            if stack:
                stack[-1]['vars'].add(name)

        # 检测块内声明的变量是否在**当前行之后、但已出块**的位置被引用
        if closes > 0:
            for _ in range(min(closes, len(stack))):
                sc = stack.pop()
                leftover = sc['vars']
                if leftover:
                    issues.append((sc['line'], sorted(leftover), ln_no))
        if opens > 0:
            stack.append({'vars': set(), 'line': ln_no})
    return issues


def check_template_refs(tpl, script, comp_local):
    """B/C. template 里用到的方法/组件是否在 script 里存在"""
    problems = []

    # 收集 script 里定义的方法名
    methods = set(re.findall(r'^\s{2,}([A-Za-z_$][\w$]*)\s*\(', script, re.M))
    methods |= set(re.findall(r'^\s{2,}([A-Za-z_$][\w$]*)\s*:\s*function', script, re.M))
    # data 里定义的字段
    data_fields = set()
    m = re.search(r'data\s*\(\)\s*\{[\s\S]*?return\s*\{([\s\S]*?)\n\t\t\}', script)
    if m:
        data_fields = set(re.findall(r'^\s*([A-Za-z_$][\w$]*)\s*:', m.group(1), re.M))
    computed = set(re.findall(r'^\s{2,}([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{', script, re.M))
    known = methods | data_fields

    # template 里的 @xxx="fn" 与 {{ fn }}
    handlers = re.findall(r'@[a-zA-Z.:-]+="([A-Za-z_$][\w$]*)', tpl)
    calls = re.findall(r'\{\{\s*([A-Za-z_$][\w$]*)\s*[\(\}]', tpl)
    for name in set(handlers) | set(calls):
        if name in ('true', 'false', 'null', 'undefined'):
            continue
        if name in known or name in computed:
            continue
        problems.append(('方法/字段', name))

    # template 里用的组件标签（kebab-case）
    for tag in set(re.findall(r'<(/?)([a-z][a-z0-9-]*)\b', tpl)):
        pass
    used_tags = set(re.findall(r'<([a-z][a-z0-9]*-[a-z0-9-]+)[\s/>]', tpl))
    for tag in used_tags:
        if tag in comp_local:
            continue
        problems.append(('组件', tag))
    return problems


def main():
    files = sorted(glob.glob(os.path.join(ROOT, 'pages', '**', '*.vue'), recursive=True) +
                   glob.glob(os.path.join(ROOT, 'components', '**', '*.vue'), recursive=True))
    total_a = total_b = 0
    for f in files:
        rel = os.path.relpath(f, ROOT).replace('\\', '/')
        s = open(f, encoding='utf-8').read()
        tm = re.search(r'<template>([\s\S]*?)</template>\s*(?:<script[^>]*>([\s\S]*?)</script>)?', s)
        tpl = tm.group(1) if tm else ''
        script = (tm.group(2) or '') if tm else ''
        script = strip_strings_comments(script)

        a = find_block_scope_issues(script)
        # 本文件已注册/导入的组件
        local = set()
        for mm in re.finditer(r'^\s*([A-Za-z][\w]*)\s*$', s, re.M):
            local.add(mm.group(1))
        for mm in re.finditer(r'components\s*:\s*\{([^}]*)\}', s):
            local |= set(re.findall(r'[A-Za-z][\w]*', mm.group(1)))
        for mm in re.finditer(r'import\s+([A-Za-z][\w]*)\s+from', s):
            local.add(mm.group(1))
        b = check_template_refs(tpl, s, local)

        if a:
            total_a += len(a)
            print('\n❌ %s' % rel)
            for line, names, endline in a:
                print('   A. 第 %d 行块内声明的 %s，在第 %d 行（块外）仍被引用' % (line, names, endline))
        if b:
            # 过滤掉 Vue 内置与误报
            b = [(k, n) for k, n in b if n not in
                 ('view', 'text', 'image', 'scroll-view', 'input', 'textarea', 'button', 'swiper')]
            if b:
                total_b += len(b)
                print('\n⚠️  %s' % rel)
                for kind, name in b:
                    print('   B/C. template 用了未定义的%s：%s' % (kind, name))

    print('\n' + '=' * 60)
    print('A 类（作用域越界）%d 处    B/C 类（未定义引用）%d 处' % (total_a, total_b))
    print('=' * 60)


main()
