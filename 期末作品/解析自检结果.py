# -*- coding: utf-8 -*-
"""解析 selftest 云函数输出，打印每组断言结果"""
import json
import re
import sys

path = r'C:\Users\MI\AppData\Local\Temp\st2.json'
txt = open(path, encoding='utf-8', errors='ignore').read()
m = re.search(r'(\{.*\})', txt, re.S)
if not m:
    print('没拿到 JSON')
    sys.exit(1)
blob = m.group(1)
# 云函数返回里可能混入字面量 undefined（非合法 JSON），先替换掉
blob = blob.replace(':undefined', ':null')
r = json.loads(blob)

if r.get('code') != 0:
    print('顶层失败:', r.get('error'), '|', str(r.get('message'))[:200])
    sys.exit(1)

d = r['data']
print('=' * 74)
print('通过 %d / %d    all_pass=%s' % (d['pass'], d['total'], d['all_pass']))
print('真实大模型: ran=%s  %sms' % (d.get('real_ran'), d.get('real_ms')))
print('真实 TTS  : %sms' % d.get('tts_ms'))
print('=' * 74)

groups = {}
for c in d.get('checks') or []:
    groups.setdefault(c['pass'], []).append(c)

for g, items in groups.items():
    ok = sum(1 for i in items if i['ok'])
    flag = '✅' if ok == len(items) else '❌'
    print('\n%s 【%s】 %d/%d' % (flag, g, ok, len(items)))
    for c in items:
        mark = '  ✅' if c['ok'] else '  ❌'
        line = '%s %s' % (mark, c['name'])
        print(line)
        if not c['ok']:
            print('        期望: %s' % str(c['expected'])[:90])
            print('        实际: %s' % str(c['actual'])[:110])

if d.get('real_sample'):
    print('\n真实对话样本:')
    for s in d['real_sample'][:6]:
        print('  ' + s)
if d.get('tts_sample'):
    print('\nTTS 云存储直链:')
    for s in d['tts_sample'][:2]:
        print('  ' + s)
