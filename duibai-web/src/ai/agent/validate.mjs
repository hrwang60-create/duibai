/**
 * AI 能力层 · 工具参数校验（§2.2 "参数约束由程序检查"）
 *
 * 只用 JSON Schema 的一个**受控子集**：object / integer / number / string / boolean / array，
 * 以及 required、枚举、数值范围、字符串长度与正则、数组长度。
 *
 * 为什么不直接用完整 JSON Schema 校验库：
 *   1. 本项目工具只有 6 个，需要的约束种类就这几样，自己实现 100 行左右就够，
 *      不引入依赖、也不把"校验规则长什么样"藏在库里；
 *   2. 报错信息要**具体到字段**并且能回传给模型（"script_id 必须是 1–999999 的整数，
 *      收到的是字符串 '1'"），现成库的默认报错是英文且面向开发者的，需要大量二次加工。
 *
 * 校验是**严格**的：类型不对就报错，不做静默类型转换。
 * 因为模型把 script_id 写成 "1" 这类情况，恰恰是要让它自己改正的（§2.4 的"错误反馈"）。
 */

const TYPES = new Set(['object', 'integer', 'number', 'string', 'boolean', 'array'])

function typeOf(v) {
  if (Array.isArray(v)) return 'array'
  if (v === null) return 'null'
  if (Number.isInteger(v)) return 'integer'
  return typeof v
}

function checkOne(prop, value, path, errors) {
  const t = prop.type
  if (!TYPES.has(t)) {
    errors.push({ field: path, reason: `工具定义里出现了不支持的校验类型 ${t}` })
    return
  }
  const actual = typeOf(value)

  if (t === 'number' && actual === 'integer') {
    // 整数是数字的子集，允许
  } else if (actual !== t) {
    errors.push({ field: path, reason: `应为 ${t}，实际收到 ${actual}` })
    return
  }

  if (t === 'integer' || t === 'number') {
    if (prop.minimum !== undefined && value < prop.minimum) {
      errors.push({ field: path, reason: `不得小于 ${prop.minimum}，实际 ${value}` })
    }
    if (prop.maximum !== undefined && value > prop.maximum) {
      errors.push({ field: path, reason: `不得大于 ${prop.maximum}，实际 ${value}` })
    }
  }

  if (t === 'string') {
    if (prop.maxLength !== undefined && value.length > prop.maxLength) {
      errors.push({ field: path, reason: `长度不得超过 ${prop.maxLength}，实际 ${value.length}` })
    }
    if (prop.minLength !== undefined && value.length < prop.minLength) {
      errors.push({ field: path, reason: `长度不得小于 ${prop.minLength}，实际 ${value.length}` })
    }
    if (prop.pattern) {
      const re = new RegExp(prop.pattern)
      if (!re.test(value)) {
        errors.push({ field: path, reason: `格式不符（应匹配 ${prop.pattern}），实际 "${value}"` })
      }
    }
  }

  if (prop.enum && !prop.enum.includes(value)) {
    errors.push({ field: path, reason: `只能取 ${prop.enum.map((x) => JSON.stringify(x)).join(' / ')}，实际 ${JSON.stringify(value)}` })
  }

  if (t === 'array') {
    if (prop.minItems !== undefined && value.length < prop.minItems) {
      errors.push({ field: path, reason: `至少 ${prop.minItems} 项，实际 ${value.length} 项` })
    }
    if (prop.maxItems !== undefined && value.length > prop.maxItems) {
      errors.push({ field: path, reason: `最多 ${prop.maxItems} 项，实际 ${value.length} 项` })
    }
    if (prop.items) {
      value.forEach((v, i) => checkOne(prop.items, v, `${path}[${i}]`, errors))
    }
  }
}

/**
 * 按 schema 校验参数。
 * @returns {{ ok: boolean, errors: Array<{field:string, reason:string}> }}
 */
export function validateArgs(schema, args) {
  const errors = []
  if (typeOf(args) !== 'object') {
    return { ok: false, errors: [{ field: '(arguments)', reason: `应为 object，实际收到 ${typeOf(args)}` }] }
  }

  const props = schema.properties || {}
  for (const req of schema.required || []) {
    if (args[req] === undefined || args[req] === null) {
      errors.push({ field: req, reason: '必填字段缺失' })
    }
  }

  for (const [k, v] of Object.entries(args)) {
    if (!props[k]) {
      if (schema.additionalProperties === false) {
        errors.push({ field: k, reason: `不允许的字段（可用字段：${Object.keys(props).join('、') || '无'}）` })
      }
      continue
    }
    checkOne(props[k], v, k, errors)
  }

  // 未传但有默认值的可选项由工具自己处理，这里不介入
  return { ok: errors.length === 0, errors }
}

/** 把校验错误拼成一句能回传给模型的话 */
export function describeErrors(errors) {
  return errors.map((e) => `${e.field}：${e.reason}`).join('；')
}
