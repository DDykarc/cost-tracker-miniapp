/**
 * 极简测试运行器（零依赖，Node 直接跑）
 * 用法：node test/run.js
 */
const assert = require('assert')

let passed = 0
let failed = 0
const failures = []

function test(name, fn) {
  try {
    fn()
    passed++
    console.log('  \u2713 ' + name)
  } catch (err) {
    failed++
    failures.push({ name, message: err.message })
    console.log('  \u2717 ' + name)
    console.log('      ' + err.message)
  }
}

function group(title) {
  console.log('\n' + title)
}

function summary() {
  console.log('\n' + '-'.repeat(50))
  console.log(`通过 ${passed} 项，失败 ${failed} 项`)
  if (failed > 0) {
    console.log('\n失败明细：')
    failures.forEach(f => console.log(`  - ${f.name}: ${f.message}`))
    process.exitCode = 1
  }
}

module.exports = { test, group, summary, assert }
