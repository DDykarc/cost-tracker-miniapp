/**
 * 业务计算单测
 * 运行：node test/calc.test.js
 */
const { test, group, summary, assert } = require('./runner')
const calc = require('../utils/calc')

// 固定「当前时间」，避免测试结果随运行时间漂移
const NOW = new Date(2026, 0, 10, 12, 0, 0).getTime()

group('computeItemUsage —— 已用天数与日均成本')

test('当天购买：记为第 1 天，日均等于原价', () => {
  const r = calc.computeItemUsage({ price: 100, buyDate: '2026-01-10' }, NOW)
  assert.strictEqual(r.daysUsed, 1)
  assert.strictEqual(r.dailyCost, '100.0')
})

test('10 天前购买：记为第 11 天', () => {
  const r = calc.computeItemUsage({ price: 100, buyDate: '2025-12-31' }, NOW)
  assert.strictEqual(r.daysUsed, 11)
  assert.strictEqual(r.dailyCost, '9.1')
})

test('100 天前购买：日均降到 1.0', () => {
  const r = calc.computeItemUsage({ price: 100, buyDate: '2025-10-02' }, NOW)
  assert.strictEqual(r.daysUsed, 101)
  assert.strictEqual(r.dailyCost, '1.0')
})

test('购买日期在未来（异常数据）不会出现 0 天或负数', () => {
  const r = calc.computeItemUsage({ price: 100, buyDate: '2026-06-01' }, NOW)
  assert.ok(r.daysUsed >= 1, '天数必须 >= 1，实际 ' + r.daysUsed)
  assert.ok(parseFloat(r.dailyCost) > 0, '日均必须为正数')
  assert.ok(isFinite(parseFloat(r.dailyCost)), '日均不能是 Infinity')
})

group('costLevel —— 成本等级配色')

test('30 天内且日均 >= 10 判为红色', () => {
  assert.strictEqual(calc.costLevelOf(10, 20), 'cost-red')
})

test('超过 30 天即使日均高也不算红色', () => {
  assert.strictEqual(calc.costLevelOf(31, 20), 'cost-orange')
})

test('日均 < 5 判为绿色', () => {
  assert.strictEqual(calc.costLevelOf(200, 2), 'cost-green')
})

test('等级判断与显示值一致（显示 10.0 就应是红色）', () => {
  // 9.96 会显示成 "10.0"，此时应判为红色，避免「显示 ¥10.0 却是绿色」
  const r = calc.computeItemUsage({ price: 9.96, buyDate: '2026-01-10' }, NOW)
  assert.strictEqual(r.dailyCost, '10.0')
  assert.strictEqual(r.costLevel, 'cost-red')
})

group('calcBMI / getBMICategory')

test('BMI 计算保留一位小数', () => {
  assert.strictEqual(calc.calcBMI(70, 175), 22.9)
})

test('缺少身高或体重时返回 null', () => {
  assert.strictEqual(calc.calcBMI(70, 0), null)
  assert.strictEqual(calc.calcBMI(0, 175), null)
  assert.strictEqual(calc.calcBMI(null, null), null)
})

test('BMI 分类覆盖四档边界', () => {
  assert.strictEqual(calc.getBMICategory(17), '偏瘦')
  assert.strictEqual(calc.getBMICategory(18.5), '正常')
  assert.strictEqual(calc.getBMICategory(23.9), '正常')
  assert.strictEqual(calc.getBMICategory(24), '偏胖')
  assert.strictEqual(calc.getBMICategory(28), '肥胖')
})

test('BMI 为空时分类返回空字符串', () => {
  assert.strictEqual(calc.getBMICategory(null), '')
  assert.strictEqual(calc.getBMICategory(NaN), '')
})

group('getStatus —— 健康指标状态判定')

test('血糖按测量时机取参考范围', () => {
  assert.strictEqual(calc.getStatus('blood_sugar', 5.5, { timing: '空腹' }), 'normal')
  assert.strictEqual(calc.getStatus('blood_sugar', 7.0, { timing: '空腹' }), 'high')
  assert.strictEqual(calc.getStatus('blood_sugar', 3.0, { timing: '空腹' }), 'low')
})

test('血糖未指定时机时默认按空腹判定', () => {
  assert.strictEqual(calc.getStatus('blood_sugar', 5.5), 'normal')
})

test('尿酸按性别取参考范围', () => {
  assert.strictEqual(calc.getStatus('uric_acid', 300, { gender: 'male' }), 'normal')
  assert.strictEqual(calc.getStatus('uric_acid', 400, { gender: 'male' }), 'normal')
  assert.strictEqual(calc.getStatus('uric_acid', 400, { gender: 'female' }), 'high')
  assert.strictEqual(calc.getStatus('uric_acid', 100, { gender: 'female' }), 'low')
})

test('未知测量时机返回 unknown 而不是崩溃', () => {
  assert.strictEqual(calc.getStatus('blood_sugar', 5.5, { timing: '不存在的时机' }), 'unknown')
})

test('体重没有参考范围，恒为 unknown', () => {
  assert.strictEqual(calc.getStatus('weight', 70), 'unknown')
})

test('getRefRange 对未知类型返回 null', () => {
  assert.strictEqual(calc.getRefRange('unknown_type'), null)
})

group('calcStats —— 统计')

test('空数组返回全 null 且 count 为 0', () => {
  const s = calc.calcStats([])
  assert.strictEqual(s.max, null)
  assert.strictEqual(s.min, null)
  assert.strictEqual(s.avg, null)
  assert.strictEqual(s.latest, null)
  assert.strictEqual(s.count, 0)
})

test('最大值 / 最小值 / 平均值', () => {
  const s = calc.calcStats([
    { value: 5, recordTime: 1000 },
    { value: 7, recordTime: 3000 },
    { value: 6, recordTime: 2000 }
  ])
  assert.strictEqual(s.max, 7)
  assert.strictEqual(s.min, 5)
  assert.strictEqual(s.avg, 6)
  assert.strictEqual(s.count, 3)
})

test('latest 取 recordTime 最大的那条，而不是数组最后一条', () => {
  const s = calc.calcStats([
    { value: 5, recordTime: 3000 },
    { value: 9, recordTime: 1000 }
  ])
  assert.strictEqual(s.latest, 5)
  assert.strictEqual(s.latestTime, 3000)
})

test('平均值保留两位小数', () => {
  const s = calc.calcStats([
    { value: 1, recordTime: 1 },
    { value: 1, recordTime: 2 },
    { value: 1, recordTime: 3 },
    { value: 2, recordTime: 4 }
  ])
  assert.strictEqual(s.avg, 1.25)
})

group('排序辅助')

test('sortByTimeDesc 不修改原数组', () => {
  const src = [{ value: 1, recordTime: 1 }, { value: 2, recordTime: 2 }]
  const out = calc.sortByTimeDesc(src)
  assert.strictEqual(src[0].recordTime, 1, '原数组不应被改动')
  assert.strictEqual(out[0].recordTime, 2)
})

test('sortByTimeAsc 升序', () => {
  const out = calc.sortByTimeAsc([{ recordTime: 3 }, { recordTime: 1 }, { recordTime: 2 }])
  assert.deepStrictEqual(out.map(r => r.recordTime), [1, 2, 3])
})

summary()
