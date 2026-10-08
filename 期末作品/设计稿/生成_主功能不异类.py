# -*- coding: utf-8 -*-
"""
「主功能 · 重要但不异类」出图生成器

为什么写成脚本：这三个整页里有 70% 是重复的结构，
手写 HTML 每次都要重发一遍，改一个字也得整段重贴。
写成生成器之后，只改 CTA / CONTENT / CSS 里的差异部分即可。

用法：python 生成_主功能不异类.py   （在本目录下运行）
"""
import os

UP = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5"/><path d="M4 16v3a2 2 0 002 2h12a2 2 0 002-2v-3"/></svg>'
AR = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h13M13 6l6 6-6 6"/></svg>'
PLAY = '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5z"/></svg>'

CAP = {
    'X1': ('主功能是卡，内容是行', '只有它有"边界"<br>内容全是无底的行 + 细线'),
    'X2': ('主功能是全页唯一的淡朱块', '浅朱底 + 朱色图标 + 墨色文字<br>靠"唯一颜色"分层，不靠重色'),
    'X3': ('主功能独占首屏上半', '更多留白把它托起来<br>下方内容用标签行开始'),
}
# 主功能块：三版结构完全相同，只有外层 class 不同 —— 这正是"同一套语法"的证明
CTA_TPL = '''<div class="cta{key}">
  <span class="ic">{up}</span>
  <div style="flex:1;min-width:0">
    <div class="t1">把文章贴进来</div>
    <div class="t2">粘贴或从聊天里选文件</div>
  </div>
  <span class="ar">{ar}</span>
</div>'''

BLOCK_CARD = '''        <div class="tagrow"><span class="tag">今 日 一 集</span><span class="cnt">04:02</span></div>
        <div class="card">
          <div class="ptitle">{play} 光合作用为什么分两步？</div>
          <div class="dlg">
            <div class="ln a"><div class="rl"></div><div class="who">甲</div><div class="say">光合作用其实没那么难。</div></div>
            <div class="ln b"><div class="rl"></div><div class="who">乙</div><div class="say">难的是课本非要写得这么复杂。</div></div>
          </div>
          <div class="fa"><span class="act">{play} 听整集</span><span class="act dim">往期 07 →</span></div>
        </div>'''

BLOCK_ROWS = '''        <div class="tagrow"><span class="tag">今 日 一 集</span><span class="cnt">04:02</span></div>
        <div class="plain">
          <div class="ptitle">光合作用为什么分两步？</div>
          <div class="dlg">
            <div class="ln a"><div class="rl"></div><div class="who">甲</div><div class="say">光合作用其实没那么难。</div></div>
            <div class="ln b"><div class="rl"></div><div class="who">乙</div><div class="say">难的是课本非要写得这么复杂。</div></div>
          </div>
          <div class="fa"><span class="act">{play} 听整集</span><span class="act dim">往期 07 →</span></div>
        </div>
        <div class="hr"></div>
        <div class="tagrow" style="margin-top:0"><span class="tag">我 聊 过 的</span><span class="cnt">全部 04 →</span></div>
        <div class="rowi"><i class="dt"></i><div class="rn">数据链路层在物</div><div class="rm">23 句</div><span class="act">去确认 →</span></div>
        <div class="rsay"><div class="line a2"><div class="rl2"></div><div class="s2">咱们今天聊数据链路层概述吧。</div></div><div class="line b2"><div class="rl2"></div><div class="s2">好啊，这层听着就挺重要的。</div></div></div>
        <div class="hr2"></div>
        <div class="rowi"><i class="dt g"></i><div class="rn">为什么有人会晕车</div><div class="rm">01:48</div><span class="act">▶ 听</span></div>
        <div class="rsay"><div class="line a2"><div class="rl2"></div><div class="s2">为什么坐车看手机会更晕？</div></div><div class="line b2"><div class="rl2"></div><div class="s2">因为眼睛和内耳的信息打架了。</div></div></div>'''

MINE_CARD = '''        <div class="tagrow"><span class="tag">我 聊 过 的</span><span class="cnt">全部 04 →</span></div>
        <div class="card">
          <div class="hrow"><i class="hdot"></i><div class="hname">数据链路层在物</div><div class="hnum">23 句</div><span class="act">去确认 →</span></div>
          <div class="dlg">
            <div class="ln a"><div class="rl"></div><div class="who">甲</div><div class="say">咱们今天聊数据链路层概述吧。</div></div>
            <div class="ln b"><div class="rl"></div><div class="who">乙</div><div class="say">好啊，这层听着就挺重要的。</div></div>
          </div>
          <div class="split"></div>
          <div class="hrow"><i class="hdot g"></i><div class="hname">为什么有人会晕车</div><div class="hnum">01:48</div><span class="act">▶ 听</span></div>
          <div class="dlg">
            <div class="ln a"><div class="rl"></div><div class="who">甲</div><div class="say">为什么坐车看手机会更晕？</div></div>
            <div class="ln b"><div class="rl"></div><div class="who">乙</div><div class="say">因为眼睛和内耳的信息打架了。</div></div>
          </div>
        </div>'''

CONTENT = {
    'X1': BLOCK_ROWS,                                # 内容是"行"
    'X2': BLOCK_CARD + '\n' + MINE_CARD,             # 内容是"卡"
    'X3': BLOCK_CARD + '\n' + MINE_CARD,             # 内容是"卡"，但主功能上方留白更多
}

TAB = '''      <div class="tb">
        <div class="tbi on"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h10M4 18h13"/></svg>对白</div>
        <div class="tbi"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3 2"/></svg>历史</div>
        <div class="tbi"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8.5" r="3.6"/><path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6"/></svg>我的</div>
      </div>'''

CSS = ''':root{
  --mono:ui-monospace,"SF Mono",Consolas,monospace;
  --sans:"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif;
  --serif:"Noto Serif SC","Songti SC","Noto Serif CJK SC",serif;
  --ink:#1a1a18; --vm:#c8452c;
  --tx:#1a1a18; --tx2:#5a5750; --tx3:#8c877e; --tx4:#b5afa5;
  --page:#ede8da; --card:#f8f5ee; --line:#e2ddcd; --line2:#e8e3d5; --white:#fbf9f6;
}
*{margin:0;padding:0;box-sizing:border-box}
body{background:#e3e0d5;padding:34px 24px 50px;font-family:var(--sans);color:var(--ink)}
.h1{text-align:center;font-size:23px;font-weight:600;letter-spacing:-.3px}
.sub{text-align:center;color:var(--tx3);font-size:12.5px;margin:9px 0 30px;line-height:1.9}
.sub b{color:var(--vm)}
.grid{display:grid;grid-template-columns:repeat(3,375px);gap:32px 26px;justify-content:center}
.pg{width:375px}
.cap{margin-bottom:10px;text-align:center}
.cap .n{font-family:var(--mono);font-size:10.5px;color:var(--vm);letter-spacing:.6px}
.cap .t{font-size:14.5px;font-weight:600;margin-top:3px}
.cap .s{color:var(--tx3);font-size:10.5px;margin-top:3px;line-height:1.5}
.phone{width:375px;height:772px;border-radius:30px;overflow:hidden;position:relative;
       background:var(--page);border:1px solid #d2ccbe;box-shadow:0 18px 44px rgba(70,58,34,.13)}
.bd{padding:0 20px;height:100%;display:flex;flex-direction:column}
.brandrow{display:flex;align-items:baseline;justify-content:space-between;padding:18px 2px 18px}
.brand{font-family:var(--serif);font-size:26px;font-weight:600;letter-spacing:.4px}
.cnt{font-family:var(--mono);font-size:10.5px;color:var(--tx3)}

/* ===== 主功能：三版结构完全相同，只有分量不同 ===== */
.ctaX1,.ctaX2,.ctaX3{border-radius:18px;padding:15px 16px;display:flex;align-items:center;gap:12px;margin-bottom:6px}
.ctaX1{background:var(--white);border:1px solid var(--line)}
.ctaX2{background:rgba(200,69,44,.055);border:1px solid rgba(200,69,44,.24)}
.ctaX3{background:var(--white);border:1px solid var(--line);padding:17px 16px}
.ic{width:34px;height:34px;border-radius:11px;flex-shrink:0;background:var(--vm);color:#fff;
    display:flex;align-items:center;justify-content:center}
.t1{font-family:var(--serif);font-size:17.5px;font-weight:600;letter-spacing:-.1px}
.t2{font-size:11.5px;color:var(--tx3);margin-top:5px}
.ar{margin-left:auto;color:var(--vm);display:flex;align-items:center;flex-shrink:0}

/* 内容：卡 */
.tagrow{display:flex;align-items:baseline;justify-content:space-between;height:30px;flex-shrink:0;padding-top:9px;margin-top:14px}
.tag{font-family:var(--serif);font-size:11px;letter-spacing:2.4px;color:var(--tx3)}
.card{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:15px}
.ptitle{font-family:var(--serif);font-size:17px;font-weight:600;margin-bottom:12px;letter-spacing:-.1px}
.dlg{display:flex;flex-direction:column;gap:7px}
.ln{display:flex;gap:8px;align-items:flex-start}
.ln.a{align-self:flex-start;max-width:96%}
.ln.b{align-self:flex-end;flex-direction:row-reverse;max-width:96%}
.rl{width:2.5px;border-radius:2px;align-self:stretch;min-height:13px;flex-shrink:0}
.a .rl{background:var(--ink)} .b .rl{background:var(--vm)}
.who{font-size:9.5px;font-weight:700;flex-shrink:0;padding-top:3px}
.a .who{color:var(--tx2)} .b .who{color:var(--vm)}
.say{font-size:13.5px;line-height:1.6;color:var(--tx)}
.b .say{color:var(--vm);text-align:right}
.fa{display:flex;justify-content:space-between;align-items:center;margin-top:13px}
.hrow{display:flex;align-items:center;gap:7px;margin-bottom:9px}
.hdot{width:5px;height:5px;border-radius:3px;flex-shrink:0;background:var(--vm)}
.hdot.g{background:var(--tx4)}
.hname{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:13px;font-weight:500}
.hnum{font-family:var(--mono);font-size:10px;color:var(--tx3);flex-shrink:0}
.split{height:1px;background:var(--line2);margin:12px 0 11px}
.act{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:var(--vm)}
.act.dim{opacity:.72}
.sp{flex:1}

/* 内容：行（X1 用） */
.plain{padding:0 2px}
.hr{height:1px;background:var(--line);margin:16px 0}
.hr2{height:1px;background:var(--line2);margin:11px 0}
.rowi{display:flex;align-items:center;gap:8px;margin-bottom:9px}
.dt{width:5px;height:5px;border-radius:3px;flex-shrink:0;background:var(--vm)}
.dt.g{background:var(--tx4)}
.rn{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:13px;font-weight:500}
.rm{font-family:var(--mono);font-size:10px;color:var(--tx3);flex-shrink:0}
.rsay{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}
.line{display:flex;gap:8px;align-items:flex-start}
.line.a2{align-self:flex-start;max-width:96%}
.line.b2{align-self:flex-end;flex-direction:row-reverse;max-width:96%}
.rl2{width:2.5px;border-radius:2px;align-self:stretch;min-height:12px;flex-shrink:0}
.a2 .rl2{background:var(--ink)} .b2 .rl2{background:var(--vm)}
.s2{font-size:13px;line-height:1.6;color:var(--tx)}
.b2 .s2{color:var(--vm);text-align:right}

.tb{position:absolute;bottom:0;left:0;right:0;height:76px;background:var(--page);
    border-top:1px solid var(--line);display:flex;align-items:center;justify-content:space-around;padding-bottom:12px}
.tbi{font-size:10px;text-align:center;font-weight:500;flex:1;color:var(--tx3)}
.tbi.on{color:var(--ink);font-weight:600}
.tbi svg{display:block;margin:0 auto 3px}'''


def build():
    cards = []
    for key in ('X1', 'X2', 'X3'):
        t, d = CAP[key]
        cta = CTA_TPL.format(key=key, up=UP, ar=AR)
        gap = '30px' if key == 'X3' else '20px'
        body = CONTENT[key].format(play=PLAY)
        cards.append('''  <div class="pg">
    <div class="cap"><div class="n">%s</div><div class="t">%s</div><div class="s">%s</div></div>
    <div class="phone"><div class="bd">
      <div class="brandrow"><span class="brand">对白</span><span class="cnt">01/07</span></div>
%s
      <div style="height:%s"></div>
%s
      <div class="sp"></div>
    </div>
%s
    </div>
  </div>''' % (key, t, d, cta, gap, body, TAB))

    return '''<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>主功能 · 重要但不异类</title>
<style>
%s
</style></head><body>
<div class="h1">主功能 · 要「重要」，但不要「异类」</div>
<div class="sub">
  解法不是加重色，而是<b>建立层级</b>：三版的主功能<b>结构和语法完全相同</b>（同样的图标、字号、箭头），<br>
  只是给它<b>比其他元素更重的分量</b> —— 不靠"变成另一个物种"来突出。
</div>
<div class="grid">
%s
</div></body></html>''' % (CSS, '\n'.join(cards))


if __name__ == '__main__':
    out = build()
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '主功能重要但不异类.html')
    open(path, 'w', encoding='utf-8').write(out)
    # 结构自检
    body = out.split('<div class="grid">')[1]
    o, c = body.count('<div'), body.count('</div>')
    print('  ✅ 已生成 主功能重要但不异类.html')
    print('     div 开 %d / 闭 %d → %s' % (o, c, '配平' if c == o + 1 else '不配平 差 %d' % (c - o - 1)))
