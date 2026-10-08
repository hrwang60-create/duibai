/**
 * 本地单测：核心纯函数（不消耗云函数免费额度）
 *
 * 为什么要本地测：uniCloud 计费按「单个函数 + 小时」评估，某函数某小时只要有消耗就至少折算
 * 约 90 GBs，而免费额度仅 1000 GBs/月（≈11 个函数小时）。所以边界用例一律本地跑，
 * 只有整链路验证才走云端（阶段 A 的 selftest）。
 *
 * 做法：直接从云函数源码里按函数名抽出纯函数文本（大括号配对），拼成可执行代码后测试。
 * 好处是**测的就是线上跑的那份源码**，不存在"测试副本和实现不一致"。
 *
 * 运行： node 本地单测.mjs
 */

import fs from 'node:fs'

const BASE = 'C:/Users/MI/Desktop/个人软件选题与需求分析2/期末作品/duibai-app/uniCloud-aliyun/cloudfunctions'

/* ---------------- 源码抽取 ---------------- */

/** 按函数名抽取完整函数文本（大括号配对，能正确处理嵌套） */
function extractFn (src, name) {
	const m = new RegExp('function\\s+' + name + '\\s*\\(').exec(src)
	if (!m) return null
	const start = src.indexOf('{', m.index)
	let depth = 0
	for (let j = start; j < src.length; j++) {
		if (src[j] === '{') depth++
		else if (src[j] === '}') {
			depth--
			if (depth === 0) return src.slice(m.index, j + 1)
		}
	}
	return null
}

/** 抽取单行 const 声明（如正则常量） */
function extractConst (src, name) {
	const m = new RegExp('const\\s+' + name + '\\s*=\\s*[^\\n]+').exec(src)
	return m ? m[0] : null
}

function loadPure (file, fns, consts = []) {
	const src = fs.readFileSync(file, 'utf8')
	const parts = []
	for (const c of consts) {
		const t = extractConst(src, c)
		if (!t) throw new Error(`抽不到常量 ${c}（源文件 ${file}）`)
		parts.push(t)
	}
	for (const f of fns) {
		const t = extractFn(src, f)
		if (!t) throw new Error(`抽不到函数 ${f}（源文件 ${file}）`)
		parts.push(t)
	}
	const body = parts.join('\n\n') + '\n\nreturn { ' + [...consts, ...fns].join(', ') + ' }'
	return new Function(body)()
}

/* ---------------- 断言 ---------------- */

let pass = 0, fail = 0
const failed = []
function t (name, actual, expected) {
	const ok = JSON.stringify(actual) === JSON.stringify(expected)
	if (ok) { pass++; console.log(`  ✅ ${name}`) } else {
		fail++; failed.push({ name, actual, expected })
		console.log(`  ❌ ${name}\n       期望: ${JSON.stringify(expected)}\n       实际: ${JSON.stringify(actual)}`)
	}
}

/* ---------------- 加载被测函数 ---------------- */

const dataMod = loadPure(`${BASE}/data/index.js`, ['splitParagraphs'])
const genMod = loadPure(`${BASE}/generate-dialogue/index.js`, ['unsuitableRatio', 'validate'], ['ILLEGAL'])

console.log('\n=== 1. splitParagraphs（段落切分）===')
const sp = dataMod.splitParagraphs
t('空字符串 → 无段落', sp(''), [])
t('纯空白 → 无段落', sp('   \n\n  \t '), [])
t('空行分隔 4 段 → 4 条', sp('一。\n\n二。\n\n三。\n\n四。').length, 4)
t('段落首尾空白被 trim', sp('  abc  \n\n  def  '), ['abc', 'def'])
{
	const long = '这是第一句话。这是第二句话。这是第三句话。这是第四句话。这是第五句话。'
		.repeat(6) // 约 180 字，超过单段上限的一半
	const out = sp(long)
	void out
	t('超长单段落被切开（>1 段）', out.length > 1, true)
	t('切开后每段都不超过 200 字', out.every(x => x.length <= 210), true)
}
t('多个连续空行只算一次分隔', sp('甲\n\n\n\n乙').length, 2)
t('单行无空行 → 1 段', sp('只有一段话。').length, 1)

console.log('\n=== 2. unsuitableRatio（内容形态判断）===')
const ur = genMod.unsuitableRatio
t('纯文字 → 占比 0', ur('这是一段普通的中文文字，没有任何表格或公式符号'), 0)
t('全是竖线 → 占比 1', ur('||||||||||'), 1)
t('全是公式符号 → 占比 1', ur('∑∫√≈≤'), 1)
t('空字符串 → 不报错（按 1 字计）', typeof ur(''), 'number')
{
	const mixed = '文字文字|文字文字|文字文字|文字'
	t('混合内容占比介于 0 和 1 之间', ur(mixed) > 0 && ur(mixed) < 1, true)
	t('表格为主时占比 > 0.3（应触发 422）', ur('|||文字|') > 0.3, true)
	t('表格为主时的具体占比', ur('|||文字|').toFixed(3), '0.667')
}

console.log('\n=== 3. validate（三项程序化校验）===')
const v = genMod.validate
t('非法 JSON → 不通过', v('这不是 JSON', 5).ok, false)
t('合法 JSON 但缺 lines → 不通过', v('{"a":1}', 5).ok, false)
t('lines 为空数组 → 不通过', v('{"lines":[]}', 5).ok, false)
t('全部台词为空 → 不通过', v('{"lines":[{"text":""},{"text":"  "}]}', 5).ok, false)
{
	const r = v(JSON.stringify({ lines: [
		{ speaker: 'A', text: '正常一句', source_paragraph: 1 },
		{ speaker: 'B', text: '正常二句', source_paragraph: 2 }
	] }), 5)
	t('两条正常台词 → 通过', r.ok, true)
	t('正常台词 flag 为空', r.lines.map(l => l.flag), ['', ''])
	t('句序从 1 连续', r.lines.map(l => l.seq), [1, 2])
}
{
	const r = v(JSON.stringify({ lines: [
		{ speaker: 'A', text: '越界出处', source_paragraph: 999 },
		{ speaker: 'B', text: '负出处', source_paragraph: -3 },
		{ speaker: 'C', text: '非法说话人', source_paragraph: 3 }
	] }), 5)
	t('越界出处 → 归零', r.lines[0].source_paragraph, 0)
	t('越界出处 → flag=no_source', r.lines[0].flag, 'no_source')
	t('负出处 → 归零', r.lines[1].source_paragraph, 0)
	t('非 A/B 说话人 → 归为 A', r.lines[2].speaker, 'A')
}
{
	const r = v(JSON.stringify({ lines: [
		{ speaker: 'A', text: '这里（有括号）残留', source_paragraph: 1 },
		{ speaker: 'B', text: '这里**有加粗**残留', source_paragraph: 1 }
	] }), 5)
	t('含括号台词 → flag=term', r.lines[0].flag, 'term')
	t('括号被清除', /[（）()]/.test(r.lines[0].text), false)
	t('加粗符号被清除', /\*\*/.test(r.lines[1].text), false)
	t('加粗台词也标 term', r.lines[1].flag, 'term')
}
{
	const r = v(JSON.stringify({ lines: [
		{ speaker: 'A', text: '空 text 之前的', source_paragraph: 1 },
		{ speaker: 'B', text: '', source_paragraph: 1 },
		{ speaker: 'A', text: '空 text 之后的', source_paragraph: 2 }
	] }), 5)
	t('空 text 条目被跳过', r.lines.length, 2)
	t('跳过后句序仍连续', r.lines.map(l => l.seq), [1, 2])
}

/* ---------------- 汇总 ---------------- */

console.log('\n' + '='.repeat(52))
console.log(`本地单测结果：通过 ${pass} / 共 ${pass + fail}`)
if (fail) {
	console.log('失败项：')
	failed.forEach(f => console.log('  -', f.name, '| 期望', JSON.stringify(f.expected), '| 实际', JSON.stringify(f.actual)))
	process.exitCode = 1
} else {
	console.log('全部通过 ✅')
}
