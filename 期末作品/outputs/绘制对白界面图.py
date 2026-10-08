# -*- coding: utf-8 -*-
"""只绘制项目关键界面展示图，不触碰小程序代码。"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

S = 2
W, H = 1900, 1210
PAPER = '#F5F2EA'
PAPER2 = '#EDE9DF'
INK = '#1A1A18'
INK2 = '#5A5750'
INK3 = '#8C877E'
FAINT = '#B7B0A6'
LINE = '#E2DDD2'
RED = '#C8452C'
RED_SOFT = '#F6E4DE'
WHITE = '#FCFAF5'
BG = '#EAE6DC'
im = Image.new('RGB', (W*S, H*S), BG)
d = ImageDraw.Draw(im)
font_dir = Path('C:/Windows/Fonts')
reg_path = next(p for p in [font_dir/'Noto Sans SC (TrueType).otf', font_dir/'msyh.ttc'] if p.exists())
bold_path = next(p for p in [font_dir/'Noto Sans SC Bold (TrueType).otf', font_dir/'msyhbd.ttc', font_dir/'msyh.ttc'] if p.exists())
_cache = {}

def font(size, bold=False):
    k = (size, bold)
    if k not in _cache:
        _cache[k] = ImageFont.truetype(str(bold_path if bold else reg_path), int(size*S))
    return _cache[k]

def box(x0,y0,x1,y1,fill,rad=0,outline=None,width=1):
    r = [round(v*S) for v in (x0,y0,x1,y1)]
    if rad:
        d.rounded_rectangle(r, radius=round(rad*S), fill=fill, outline=outline, width=width*S)
    else:
        d.rectangle(r, fill=fill, outline=outline, width=width*S)

def line(x0,y0,x1,y1,color=LINE,width=1):
    d.line([(round(x0*S),round(y0*S)),(round(x1*S),round(y1*S))], fill=color, width=max(1,round(width*S)))

def circle(x,y,r,fill,outline=None,width=1):
    d.ellipse([round((x-r)*S),round((y-r)*S),round((x+r)*S),round((y+r)*S)],fill=fill,outline=outline,width=width*S)

def text(x,y,t,size=14,color=INK,bold=False,anchor='lt'):
    d.text((round(x*S),round(y*S)),t,font=font(size,bold),fill=color,anchor=anchor,stroke_width=0)

def multi(x,y,rows,size,step,color=INK,bold=False):
    for i,t in enumerate(rows):
        text(x,y+i*step,t,size,color,bold)

def rule(x,y,w=342,color=LINE,width=1):
    line(x,y,x+w,y,color,width)

def pill(x,y,w,h,label,filled=True,color=INK,size=15):
    box(x,y,x+w,y+h,color if filled else PAPER,rad=h/2,outline=None if filled else LINE)
    text(x+w/2,y+h/2,label,size,WHITE if filled else INK,anchor='mm')

def play_icon(x,y,color=WHITE,r=7):
    d.polygon([(round((x-r*.55)*S),round((y-r)*S)),(round((x-r*.55)*S),round((y+r)*S)),(round((x+r)*S),round(y*S))],fill=color)

def phone(x,caption,num,english,time='09:41'):
    y=250
    # slight grounded shadow, no glass treatment
    box(x+3,y+7,x+393,y+851,'#DFDBD1',rad=29)
    box(x,y,x+390,y+844,WHITE,rad=27,outline='#E5E0D6')
    text(x,y-44,f'{num}   {english}',12,RED,True)
    text(x,y-25,caption,17,INK,True)
    text(x+24,y+17,time,12,INK,True)
    # signal / wifi / battery simplified, intentionally monochrome
    for i,h in enumerate([4,6,8,10]):
        box(x+307+i*5,y+29-h,x+310+i*5,y+29,INK)
    d.arc([round((x+331)*S),round((y+17)*S),round((x+347)*S),round((y+31)*S)],190,350,fill=INK,width=round(1.4*S))
    circle(x+339,y+29,1.5,INK)
    box(x+355,y+18,x+372,y+29,WHITE,rad=2,outline=INK)
    box(x+357,y+20,x+367,y+27,INK,rad=1)
    box(x+372,y+22,x+374,y+25,INK)
    return y

# editorial header
box(110,61,146,97,RED,rad=7)
text(128,79,'对',20,WHITE,True,anchor='mm')
text(159,64,'对白  /  DUIBAI',16,INK,True)
text(159,88,'把文章，聊给你听。',12,INK3)
text(110,139,'一篇文章，四步变成一场对话。',37,INK,True)
text(112,195,'核心流程界面概念稿  ·  纸感 / 墨色 / 朱红  ·  微信小程序',14,INK2)
text(1790,78,'DESIGN STUDY   /   01—04',12,INK3,anchor='rt')
line(110,225,1790,225,'#D2CCC1')

# 01 — Home
x=110; y=phone(x,'首页 · 今日一集','01','DISCOVER')
text(x+24,y+68,'对白',16,INK,True)
text(x+340,y+68,'我的',13,INK2,anchor='rt')
multi(x+24,y+117,['把文章，','聊给你听。'],28,38,INK,True)
line(x+24,y+224,x+366,y+224,RED,2)
text(x+24,y+242,'今日一集',12,RED,True)
text(x+366,y+244,'抬杠 · 06:42 · 18句',11,INK3,anchor='rt')
text(x+24,y+277,'光合作用为什么分两步？',21,INK,True)
text(x+24,y+331,'甲',13,INK3,True)
text(x+52,y+329,'光合作用其实没那么难。',14,FAINT)
text(x+24,y+369,'乙',13,RED,True)
text(x+52,y+365,'难的是课本非要写得这么复杂。',16,RED)
text(x+24,y+411,'甲',13,INK3,True)
text(x+52,y+409,'那光反应到底在干嘛？',14,FAINT)
pill(x+24,y+462,281,48,'开始听',True,INK,15)
play_icon(x+115,y+486,WHITE,5)
text(x+316,y+480,'往期  ›',12,INK2)
pill(x+24,y+552,342,54,'＋  投一篇文章',False,size=16)
text(x+195,y+621,'也可以粘贴或从聊天选文件',11,INK3,anchor='mm')
text(x+24,y+683,'最近',12,INK3)
rule(x+24,y+711)
text(x+24,y+726,'光合作用.docx',14,INK)
text(x+366,y+729,'抬杠 · 42句',11,INK3,anchor='rt')
rule(x+24,y+756)
text(x+24,y+767,'数据报告.pdf',14,INK)
text(x+366,y+770,'师生 · 已失败',11,INK3,anchor='rt')
box(x+1,y+786,x+389,y+843,WHITE)
rule(x+1,y+786,388)
for xx,label,col in [(x+65,'对白',INK),(x+195,'历史',INK3),(x+325,'我的',INK3)]:
    text(xx,y+812,label,12,col,label=='对白',anchor='mm')

# 02 — Input expanded
x=540; y=phone(x,'首页展开 · 输入文章','02','CREATE')
text(x+24,y+68,'←  收起',14,INK2)
text(x+24,y+121,'投一篇文章',28,INK,True)
text(x+24,y+167,'粘贴或选取文章，让两个人替你聊开。',13,INK2)
box(x+24,y+207,x+366,y+384,PAPER,rad=8,outline=LINE)
text(x+41,y+228,'文章内容',12,INK3)
multi(x+41,y+263,['光合作用是植物将光能转化为化学能的','过程。光反应在类囊体薄膜上进行，','产生 ATP 与 NADPH，供后续反应使用。'],15,28,INK)
line(x+328,y+319,x+328,y+343,RED,2)
box(x+24,y+400,x+190,y+440,WHITE,rad=5,outline=LINE)
box(x+199,y+400,x+366,y+440,WHITE,rad=5,outline=LINE)
text(x+107,y+420,'选择文件',13,INK2,anchor='mm')
text(x+282,y+420,'从聊天选',13,INK2,anchor='mm')
text(x+24,y+456,'3280 字  ·  预计约 4 分钟',12,INK3)
rule(x+24,y+496)
text(x+24,y+518,'想听他们怎么聊？',17,INK,True)
text(x+24,y+546,'选一种口吻，台词会跟着变。',12,INK3)
def chip(xx,yy,w,label,on=False):
    box(xx,yy,xx+w,yy+38,RED_SOFT if on else WHITE,rad=19,outline=RED if on else LINE)
    text(xx+w/2,yy+19,label,13,RED if on else INK2,on,anchor='mm')
chip(x+24,y+582,105,'抬杠讨论',True)
chip(x+139,y+582,105,'轻松解释')
chip(x+254,y+582,112,'朋友聊天')
chip(x+24,y+629,105,'新闻播客')
chip(x+139,y+629,105,'严谨讲解')
chip(x+254,y+629,112,'课堂讨论')
line(x+24,y+695,x+24,y+760,RED,2)
text(x+38,y+690,'这句会这样说',11,RED,True)
multi(x+38,y+721,['“等下，光反应和暗反应，','  原来不是一回事儿？”'],15,25,INK)
text(x+24,y+788,'接下来：生成对谈 → 核对疑点 → 开始听',11,INK3)
pill(x+24,y+819,342,48,'开始聊   →',True,INK,15)

# 03 — Confirmation
x=970; y=phone(x,'确认 · 对话停在可疑处','03','VERIFY')
text(x+24,y+68,'←  返回',13,INK2)
text(x+366,y+69,'1 / 3',13,RED,True,anchor='rt')
text(x+24,y+119,'有 3 处需要你确认',24,INK,True)
text(x+24,y+159,'先把不确定的地方说清楚，再听。',13,INK2)
line(x+24,y+211,x+366,y+211,LINE)
text(x+31,y+235,'甲',12,FAINT,True)
text(x+58,y+232,'光反应在哪儿进行来着？',14,FAINT)
text(x+31,y+280,'乙',12,FAINT,True)
text(x+58,y+275,'在叶绿体基质里，先把能量存下来。',14,FAINT)
line(x+24,y+327,x+366,y+327,LINE)
# The doubt sits physically inside the conversation rather than in a form list
box(x+24,y+347,x+366,y+687,PAPER,rad=7,outline=LINE)
line(x+24,y+347,x+366,y+347,RED,3)
circle(x+54,y+385,13,RED_SOFT)
text(x+54,y+385,'?',17,RED,True,anchor='mm')
text(x+78,y+370,'这里似乎说岔了',19,INK,True)
multi(x+42,y+420,['台词说“叶绿体基质”，但原文里','说的是“类囊体薄膜”。'],15,28,INK)
text(x+42,y+503,'原文  ·  第 3 段',11,RED,True)
box(x+42,y+527,x+348,y+605,WHITE,rad=4)
multi(x+55,y+541,['光反应在类囊体薄膜上进行，','产生 ATP 与 NADPH。'],14,25,INK2)
line(x+42,y+624,x+348,y+624,LINE)
text(x+42,y+645,'查看原文  ↗',12,INK2)
text(x+175,y+645,'改这句',12,RED,True)
text(x+348,y+645,'确认没问题',12,INK2,anchor='rt')
text(x+31,y+719,'甲',12,FAINT,True)
text(x+58,y+715,'哦，位置说错了，难怪听着不对。',14,FAINT)
text(x+24,y+774,'对话停在这里，回应之后才继续。',12,INK3)
box(x+24,y+819,x+366,y+867,PAPER2,rad=24)
text(x+195,y+843,'确认完 3 处后，生成声音',14,INK3,anchor='mm')

# 04 — Conversation stream
x=1400; y=phone(x,'结果 · 对谈就是主界面','04','LISTEN')
text(x+24,y+68,'←  光合作用为什么分两步？',15,INK,True)
text(x+368,y+68,'···',18,INK2,anchor='rt')
rule(x+24,y+106)
text(x+24,y+126,'抬杠讨论  /  18 句',12,INK3)
text(x+366,y+126,'07 / 18',11,INK3,anchor='rt')
# progress-as-position, not a timeline player
line(x+28,y+197,x+28,y+616,LINE,2)
circle(x+28,y+391,5,RED)
text(x+50,y+199,'甲',12,FAINT,True)
text(x+78,y+195,'光合作用其实没那么难。',13,FAINT)
text(x+50,y+260,'乙',12,FAINT,True)
multi(x+78,y+256,['难的是课本非要写得','这么复杂。'],13,23,FAINT)
text(x+50,y+348,'乙',15,RED,True)
multi(x+78,y+337,['不是。原文说的是','“不需要光直接参与”。'],21,37,RED,True)
text(x+78,y+433,'出处  P3  ↗    ·    改这句',12,RED)
text(x+50,y+493,'甲',12,INK3,True)
text(x+78,y+487,'那正午太阳最猛，它应该最快吧？',13,INK3)
text(x+50,y+553,'乙',12,FAINT,True)
text(x+78,y+548,'原文说反而会下降，这叫“光合午休”。',12,FAINT)
line(x+24,y+655,x+366,y+655,LINE)
text(x+24,y+678,'这里听不清？',13,INK2)
text(x+366,y+678,'重新聊这一句  ↗',13,RED,anchor='rt')
text(x+195,y+738,'06:42  ·  点任意一句即可重听',12,INK3,anchor='mm')
box(x+24,y+778,x+366,y+841,INK,rad=31)
text(x+61,y+809,'1.0×',12,WHITE,anchor='mm')
text(x+133,y+809,'‹',30,WHITE,anchor='mm')
circle(x+195,y+809,20,WHITE)
box(x+189,y+800,x+193,y+818,INK,rad=1)
box(x+198,y+800,x+202,y+818,INK,rad=1)
text(x+255,y+809,'›',30,WHITE,anchor='mm')
text(x+326,y+809,'•••',13,WHITE,anchor='mm')

# footer for the design board
line(110,1138,1790,1138,'#D2CCC1')
text(110,1160,'对白  /  核心体验：投入文章 → 核对疑点 → 旁听对话',13,INK2)
text(1790,1160,'视觉概念稿 · 非程序界面截图',12,INK3,anchor='rt')
output = Path(__file__).resolve().parent / '对白-四屏UI界面设计图.png'
im.save(output, 'PNG', optimize=True)
print(output)
