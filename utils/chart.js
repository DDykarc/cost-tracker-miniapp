/**
 * 图表坐标计算与绘制辅助
 * ====================================
 * 这里只放纯计算和通用绘制原语，方便在 Node 里直接单测。
 * 之前坐标算错导致的图表 bug（柱子高度为负、曲线连不到终点、标签出界）
 * 都属于这一类，抽出来才能被测试覆盖。
 */

/**
 * 根据最大值算出「好看」的 Y 轴上限与刻度
 * @param {number} maxValue
 * @returns {{yMax:number, ticks:number[]}}
 */
function buildYAxis(maxValue) {
  const safeMax = Math.max(0, Number(maxValue) || 0)
  const yMax = Math.max(5, Math.ceil(safeMax / 5) * 5)

  let step
  if (yMax <= 20) step = 5
  else if (yMax <= 50) step = 10
  else if (yMax <= 100) step = 20
  else step = Math.ceil(yMax / 5 / 10) * 10

  const ticks = []
  for (let v = 0; v <= yMax; v += step) ticks.push(v)
  // 步长不能整除时补上顶部刻度，避免最后一条网格线缺失
  if (ticks[ticks.length - 1] < yMax) ticks.push(yMax)
  return { yMax, ticks }
}

/**
 * 横向条形图的行布局。
 * 注意：每行的实际高度由「画布高度 ÷ 条数」决定，
 * 画布高度必须随条数增长（见页面里的 chartHeightPx），
 * 否则条数一多，barH 会被算成 0 甚至负数。
 *
 * @param {number} count - 条数
 * @param {number} chartHeight - 绘图区高度（px）
 * @returns {{rowH:number, barH:number}}
 */
function computeBarLayout(count, chartHeight) {
  const n = Math.max(1, count)
  const rowH = chartHeight / n
  const barH = Math.max(4, Math.min(28, rowH * 0.6))
  return { rowH, barH }
}

/**
 * 画圆角矩形路径（只建路径，不填充，由调用方决定 fill/stroke）
 */
function roundRectPath(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

/**
 * 把文字截断到指定宽度内（超出部分用省略号），依赖 canvas 的 measureText
 * @param {CanvasRenderingContext2D} ctx
 * @param {string} text
 * @param {number} maxWidth
 * @returns {string}
 */
function fitText(ctx, text, maxWidth) {
  const str = String(text === undefined || text === null ? '' : text)
  if (!str) return ''
  if (maxWidth <= 0) return ''
  if (ctx.measureText(str).width <= maxWidth) return str

  let cut = str
  while (cut.length > 1 && ctx.measureText(cut + '…').width > maxWidth) {
    cut = cut.slice(0, -1)
  }
  return cut + '…'
}

module.exports = {
  buildYAxis,
  computeBarLayout,
  roundRectPath,
  fitText
}
