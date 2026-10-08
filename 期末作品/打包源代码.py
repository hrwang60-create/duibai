# -*- coding: utf-8 -*-
"""
打包提交用源代码压缩包（提交物 3c）

安全要求（最高优先级）：
  绝不能把 app-config/config.json 打进压缩包 —— 里面是真实密钥。
  打包后会自动扫描压缩包内容，确认密钥字符串不存在。
"""

import os
import zipfile
import hashlib

BASE = r'C:\Users\MI\Desktop\个人软件选题与需求分析2\期末作品'
SRC = os.path.join(BASE, 'duibai-app')
OUT = os.path.join(BASE, '提交物', '对白-源代码压缩包.zip')

# ---- 排除规则 ----
EXCLUDE_DIRS = {'unpackage', 'node_modules', '.git', '.hbuilderx'}
EXCLUDE_FILES = {
    'config.json',            # ⚠️ app-config 里的真实密钥（只排除这一个，别误伤 schema 的 config）
    '.DS_Store', 'Thumbs.db',
}
EXCLUDE_SUFFIX = ('.log', '.tmp')

# 打包时把 config.json 换成模板
SEED = 'app-config/config.example.json'
DEST = os.path.join(BASE, '云函数密钥配置说明.md')


def read_seed():
    p = os.path.join(SRC, 'uniCloud-aliyun', 'cloudfunctions', 'common', SEED)
    return open(p, encoding='utf-8').read() if os.path.isfile(p) else ''


def add(zf, root, arc_prefix):
    n = 0
    for d, dirs, files in os.walk(root):
        dirs[:] = [x for x in dirs if x not in EXCLUDE_DIRS]
        for f in files:
            if f in EXCLUDE_FILES or f.endswith(EXCLUDE_SUFFIX):
                continue
            full = os.path.join(d, f)
            rel = os.path.relpath(full, root).replace('\\', '/')
            # app-config 的 config.json 换成 example
            if rel.endswith('common/app-config/config.json'):
                rel = rel.replace('config.json', 'config.example.json')
            zf.write(full, arc_prefix + rel)
            n += 1
    return n


def build_readme():
    return '''# 「对白」源代码压缩包（提交物 3c）

## 一、这个压缩包里有什么

```
duibai-app/                      前后端全部源代码
├─ pages/          14 个页面（.vue）
├─ components/     14 个组件（.vue）
├─ api/            云函数调用封装（自动注入令牌）
├─ utils/          格式化工具
├─ uni.scss        「墨与朱」设计令牌
├─ App.vue         全局样式
├─ pages.json      路由与窗口配置
├─ manifest.json   小程序配置（AppID 等）
└─ uniCloud-aliyun/
   ├─ cloudfunctions/   8 个云函数 + 2 个公共模块
   └─ database/         11 张表的 schema 与种子数据

提交物/03-云数据导出/    云数据库导出（已脱敏）
README.md              本文件
云函数密钥配置说明.md    如何自行配置密钥
```

## 二、⚠️ 重要：密钥不在压缩包里

真实密钥在 `uniCloud-aliyun/cloudfunctions/common/app-config/config.json`，
**已被排除**，压缩包里只有同结构的模板 `config.example.json`。

要运行本项目，请参考 `云函数密钥配置说明.md` 自行填入密钥。

## 三、技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | uni-app（Vue 3）+ JavaScript + SCSS → 微信小程序 |
| 后端 | uniCloud 云函数（Node.js）+ 云数据库 + 云存储（阿里云） |
| 第三方 | DeepSeek（文章 → 对话稿）、火山豆包语音合成 2.0（对话稿 → 音频） |

## 四、怎么跑起来

1. 用 HBuilderX 打开 `duibai-app` 目录
2. 右键 `uniCloud-aliyun` → 关联云服务空间（阿里云）
3. 按 `云函数密钥配置说明.md` 配好密钥
4. 上传公共模块 `app-config` 和 `common`（**顺序不能反**）
5. 再上传其余 8 个云函数
6. 在 `uniCloud-aliyun/database` 目录执行一次「初始化云数据库」
7. HBuilderX → 运行 → 运行到小程序模拟器 → 微信开发者工具

## 五、目录约定

- **组件必须显式 `import` + 注册**，不依赖 easycom（实测 autoscan 在本工程不生效）
- 组件目录统一为 `components/组件名/组件名.vue`
- 数据库 schema 权限：客户端**只读** `banners` / `tones` / `daily_episodes`，其余**全部关闭**
- 业务读写一律走云函数，客户端不直连数据库
'''


def build_seed_doc():
    return '''# 云函数密钥配置说明

真实密钥**没有**包含在源代码压缩包里（安全要求）。要运行本项目，请自行填入。

## 一、需要哪些密钥

| 配置项 | 用途 | 必需 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | 把文章改写成双人对话稿 | ✅ 必需 |
| `VOLC_TTS_API_KEY` | 合成双人语音 | ✅ 必需（否则只有文字稿） |
| `VOLC_SPEAKER_A` / `VOLC_SPEAKER_B` | 甲 / 乙 两个音色 ID | ✅ 必需 |
| `VOLC_RESOURCE_ID` | 语音资源标识 | 填 `seed-tts-2.0` |
| `TOKEN_SECRET` | 令牌签名密钥 | ✅ 必需（自己随机生成一串） |
| `WX_SECRET` | 微信登录 | 选填（不填则无法微信一键登录） |

## 二、两种配置方式（优先级：环境变量 > config.json > 代码默认值）

### 方式 A：云函数环境变量（推荐）

在 uniCloud web 控制台 → 云函数 → 对应函数 → 环境变量里配置。
**优点**：密钥不进代码仓库。

### 方式 B：项目文件

把
`uniCloud-aliyun/cloudfunctions/common/app-config/config.example.json`
复制为 `config.json`，填入真实值。

**注意**：`config.json` 已加入 `.gitignore`，**不要提交、不要打包**。

## 三、第三方服务的开通要点

### DeepSeek
- 平台：<https://platform.deepseek.com>
- 需要的接口：`POST https://api.deepseek.com/chat/completions`（OpenAI 兼容）

### 火山引擎豆包语音合成 2.0
- 平台：<https://console.volcengine.com/speech/app>
- 需要的接口：`POST https://openspeech.bytedance.com/api/v3/tts/unidirectional`
- 请求头：`X-Api-Key`、`X-Api-Resource-Id: seed-tts-2.0`、`X-Api-Request-Id`
- ⚠️ **音色后缀必须和 Resource-Id 匹配**，否则报
  `55000000 resource ID is mismatched`：
  - `*_uranus_bigtts` / `saturn_*_tob` → `seed-tts-2.0`
  - `*_moon_bigtts` / `*_mars_bigtts` → `seed-tts-1.0`
- 音色 ID 在控制台「音色库 → 探索」里点右侧复制

## 四、模板内容

```json
%s
```
''' % read_seed()


os.makedirs(os.path.join(BASE, '提交物'), exist_ok=True)
if os.path.isfile(OUT):
    os.remove(OUT)

count = 0
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    count += add(zf, SRC, 'duibai-app/')
    dbexp = os.path.join(BASE, '提交物', '03-云数据导出')
    for f in os.listdir(dbexp):
        zf.write(os.path.join(dbexp, f), '提交物/03-云数据导出/' + f)
        count += 1
    zf.writestr('README.md', build_readme())
    zf.writestr('云函数密钥配置说明.md', build_seed_doc())
    count += 2

size = os.path.getsize(OUT)
print('已打包: %s' % os.path.basename(OUT))
print('  文件数: %d' % count)
print('  大小: %.1f KB' % (size / 1024.0))

# ---- 安全扫描：确认密钥没被打进去 ----
SECRETS = []
cfgp = os.path.join(SRC, 'uniCloud-aliyun', 'cloudfunctions', 'common', 'app-config', 'config.json')
if os.path.isfile(cfgp):
    import json
    for k, v in json.load(open(cfgp, encoding='utf-8')).items():
        if isinstance(v, str) and len(v) > 20 and not k.startswith('_'):
            SECRETS.append((k, v))

print('\n安全扫描（%d 个敏感串）：' % len(SECRETS))
leak = 0
with zipfile.ZipFile(OUT) as zf:
    names = zf.namelist()
    blob = b''
    for n in names:
        if n.endswith(('.js', '.json', '.md', '.vue')):
            blob += zf.read(n)
    text = blob.decode('utf-8', errors='ignore')
    for k, v in SECRETS:
        hit = v in text
        # config.json 本身不该出现
        has_cfg = any(n.endswith('app-config/config.json') for n in names)
        if hit or has_cfg:
            print('  ❌ %s 泄露（命中=%s, config.json 在包内=%s）' % (k, hit, has_cfg))
            leak += 1
        else:
            print('  ✅ %s 未出现在压缩包中' % k)
    print('\n  包内文件总数: %d' % len(names))
    print('  含 unpackage/: %s' % any('unpackage' in n for n in names))
    print('  含 node_modules/: %s' % any('node_modules' in n for n in names))

print('\n%s' % ('❌ 有泄露，必须处理！' if leak else '✅ 安全检查通过：无密钥泄露'))
