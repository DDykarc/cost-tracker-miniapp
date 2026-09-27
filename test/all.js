/**
 * 全量校验：语法 + 单测 + WXML 结构
 * 用法：node test/all.js
 */
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
let failed = 0

function run(title, args) {
  process.stdout.write(`\n=== ${title} ===\n`)
  try {
    const out = execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' })
    const tail = out.trim().split('\n').slice(-3).join('\n')
    console.log(tail)
  } catch (err) {
    failed++
    console.log((err.stdout || '') + (err.stderr || ''))
    console.log(`!! ${title} 失败`)
  }
}

// 1) 所有 JS 文件语法检查
const jsFiles = []
function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (['node_modules', '.git', 'miniprogram_npm'].includes(name)) continue
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) walk(full)
    else if (name.endsWith('.js')) jsFiles.push(full)
  }
}
walk(ROOT)

process.stdout.write(`=== 语法检查（${jsFiles.length} 个文件） ===\n`)
let syntaxErrors = 0
for (const f of jsFiles) {
  try {
    execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' })
  } catch (err) {
    syntaxErrors++
    console.log(`!! 语法错误: ${path.relative(ROOT, f)}`)
    console.log(String(err.stderr || '').split('\n').slice(0, 4).join('\n'))
  }
}
if (syntaxErrors === 0) console.log('全部通过')
else failed++

// 2) 单测
run('业务计算', ['test/calc.test.js'])
run('格式化', ['test/format.test.js'])
run('图表坐标', ['test/chart.test.js'])
run('WXML / 配置结构', ['test/wxml-lint.js'])

console.log('\n' + '='.repeat(50))
console.log(failed === 0 ? '全量校验通过' : `有 ${failed} 项检查失败`)
process.exitCode = failed === 0 ? 0 : 1
