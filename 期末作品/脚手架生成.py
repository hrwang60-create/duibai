# -*- coding: utf-8 -*-
"""「对白听文」工程脚手架生成器。
生成：uniCloud 数据库 schema（10 张表）、db_init.json（种子数据）、13 个页面文件（占位）。
可重复执行，会覆盖同名文件。
"""
import json
import os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "duibai-app")
DB = os.path.join(ROOT, "uniCloud-aliyun", "database")

OK = {"bsonType": "bool", "description": ""}
S = {"bsonType": "string", "description": ""}
I = {"bsonType": "int", "description": ""}
TS = {"bsonType": "timestamp", "description": ""}


def f(t, desc, **kw):
    d = {"bsonType": t, "description": desc}
    d.update(kw)
    return d


def schema(required, permission, props, index=None):
    s = {
        "bsonType": "object",
        "required": required,
        "permission": permission,
        "properties": props,
    }
    if index:
        s["index"] = index
    return s


# ---------------- 10 张表 ----------------
SCHEMAS = {
    # ① 用户管理（老师点名要求）
    "users": schema(
        ["openid"],
        {"read": "doc.openid == auth.openid", "create": "auth.openid != null",
         "update": "doc.openid == auth.openid", "delete": False},
        {
            "_id": f("string", "ID，系统自动生成"),
            "openid": f("string", "微信 openid，唯一标识一个用户", foreignKey=None),
            "nickname": f("string", "昵称"),
            "avatar": f("string", "头像 URL"),
            "role": f("string", "角色：user / admin", enum=["user", "admin"], default="user"),
            "status": f("int", "状态：1 正常 / 0 封禁", default=1),
            "created_at": f("timestamp", "注册时间"),
            "last_login": f("timestamp", "最近登录时间"),
        },
        [{"IndexName": "openid_uniq", "MgoKeySchema": {"MgoIndexKeys": [{"Name": "openid", "Direction": "1"}], "MgoIsUnique": True}}],
    ),
    # ② Banner（老师点名要求）
    "banners": schema(
        ["title", "image"],
        {"read": True, "create": False, "update": False, "delete": False},
        {
            "_id": f("string", "ID"),
            "title": f("string", "标题"),
            "image": f("string", "图片地址（云存储 fileID 或 URL）"),
            "link": f("string", "点击跳转的页面路径，可空"),
            "sort": f("int", "排序，越小越靠前", default=0),
            "enabled": f("bool", "是否启用", default=True),
            "start_at": f("timestamp", "开始展示时间，可空"),
            "end_at": f("timestamp", "结束展示时间，可空"),
            "created_at": f("timestamp", "创建时间"),
        },
    ),
    # ③ 口吻模板（本项目特有的管理项）
    "tones": schema(
        ["code", "name"],
        {"read": True, "create": False, "update": False, "delete": False},
        {
            "_id": f("string", "ID"),
            "code": f("string", "口吻编码，主键语义，如 teacher_student"),
            "name": f("string", "口吻名称，如 师生"),
            "description": f("string", "一句话说明，用于选择时的提示"),
            "prompt_template": f("string", "该口吻的 Prompt 模板，管理端可改"),
            "sample": f("string", "口吻示例（展示在选择器里）"),
            "enabled": f("bool", "是否启用", default=True),
            "sort": f("int", "排序", default=0),
        },
    ),
    # ④ 文章
    "articles": schema(
        ["user_id", "title", "content"],
        {"read": "doc.user_id == auth.uid", "create": "auth.uid != null",
         "update": "doc.user_id == auth.uid", "delete": "doc.user_id == auth.uid"},
        {
            "_id": f("string", "ID"),
            "user_id": f("string", "所属用户 _id"),
            "title": f("string", "标题（取文件名或首行）"),
            "content": f("string", "正文全文"),
            "char_count": f("int", "字数"),
            "created_at": f("timestamp", "创建时间"),
        },
    ),
    # ⑤ 段落（出处回溯的基础）
    "paragraphs": schema(
        ["article_id", "seq"],
        {"read": "doc.user_id == auth.uid", "create": "auth.uid != null",
         "update": False, "delete": False},
        {
            "_id": f("string", "ID"),
            "article_id": f("string", "所属文章 _id"),
            "user_id": f("string", "所属用户 _id（便于权限判定）"),
            "seq": f("int", "段落在文章内的序号，从 1 开始，连续唯一"),
            "text": f("string", "段落原文"),
        },
    ),
    # ⑥ 对话稿
    "scripts": schema(
        ["article_id", "tone_code"],
        {"read": "doc.user_id == auth.uid", "create": "auth.uid != null",
         "update": "doc.user_id == auth.uid", "delete": "doc.user_id == auth.uid"},
        {
            "_id": f("string", "ID"),
            "article_id": f("string", "所属文章 _id"),
            "user_id": f("string", "所属用户 _id"),
            "tone_code": f("string", "口吻编码，必须存在于 tones.code"),
            "status": f("string", "状态：generated / confirmed / audio_ready / failed",
                        enum=["generated", "confirmed", "audio_ready", "failed"], default="generated"),
            "line_count": f("int", "对话条目数"),
            "pending_confirm": f("int", "待确认的可疑项数量"),
            "preview": f("array", "前两句台词，供历史页显示「对话痕迹」"),
            "created_at": f("timestamp", "创建时间"),
        },
    ),
    # ⑦ 对话条目
    "dialogue_lines": schema(
        ["script_id", "seq", "speaker", "text"],
        {"read": "doc.user_id == auth.uid", "create": "auth.uid != null",
         "update": "doc.user_id == auth.uid", "delete": False},
        {
            "_id": f("string", "ID"),
            "script_id": f("string", "所属对话稿 _id"),
            "user_id": f("string", "所属用户 _id"),
            "seq": f("int", "句序，从 1 开始"),
            "speaker": f("string", "说话人，取值限定为两个角色", enum=["A", "B"]),
            "text": f("string", "台词文本"),
            "source_paragraph": f("int", "对应原文段落序号，0 表示无出处"),
            "flag": f("string", "可疑类型：术语读法 / 无出处，空串表示无疑点",
                      enum=["", "term", "no_source"]),
            "confirmed": f("bool", "用户是否已确认该可疑处", default=False),
        },
    ),
    # ⑧ 音频片段（与对话条目一对一，支持单句重做）
    "audio_segments": schema(
        ["line_id", "file_id"],
        {"read": "doc.user_id == auth.uid", "create": False,
         "update": False, "delete": False},
        {
            "_id": f("string", "ID"),
            "line_id": f("string", "对应对话条目 _id，一对一"),
            "script_id": f("string", "所属对话稿 _id"),
            "user_id": f("string", "所属用户 _id"),
            "speaker": f("string", "音色角色", enum=["A", "B"]),
            "file_id": f("string", "云存储 fileID"),
            "duration": f("double", "时长（秒）"),
            "created_at": f("timestamp", "合成时间"),
        },
    ),
    # ⑨ 生成日志（管理端统计用）
    "gen_logs": schema(
        ["stage"],
        {"read": False, "create": False, "update": False, "delete": False},
        {
            "_id": f("string", "ID"),
            "user_id": f("string", "所属用户 _id"),
            "script_id": f("string", "关联对话稿 _id，可空"),
            "stage": f("string", "环节：parse / dialogue / tts",
                       enum=["parse", "dialogue", "tts"]),
            "ms": f("int", "耗时（毫秒）"),
            "ok": f("bool", "是否成功"),
            "error_code": f("string", "失败时的错误码，可空"),
            "created_at": f("timestamp", "记录时间"),
        },
    ),
    # ⑩ 用户反馈
    "feedbacks": schema(
        ["content"],
        {"read": "doc.user_id == auth.uid", "create": "auth.uid != null",
         "update": False, "delete": False},
        {
            "_id": f("string", "ID"),
            "user_id": f("string", "提交用户 _id"),
            "content": f("string", "反馈内容"),
            "contact": f("string", "联系方式，可空"),
            "handled": f("bool", "是否已处理", default=False),
            "created_at": f("timestamp", "提交时间"),
        },
    ),
    # ⑪ 每日一集（离线预置内容，客户端可读，零云函数调用）
    "daily_episodes": schema(
        ["date_key", "title"],
        {"read": True, "create": False, "update": False, "delete": False},
        {
            "_id": f("string", "ID"),
            "date_key": f("int", "日期键，如 20261003，用于按日期取当天那集"),
            "title": f("string", "集标题"),
            "source_title": f("string", "取材自哪篇文章"),
            "source_text": f("string", "原文（出处回溯用）"),
            "tone_code": f("string", "口吻编码"),
            "toneName": f("string", "口吻中文名（冗余字段，省一次查询）"),
            "duration_sec": f("int", "时长（秒）"),
            "line_count": f("int", "句数"),
            "lines": f("array", "对话条目 [{speaker,text,source_paragraph}]"),
            "audio_file_id": f("string", "云存储音频 fileID，可空（TTS 接上后补）"),
            "enabled": f("bool", "是否上架", default=True),
        },
    ),
}

# ---------------- 权限策略 ----------------
# 客户端直连数据库的权限一律关闭，所有业务读写都走云函数。
# 理由：① 不必引入 uni-id，少一层依赖；② 权限判断集中在云函数，安全边界清晰。
# 例外：banners / tones 是公开展示数据，客户端可直接读（省一次云函数往返）。
FUNC_ONLY = ["users", "articles", "paragraphs", "scripts",
             "dialogue_lines", "audio_segments", "feedbacks"]
for _n in FUNC_ONLY:
    SCHEMAS[_n]["permission"] = {"read": False, "create": False, "update": False, "delete": False}

# ---------------- 种子数据 ----------------
TONES_SEED = [
    ("teacher_student", "师生", "一位老师带着学生一问一答，学生替你问出疑惑",
     "你是一位耐心老师，把下面文章的书面语改写成【老师】与【学生】的双人口语对话。"
     "学生要主动追问、复述、举例；老师负责讲解与纠正。句子要短，避免书面长句。",
     "学生：等下，这两个阶段是分开干的？"),
    ("bicker", "抬杠", "两个人各持一边，在争论中把事实讲清楚",
     "你写两个人的对话，两人观点相左、互相质疑抬杠，在争辩中把文章的事实与结论讲清楚。"
     "可以有反问和反驳，但不得编造原文没有的事实。",
     "甲：那按你这么说，中午太阳最大岂不是最快？"),
    ("elder_young", "老少", "一位长辈和一个年轻人对话，长辈爱打比方",
     "你写一位长辈（甲）与一位年轻人（乙）的对话。长辈习惯用生活经验和打比方来解释，"
     "年轻人负责提出疑问。语气亲切，句子口语化。",
     "甲：这就跟家里烧水一个道理，火再旺也得有个锅接着。"),
    ("interview", "访谈", "主持人提问，嘉宾回答，节奏平稳",
     "你写一段访谈：甲是主持人，负责按逻辑顺序提问；乙是受访者，负责回答。"
     "问题要推进理解，不能只是复述原文。",
     "甲：那这里最关键的一步是哪一步？"),
    ("podcast", "播客对谈", "两个熟人闲聊式对谈，轻松随意",
     "你写两个熟人闲聊式的对谈，语气轻松随意，可以有感叹和插话，"
     "但核心事实必须与原文一致。句子短，节奏快。",
     "乙：哎这个我之前真理解错了。"),
    ("bedtime", "睡前", "语速放慢、句子更短、语气轻柔",
     "你写一段睡前听的对话，语速慢、句子短、语气轻，避免激烈争论和数字密集的段落。"
     "用平缓的对谈把文章要点讲清楚。",
     "甲：简单说，就是……"),
]

BANNERS_SEED = [
    {"title": "把文章，聊给你听", "image": "static/images/banner-default.png",
     "link": "", "sort": 1, "enabled": True},
    {"title": "通勤路上，用耳朵读完一篇", "image": "static/images/banner-default.png",
     "link": "", "sort": 2, "enabled": True},
]

# ---------------- 每日一集（离线预置，零云函数调用） ----------------
# 为什么离线预置：uniCloud 按「函数+小时」计费，免费额度约 11 个函数小时/月。
# 若用定时任务每天生成 = 30 个函数小时/月 → 必然超额停服。
# 且内容运营本来就该离线产，不该实时生成。


def ep(date_key, title, source_title, source_text, tone_code, tone_name, duration, lines):
    ls = [{"speaker": s, "text": t, "source_paragraph": p} for (s, t, p) in lines]
    return {
        "_id": "ep_%d" % date_key,
        "date_key": date_key,
        "title": title,
        "source_title": source_title,
        "source_text": source_text,
        "tone_code": tone_code,
        "toneName": tone_name,
        "duration_sec": duration,
        "line_count": len(ls),
        "lines": ls,
        "audio_file_id": "",
        "enabled": True,
    }


DAILY_SEED = [
    ep(20261003, "光合作用为什么分两步？", "光合作用（节选）",
       "光合作用分为光反应和暗反应两个阶段。光反应在类囊体薄膜上进行，需要光直接参与，"
       "产物是 ATP 和 NADPH。暗反应在叶绿体基质中进行，不需要光直接参与，"
       "但要用掉光反应产出的 ATP 和 NADPH。",
       "bicker", "抬杠", 402,
       [("A", "光合作用其实没那么难。", 1),
        ("B", "难的是课本非要写得这么复杂。", 1),
        ("A", "那光反应到底在干嘛？", 2),
        ("B", "简单说，就是先把能量和氢存起来，装成两节电池。", 2),
        ("A", "所以暗反应是花电池的那一步？", 3),
        ("B", "对，而且它不需要光直接参与——不是不能在光下发生。", 3)]),

    ep(20261002, "为什么有人会晕车？", "前庭系统与运动病（节选）",
       "内耳前庭系统感受身体的运动，而眼睛看到的往往是相对静止的车厢。"
       "两套信号冲突时，大脑无法判断身体到底在不在动，就可能引发恶心、出汗等反应。",
       "teach", "轻松解释", 252,
       [("A", "我一直不明白，为什么坐车会晕，自己开车反而不晕？", 1),
        ("B", "因为开车的人知道车要往哪儿拐，身体先有准备。", 1),
        ("A", "所以是脑子被骗了？", 1),
        ("B", "不是被骗，是两套信号打架：耳朵说在动，眼睛说没动。", 1)]),

    ep(20261001, "咖啡因是怎么让你清醒的？", "腺苷与咖啡因（节选）",
       "腺苷与受体结合会产生困倦感。咖啡因的结构与腺苷相似，会占据受体位置，"
       "阻断困倦信号，但它并没有消除疲劳，只是让你暂时感觉不到。",
       "interview", "课堂讨论", 321,
       [("A", "喝咖啡到底是提神，还是透支？", 1),
        ("B", "它没消除疲劳，只是把「困」这个信号暂时挡住了。", 1),
        ("A", "那等它代谢掉，困劲儿会一次性回来？", 1),
        ("B", "对，这就是为什么咖啡劲过去之后会突然特别困。", 1)]),

    ep(20260930, "为什么熬夜会变丑？", "睡眠与皮肤修复（节选）",
       "睡眠不足会影响皮质醇分泌、皮肤屏障修复与微循环，"
       "导致眼周水肿、肤色暗沉、黑眼圈加重。",
       "podcast", "朋友聊天", 236,
       [("A", "熬夜为什么会写在脸上？", 1),
        ("B", "因为皮肤的修复班是夜里上的，你不睡它就没法干活。", 1),
        ("A", "那熬夜之后补一觉能补回来吗？", 1),
        ("B", "能补一部分，但连着熬几天，账就还不上了。", 1)]),

    ep(20260929, "空调为什么会让房间变干？", "空调除湿原理（节选）",
       "空调制冷时蒸发器温度低于露点，空气中的水蒸气在其表面凝结成水排出室外，"
       "因此室内绝对含水量下降；同时低温使相对湿度进一步降低。",
       "rigorous", "严谨讲解", 284,
       [("A", "空调一开就觉得嗓子干，是心理作用吗？", 1),
        ("B", "不是。制冷时空气里的水会在冷管上凝成水珠排到室外。", 1),
        ("A", "所以是水被带走了。", 1),
        ("B", "对，室内温度降了，水也少了。", 1)]),

    ep(20260928, "冬天摸铁栏杆为什么更冷？", "导热系数与体感温度（节选）",
       "温度相同的物体，因导热系数不同，与皮肤接触时的热流速率不同。"
       "金属导热系数远高于木头，会更快带走手部热量，因此感觉更冷。",
       "teach", "轻松解释", 198,
       [("A", "铁栏杆和木扶手明明是同一个温度吧？", 1),
        ("B", "是同一个温度，但金属抢热抢得快。", 1),
        ("A", "所以不是它更冷，是我凉得更快？", 1),
        ("B", "对，感觉冷是因为你的手在快速失温。", 1)]),

    ep(20260927, "手机为什么越用越卡？", "系统性能衰减（节选）",
       "系统长期使用后，后台常驻进程增多、存储碎片化、"
       "以及电池老化带来的性能调度策略变化，都会让响应变慢。",
       "bicker", "抬杠", 265,
       [("A", "手机越用越卡，是不是厂商故意的？", 1),
        ("B", "有一部分是，但更多是软件自己长胖了。", 1),
        ("A", "那恢复出厂设置真有用？", 1),
        ("B", "有用，因为那等于把屋子清空重来一遍。", 1)]),
]

# ---------------- 13 个页面 ----------------
PAGES = [
    ("pages/index/index.vue", "首页", "上传文章 + 选口吻 + Banner + 历史入口"),
    ("pages/daily/daily.vue", "每日一集", "今日大卡 + 往期列表"),
    ("pages/login/login.vue", "登录", "微信一键登录"),
    ("pages/generate/generate.vue", "生成中", "解析与生成进度"),
    ("pages/confirm/confirm.vue", "确认可疑处", "逐条确认/修正（人工确认点）"),
    ("pages/result/result.vue", "播放", "双音色播放 + 逐句高亮 + 出处回溯"),
    ("pages/history/history.vue", "历史记录", "任务列表、续播、重试、删除"),
    ("pages/article/article.vue", "原文", "出处回溯落地页"),
    ("pages/profile/profile.vue", "我的", "用户信息、默认口吻、缓存清理"),
    ("pages/error/error.vue", "提示", "内容不适合转音频 / 语音合成不可用"),
    ("pages/admin/dashboard/index.vue", "管理首页", "统计概览"),
    ("pages/admin/users/index.vue", "用户管理", "列表、搜索、封禁、角色"),
    ("pages/admin/banners/index.vue", "Banner 管理", "增删改、排序、上下架"),
    ("pages/admin/tones/index.vue", "口吻模板", "维护 6 种口吻的 Prompt"),
]

PAGE_TMPL = """<template>
\t<view class="page">
\t\t<view class="card">
\t\t\t<text class="h1">{title}</text>
\t\t\t<text class="sub">{desc}</text>
\t\t</view>
\t\t<view class="card">
\t\t\t<text class="hint">页面骨架，待实现（路由：{route}）</text>
\t\t</view>
\t</view>
</template>

<script>
export default {{
\tdata() {{
\t\treturn {{}}
\t}},
\tonLoad(options) {{
\t\t// TODO: {title}
\t}},
\tmethods: {{}}
}}
</script>

<style>
.page {{ padding: 32rpx; }}
.card {{ background: #ffffff; border-radius: 20rpx; padding: 32rpx; margin-bottom: 24rpx; }}
.h1 {{ font-size: 40rpx; font-weight: 500; color: #2c2c2a; display: block; }}
.sub {{ font-size: 26rpx; color: #5f5e5a; display: block; margin-top: 12rpx; }}
.hint {{ font-size: 26rpx; color: #8a8a85; }}
</style>
"""


def main():
    os.makedirs(DB, exist_ok=True)

    # 1) schemas
    for name, sc in SCHEMAS.items():
        p = os.path.join(DB, f"{name}.schema.json")
        with open(p, "w", encoding="utf-8") as fp:
            json.dump(sc, fp, ensure_ascii=False, indent=2)
        print(f"  schema  {name}.schema.json")

    # 2) db_init.json（种子数据）
    init = {
        "tones": {
            "data": [
                {"_id": f"tone_{c}", "code": c, "name": n, "description": d,
                 "prompt_template": pt, "sample": sm, "enabled": True, "sort": i + 1}
                for i, (c, n, d, pt, sm) in enumerate(TONES_SEED)
            ]
        },
        "banners": {
            "data": [
                {"_id": f"banner_{i + 1}", **b} for i, b in enumerate(BANNERS_SEED)
            ]
        },
        "daily_episodes": {
            "data": DAILY_SEED
        },
    }
    p = os.path.join(DB, "db_init.json")
    with open(p, "w", encoding="utf-8") as fp:
        json.dump(init, fp, ensure_ascii=False, indent=2)
    print(f"  seed    db_init.json（{len(TONES_SEED)} 个口吻 + {len(BANNERS_SEED)} 条 banner）")

    # 3) 页面（★ 只补不存在的占位文件，绝不覆盖已实现的页面）
    for rel, title, desc in PAGES:
        p = os.path.join(ROOT, rel)
        if os.path.exists(p):
            print(f"  skip    {rel}（已存在，不覆盖）")
            continue
        os.makedirs(os.path.dirname(p), exist_ok=True)
        route = "/" + rel.replace(".vue", "")
        with open(p, "w", encoding="utf-8") as fp:
            fp.write(PAGE_TMPL.format(title=title, desc=desc, route=route))
        print(f"  page    {rel}")


if __name__ == "__main__":
    main()
