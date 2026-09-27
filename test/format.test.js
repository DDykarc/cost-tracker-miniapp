/**
 * 格式化工具单测
 * 运行：node test/format.test.js
 */
const { test, group, summary, assert } = require('./runner')
const fmt = require('../utils/format')

group('parseDateTime —— 日期解析')

test('解析出本地时间戳（这是 iOS 上最容易出问题的地方）', () => {
  const ts = fmt.parseDateTime('2026-01-10', '08:30')
  assert.strictEqual(ts, new Date(2026, 0, 10, 8, 30, 0, 0).getTime())
})

test('个位数月份和小时也能正确解析', () => {
  const ts = fmt.parseDateTime('2026-03-05', '09:05')
  assert.strictEqual(ts, new Date(2026, 2, 5, 9, 5, 0, 0).getTime())
})

test('与 new Date(字符串) 相比不会受时区字符串解析影响', () => {
  const ts = fmt.parseDateTime('2026-01-10', '00:00')
  const d = new Date(ts)
  assert.strictEqual(d.getFullYear(), 2026)
  assert.strictEqual(d.getMonth(), 0)
  assert.strictEqual(d.getDate(), 10)
  assert.strictEqual(d.getHours(), 0)
})

group('formatDate / formatTime')

test('formatDate 补零', () => {
  assert.strictEqual(fmt.formatDate(new Date(2026, 0, 5)), '2026-01-05')
})

test('formatTime 补零', () => {
  assert.strictEqual(fmt.formatTime(new Date(2026, 0, 5, 9, 5)), '09:05')
})

group('formatShortDateTime / formatShortDate')

test('短日期时间格式为 M/D HH:mm', () => {
  assert.strictEqual(fmt.formatShortDateTime(new Date(2026, 0, 5, 9, 5).getTime()), '1/5 09:05')
})

test('短日期格式为 M/D', () => {
  assert.strictEqual(fmt.formatShortDate(new Date(2026, 11, 25).getTime()), '12/25')
})

test('空值返回空字符串', () => {
  assert.strictEqual(fmt.formatShortDateTime(0), '')
  assert.strictEqual(fmt.formatShortDate(undefined), '')
})

group('formatDays')

test('不满一年显示天数', () => {
  assert.strictEqual(fmt.formatDays(100), '100天')
})

test('满一年显示年', () => {
  assert.strictEqual(fmt.formatDays(365), '1.0年')
  assert.strictEqual(fmt.formatDays(730), '2.0年')
})

summary()
