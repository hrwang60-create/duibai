/**
 * AI 能力层 · Prompt 模板（对话稿生成链路）
 *
 * 实验5 §2.2 要求"编写可重复使用的 Prompt 模板，**区分任务要求和用户问题**"。
 * 本文件把两者彻底分开：
 *   - system：任务要求（角色、输出结构、硬约束）—— 与具体文章无关，可复用；
 *   - user  ：本次的具体输入（口吻、标题、原文段落）。
 * 这样换一篇文章时只改 user 部分，system 一行都不用动，也不会因为
 * 编辑 user 段而不小心改坏了约束。
 *
 * 与小程序侧 `generate-dialogue` 云函数里的 Prompt 相比，本次有三处收紧
 * （原版本是把所有要求塞进一段 system 里）：
 *   1. 口吻要求**从 system 移入 user** —— 口吻是每次调用的变量，不该进常量段；
 *   2. 明确"术语读法不确定时也要照常输出，由程序打标记" —— 原版本只说不确定要标记，
 *      模型会因此省略整句，导致内容缺失；
 *   3. 明确"source_paragraph 必须是给定段落号之一" —— 原版本只说"填该段号"，
 *      实测模型会编造不存在的段号（实验5 §2.1 的边界用例）。
 */

/** 与具体调用无关的常量约束 —— 可复用，换文章不用改 */
export const DIALOGUE_SYSTEM_PROMPT = [
  '你是一个把书面文章改写成双人口语对话的助手。',
  '',
  '任务要求：',
  '1. 只输出 JSON，不要输出任何解释文字、不要使用 Markdown 代码围栏；',
  '2. JSON 结构固定为 {"lines":[{"speaker":"A","text":"台词","source_paragraph":1}]}；',
  '3. speaker 只能取 "A" 或 "B" 两个值；',
  '4. 每句台词必须出自给定段落，source_paragraph 填该句所依据的段落号，',
  '   且必须是给定段落号之一；确实没有出处的才填 0；',
  '5. 台词必须是口语短句，单句不超过 90 字；不得出现括号、编号、图表引用、Markdown 符号；',
  '6. 不得编造原文没有的事实、数字与结论；',
  '7. 遇到读法不确定的专业术语，**照常输出该句**，不要省略、不要改写术语本身'
].join('\n')

/**
 * 组装对话生成的完整输入。
 * @param {{title:string, tone:{name:string, description?:string, prompt_template?:string},
 *          paragraphs:Array<{seq:number,text:string}>}} input
 */
export function buildDialogueMessages(input) {
  const { title, tone, paragraphs } = input
  const body = paragraphs.map((p) => `P${p.seq}: ${p.text}`).join('\n')
  const seqs = paragraphs.map((p) => p.seq).join('、')

  return [
    { role: 'system', content: DIALOGUE_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        `【口吻要求】${tone.name}：${tone.description || ''}`,
        tone.prompt_template || '',
        '',
        `【文章标题】${title}`,
        `【可用段落号】${seqs}`,
        '',
        '【原文段落】',
        body,
        '',
        '请按上述要求输出 JSON。'
      ].join('\n')
    }
  ]
}

/** 供报告引用：把一次真实调用发出去的完整输入渲染成可读文本（含逐段字符数） */
export function renderMessages(messages) {
  return messages
    .map((m, i) => {
      const label = `#${i + 1} role=${m.role} chars=${m.content.length}`
      return `${label}\n${'-'.repeat(48)}\n${m.content}`
    })
    .join('\n\n')
}
