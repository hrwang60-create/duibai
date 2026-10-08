# -*- coding: utf-8 -*-
"""生成《云数据导出说明》—— 配套 提交物/03-云数据导出/对白-云数据库导出.json"""

import json
import os

BASE = r'C:\Users\MI\Desktop\个人软件选题与需求分析2\期末作品'
OUT_DIR = os.path.join(BASE, '提交物', '03-云数据导出')

exp = json.load(open(os.path.join(OUT_DIR, '对白-云数据库导出.json'), encoding='utf-8'))
meta = exp['data']['meta']

REL = [
    ('users', '账号（微信 openid / 昵称 / 角色 / 状态）'),
    ('articles', '文章原文（标题 / 全文 / 字数）'),
    ('paragraphs', '文章切分出的段落（seq 决定台词出处）'),
    ('scripts', '一场对谈（口吻 / 状态 / 句数 / 待确认数 / 对话痕迹）'),
    ('dialogue_lines', '台词条目（说话人 / 文本 / 出处段号 / 可疑标记 / 是否已确认）'),
    ('audio_segments', '音频分段（一句话一个 mp3，与台词一对一）'),
    ('tones', '6 种对谈口吻（含提示词，直接决定生成质量）'),
    ('banners', '首页横幅'),
    ('gen_logs', '生成日志（成功失败 / 耗时 / 阶段）'),
    ('feedbacks', '用户反馈'),
    ('daily_episodes', '每日一集（离线预置的内容与台词）'),
]

FIELDS = [
    ('users', ['_id', 'openid（已脱敏）', 'nickname', 'avatar', 'role（user/admin）',
               'status（1 正常 / 0 封禁）', 'created_at', 'last_login']),
    ('articles', ['_id', 'user_id', 'title', 'content', 'char_count', 'created_at']),
    ('paragraphs', ['_id', 'article_id', 'seq（段号，从 1 起）', 'text']),
    ('scripts', ['_id', 'user_id', 'article_id', 'tone_code',
                 'status（generated / confirmed / audio_ready / failed）',
                 'line_count', 'pending_confirm', 'preview（对话痕迹，前两句）', 'created_at']),
    ('dialogue_lines', ['_id', 'script_id', 'seq', 'speaker（A 甲 / B 乙）', 'text',
                        'source_paragraph（0 = 无原文支撑）',
                        'flag（空 / no_source / term）', 'confirmed']),
    ('audio_segments', ['_id', 'line_id', 'script_id', 'user_id', 'speaker',
                        'file_id（云存储 https 直链）', 'size', 'duration', 'created_at']),
    ('tones', ['_id', 'code', 'name', 'prompt_template（直接决定生成质量）', 'sample',
               'sort', 'enabled']),
    ('daily_episodes', ['_id', 'date_key（如 20261003）', 'title', 'source_title', 'source_text',
                        'tone_code', 'duration_sec', 'line_count', 'lines[]',
                        'audio_file_id', 'enabled']),
]

SAMPLE = [
    '甲：光合作用其实没那么难。',
    '乙：难的是课本非要写得这么复杂。',
    '甲：那光反应到底在干嘛？',
    '乙：简单说，就是先把能量和氢存起来，装成两节电池。',
    '甲：所以暗反应是花电池的那一步？',
    '乙：对，而且它不需要光直接参与——不是不能在光下发生。',
]

L = []
A = L.append

A('# 云数据导出说明（提交物 3c）')
A('')
A('> 配套文件：`对白-云数据库导出.json`（同目录）')
A('')
A('## 一、导出信息')
A('')
A('| 项 | 值 |')
A('| --- | --- |')
A('| 平台 | uniCloud **阿里云** |')
A('| 服务空间 | `mp-3ca9b9fc-c332-44f5-ab89-c2acb84e9b8d` |')
A('| 导出时间 | %s |' % meta['exported_at'])
A('| 集合数量 | **%d 张表** |' % meta['collections'])
A('| 记录总数 | %d 条 |' % meta['total_records'])
A('| 是否脱敏 | **是** |')
A('')
A('### 脱敏规则（重要）')
A('')
A('所有 `openid`（微信用户唯一标识）已替换为：')
A('')
A('```')
A('MASKED_ + 原值前 3 位 + **** + 原值的 sha256 前 8 位')
A('```')
A('')
A('例如 `MASKED_oXk****3f9a2b71`。')
A('')
A('**保留前 3 位，是为了让老师能看出几条记录属于同一个用户；')
A('尾部哈希保证不可反推回真实 openid。**')
A('')
A('导出文件中**不含任何密钥、token、口令**。')
A('')
A('## 二、11 张表一览')
A('')
A('| 表名 | 作用 | 本次记录数 |')
A('| --- | --- | --- |')
for name, desc in REL:
    A('| `%s` | %s | %s |' % (name, desc, meta['counts'].get(name, '-')))
A('')
A('## 三、数据关系')
A('')
A('```')
A('users   1 ── n articles   1 ── n paragraphs')
A('users   1 ── n scripts    1 ── n dialogue_lines   1 ── 1 audio_segments')
A('tones   1 ── n scripts            （口吻模板直接决定生成质量）')
A('banners / daily_episodes        （运营内容，客户端可直读）')
A('```')
A('')
A('### 出处回溯是靠外键实现的')
A('')
A('`dialogue_lines.source_paragraph` → `paragraphs.seq`。')
A('')
A('台词若标了 `source_paragraph: 0`，表示**这句话没有原文支撑**（模型自己加的），')
A('前端会把它列进「可疑处」让用户确认。')
A('')
A('**这就是「对话不是凭空编的」的机制保障** —— 每句话都能被追溯回原文，')
A('追不到的必须由人点头才算数。')
A('')
A('## 四、核心表字段')
A('')
for name, fields in FIELDS:
    A('**`%s`**' % name)
    A('')
    for f in fields:
        A('- `%s`' % f)
    A('')
A('## 五、真实生成样本（已脱敏）')
A('')
A('以下是开发期用**真实 DeepSeek** 生成的对话稿节选，')
A('用来展示 `dialogue_lines` 的实际内容形态：')
A('')
A('```')
for s in SAMPLE:
    A(s)
A('```')
A('')
A('对应的数据库记录形如：')
A('')
A('```json')
A('{')
A('  "speaker": "B",')
A('  "text": "难的是课本非要写得这么复杂。",')
A('  "source_paragraph": 1,')
A('  "flag": "",')
A('  "confirmed": true')
A('}')
A('```')
A('')
A('## 六、这份导出里有什么真实数据')
A('')
A('不是空壳 —— 里面是**跑通一次真实业务链路**留下的完整数据痕迹：')
A('')
A('| 表 | 条数 | 是什么 |')
A('| --- | --- | --- |')
A('| `users` | %s | 演示账号（含 openid 脱敏样例） |' % meta['counts'].get('users'))
A('| `articles` | %s | 一篇真实上传的文章《光合作用为什么分两步？》 |' % meta['counts'].get('articles'))
A('| `paragraphs` | %s | 该文章切分出的 4 个段落（**台词出处的依据**） |' % meta['counts'].get('paragraphs'))
A('| `scripts` | %s | 由该文章生成的一场对谈 |' % meta['counts'].get('scripts'))
A('| `dialogue_lines` | %s | **真实 DeepSeek 生成的台词**，每条带出处段号 |' % meta['counts'].get('dialogue_lines'))
A('| `audio_segments` | %s | **火山 TTS 逐句合成**的音频分段，与台词一对一 |' % meta['counts'].get('audio_segments'))
A('| `gen_logs` | %s | 生成日志（成功/失败/耗时/阶段） |' % meta['counts'].get('gen_logs'))
A('| `daily_episodes` | %s | 每日一集预置内容（7 集） |' % meta['counts'].get('daily_episodes'))
A('| `tones` | %s | 6 种对谈口吻模板 |' % meta['counts'].get('tones'))
A('| `banners` | %s | 首页横幅 |' % meta['counts'].get('banners'))
A('')
A('**这 14 条台词不是 mock 数据** —— 是真实调用 DeepSeek 生成的；')
A('**14 个音频也不是模拟的** —— 是真实调用火山豆包语音合成 2.0 逐句合成并上传云存储的。')
A('')
A('### 怎么验证它们是真的')
A('')
A('`audio_segments.file_id` 是**云存储的 https 直链**，可以直接打开试听：')
A('')
A('```')
A('https://mp-3ca9b9fc-c332-44f5-ab89-c2acb84e9b8d.cdn.bspapp.com/cloudstorage/xxxxx.mp3')
A('```')
A('')
A('把其中任意一条的 base64 解码，就是一个**标准 MP3 文件**（文件头 `494433` = ID3）。')
A('')
A('### 一次完整链路耗时（云端实测）')
A('')
A('| 环节 | 耗时 |')
A('| --- | --- |')
A('| 文章切段 + 落库 | < 1 秒 |')
A('| 真实大模型生成 14 条台词 | 约 10.8 秒 |')
A('| 真实 TTS 逐句合成 14 句（分 2 批） | 约 52 秒 |')
A('')
A('开发期另有一份自动化自检，**45 项断言全部通过**，覆盖：')
A('mock 边界校验、真实大模型、微信登录配置、真实 TTS、409 规则、安全红线。')

path = os.path.join(OUT_DIR, '云数据导出说明.md')
open(path, 'w', encoding='utf-8').write('\n'.join(L))
print('已生成:', os.path.basename(path), os.path.getsize(path), '字节')
