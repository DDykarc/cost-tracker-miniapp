/**
 * 图表坐标计算单测
 * 运行：node test/chart.test.js
 *
 * 这些函数是「柱子高度为负」「曲线连不到终点」「标签出界」这类
 * 图表 bug 的根源，用单测覆盖比肉眼看图快得多。
 */
const { test, group, summary, assert } = require('./runner')
const chart = require('../utils/chart')

group('buildYAxis —— Y 轴上限与刻度')

test('全零数据不会算出 0 高度轴', () => {
  const a = chart.buildYAxis(0)
  assert.strictEqual(a.yMax, 5)
  assert.deepStrictEqual(a.ticks, [0, 5])
})

test('小于 5 的值向上取到 5', () => {
  assert.strictEqual(chart.buildYAxis(3).yMax, 5)
})

test('小数向上取整到 5 的倍数', () => {
  const a = chart.buildYAxis(12)
  assert.strictEqual(a.yMax, 15)
  assert.deepStrictEqual(a.ticks, [0, 5, 10, 15])
})

test('中等数值用 10 的步长', () => {
  const a = chart.buildYAxis(37)
  assert.strictEqual(a.yMax, 40)
  assert.deepStrictEqual(a.ticks, [0, 10, 20, 30, 40])
})

test('大数值刻度数量保持在合理范围（不超过 8 个）', () => {
  const a = chart.buildYAxis(1000)
  assert.strictEqual(a.yMax, 1000)
  assert.ok(a.ticks.length <= 8, '刻度太多会让坐标轴糊成一片，实际 ' + a.ticks.length + ' 个')
  assert.strictEqual(a.ticks[0], 0)
  assert.strictEqual(a.ticks[a.ticks.length - 1], 1000)
})

test('刻度始终覆盖到上限（最后一条网格线不缺失）', () => {
  ;[0, 1, 7, 12, 37, 63, 100, 137, 999].forEach(v => {
    const a = chart.buildYAxis(v)
    assert.strictEqual(
      a.ticks[a.ticks.length - 1],
      a.yMax,
      `maxValue=${v} 时最后刻度 ${a.ticks[a.ticks.length - 1]} 未覆盖 yMax ${a.yMax}`
    )
  })
})

test('负数或非法输入被兜底为 0', () => {
  assert.strictEqual(chart.buildYAxis(-5).yMax, 5)
  assert.strictEqual(chart.buildYAxis(NaN).yMax, 5)
  assert.strictEqual(chart.buildYAxis(undefined).yMax, 5)
})

group('computeBarLayout —— 条形行高')

test('条数少时柱高不超过上限', () => {
  const l = chart.computeBarLayout(2, 200)
  assert.ok(l.barH <= 28)
})

test('条数极多时柱高也不会变成 0 或负数（原实现会算成负数）', () => {
  const l = chart.computeBarLayout(200, 100)
  assert.ok(l.barH > 0, '柱高必须为正，实际 ' + l.barH)
  assert.ok(l.barH >= 4, '柱高不应小于 4px，否则看不见')
  assert.ok(l.rowH > 0)
})

test('画布高度随条数增长时，行高稳定', () => {
  const count = 30
  const chartHeight = count * 46 + 60
  const l = chart.computeBarLayout(count, chartHeight)
  assert.ok(l.rowH > 40, '行高应接近设定的 46px，实际 ' + l.rowH)
  assert.ok(l.barH > 20 && l.barH <= 28)
})

test('条数为 0 时不会除零', () => {
  const l = chart.computeBarLayout(0, 200)
  assert.ok(isFinite(l.rowH) && l.rowH > 0)
  assert.ok(isFinite(l.barH))
})

group('fitText —— 文字截断')

const fakeCtx = {
  measureText(s) {
    return { width: s.length * 10 }
  }
}

test('放得下就原样返回', () => {
  assert.strictEqual(chart.fitText(fakeCtx, 'abcdef', 100), 'abcdef')
})

test('放不下时截断并加省略号，且不超过给定宽度', () => {
  const out = chart.fitText(fakeCtx, 'abcdefghij', 50)
  assert.ok(out.endsWith('…'))
  assert.ok(fakeCtx.measureText(out).width <= 50, '截断后仍超宽：' + out)
})

test('宽度为 0 或空文本时返回空字符串', () => {
  assert.strictEqual(chart.fitText(fakeCtx, 'abc', 0), '')
  assert.strictEqual(chart.fitText(fakeCtx, '', 100), '')
  assert.strictEqual(chart.fitText(fakeCtx, null, 100), '')
})

group('roundRectPath —— 圆角矩形路径')

function makeRecorder() {
  const calls = []
  return {
    calls,
    ctx: {
      beginPath: () => calls.push('beginPath'),
      closePath: () => calls.push('closePath'),
      moveTo: (x, y) => calls.push(['moveTo', x, y]),
      lineTo: (x, y) => calls.push(['lineTo', x, y]),
      quadraticCurveTo: (a, b, c, d) => calls.push(['quad', a, b, c, d])
    }
  }
}

test('路径以 beginPath 开始、closePath 结束', () => {
  const r = makeRecorder()
  chart.roundRectPath(r.ctx, 0, 0, 100, 20, 4)
  assert.strictEqual(r.calls[0], 'beginPath')
  assert.strictEqual(r.calls[r.calls.length - 1], 'closePath')
})

test('半径被限制在高度的一半以内（不会画出畸形圆角）', () => {
  const r = makeRecorder()
  chart.roundRectPath(r.ctx, 0, 0, 100, 10, 999)
  const firstMove = r.calls.find(c => Array.isArray(c) && c[0] === 'moveTo')
  assert.deepStrictEqual(firstMove, ['moveTo', 5, 0], '半径应被夹到 height/2 = 5')
})

test('宽度为 0 时不抛异常', () => {
  const r = makeRecorder()
  chart.roundRectPath(r.ctx, 0, 0, 0, 20, 4)
  assert.strictEqual(r.calls[r.calls.length - 1], 'closePath')
})

summary()
