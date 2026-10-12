/**
 * 样例数据初始化脚本（CLI）
 *
 * 用法（在 duibai-web 目录下执行）：
 *   node scripts/seed.mjs            初始化／补齐样例数据（幂等，可重复跑）
 *   node scripts/seed.mjs --reset    先清空业务数据，再重新初始化
 *   node scripts/seed.mjs --clear    只清空业务数据（保留预置口吻字典）
 *   node scripts/seed.mjs --status   只打印各表记录数
 *
 * 对应实验4 §2.2 的要求："提供一组可重复使用的样例数据，并说明如何初始化、清空或恢复"。
 * 它保证任何人 clone 之后都能**一条命令**得到一个可演示的数据库。
 */

import { ALL_TABLES, clearBusiness, counts, DB_FILE, openDb, seedAll } from './seed-core.mjs'

const argv = process.argv.slice(2)
const has = (f) => argv.includes(f)

const db = openDb()
console.log('数据库文件：' + DB_FILE)

const show = () => {
  console.log('当前各表记录数：')
  const c = counts(db)
  for (const t of ALL_TABLES) console.log(`  ${t.padEnd(18)} ${c[t]}`)
}

if (has('--clear') || has('--reset')) {
  clearBusiness(db)
  console.log('已清空全部业务数据（口吻字典保留 —— 它是预置配置，不是用户数据）')
}

if (!has('--clear') && !has('--status')) {
  const r = seedAll(db)
  console.log(`口吻：写入 ${r.tones} 条`)
  for (const a of r.articles) {
    console.log(`样例文章：${a.label} → 文章 #${a.id}，${a.paragraphs} 段${a.created ? '' : '（已存在，跳过）'}`)
  }
}

show()
db.close()
