/**
 * 极简测试运行器（零依赖，Node 直接跑）
 * 用法：node test/calc.test.js
 *
 * 支持同步与 async 测试函数。所有用例串行执行，
 * 保证输出顺序与源码顺序一致。
 */
const assert = require('assert')

let passed = 0
let failed = 0
const failures = []
let chain = Promise.resolve()

/**
 * 注册一个测试用例
 * @param {string} name
 * @param {Function} fn 同步函数或返回 Promise 的函数
 */
function test(name, fn) {
  chain = chain
    .then(() => fn())
    .then(
      () => {
        passed++
        console.log('  \u2713 ' + name)
      },
      (err) => {
        failed++
        failures.push({ name, message: (err && err.message) || String(err) })
        console.log('  \u2717 ' + name)
        console.log('      ' + ((err && err.message) || String(err)))
      }
    )
}

/** 打印分组标题 */
function group(title) {
  chain = chain.then(() => {
    console.log('\n' + title)
  })
}

/** 打印汇总（在最后一个用例结束后执行） */
function summary() {
  chain.then(() => {
    console.log('\n' + '-'.repeat(50))
    console.log(`通过 ${passed} 项，失败 ${failed} 项`)
    if (failed > 0) {
      console.log('\n失败明细：')
      failures.forEach(f => console.log(`  - ${f.name}: ${f.message}`))
      process.exitCode = 1
    }
  })
}

module.exports = { test, group, summary, assert }
