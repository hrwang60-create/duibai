/**
 * 领域层 · 核心数据对象定义
 *
 * 对应《实验3》表11「核心数据对象与字段说明」。
 * 本文件不依赖任何框架、数据库或网络，只描述"业务里有什么"。
 */

/** 对话角色。全系统只有两个角色，取值被限定住（实验3 表11 对 DialogueLine 的约束）。 */
export type Speaker = 'A' | 'B'

/**
 * 可疑处标记。空串表示"无疑点"。
 * - term      术语读法不确定
 * - no_source 该句在原文里找不到对应段落
 * - number    数字与原文不一致
 */
export type LineFlag = '' | 'term' | 'no_source' | 'number'

/** 对谈稿件状态。text_only 是"语音合成不可用"时的降级态（实验3 表13 / AC5）。 */
export type ScriptStatus = 'generated' | 'confirmed' | 'audio_ready' | 'text_only'

export interface Article {
  id: number
  title: string
  content: string
  char_count: number
  created_at: string
}

export interface Paragraph {
  id: number
  article_id: number
  /** 段号，在一篇文章内唯一且连续 —— 出处回溯的基础（实验3 图4） */
  seq: number
  text: string
}

export interface DialogueScript {
  id: number
  article_id: number
  tone_code: string
  status: ScriptStatus
  line_count: number
  /** 待确认项数量。>0 时拒绝合成音频（实验3 表13 的 409） */
  pending_confirm: number
  created_at: string
}

export interface DialogueLine {
  id: number
  script_id: number
  seq: number
  speaker: Speaker
  text: string
  /** 指向原文段落号；0 表示"无原文依据"。校验会把越界值归零（实验3 表11 约束） */
  source_paragraph: number
  flag: LineFlag
  /** 用户是否已确认该可疑处 */
  confirmed: boolean
}

/**
 * 口吻。6 条预置（实验3 表11：code 为主键）。
 * prompt_template 是给大模型的口吻提示词 —— 它直接决定生成质量。
 */
export interface Tone {
  code: string
  name: string
  description: string
  prompt_template: string
}

export interface AudioSegment {
  id: number
  line_id: number
  speaker: Speaker
  file_path: string
  duration: number
}

/** 运行日志条目。日志是定位问题的唯一凭据（实验4 §2.5 要求说明日志位置与内容）。 */
export interface LogEntry {
  id: number
  level: 'info' | 'warn' | 'error'
  scope: string
  message: string
  detail: string
  created_at: string
}
