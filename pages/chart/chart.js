const { computeItemsUsage } = require('../../utils/calc')
const { formatDays } = require('../../utils/format')
const { buildYAxis, computeBarLayout, roundRectPath, fitText } = require('../../utils/chart')
const itemRepo = require('../../utils/itemRepo')

const COLORS = {
  green: '#2E7D32',
  orange: '#E65100',
  red: '#C62828',
  primary: '#00C853',
  grid: '#F0F0F0',
  axis: '#DDD',
  label: '#999',
  text: '#333',
  white: '#FFFFFF'
}

/** 全部对比模式下每一行的高度（px） */
const ROW_HEIGHT = 46
/** 画布最小高度（px） */
const MIN_CHART_HEIGHT = 250

Page({
  data: {
    isAllMode: false,
    item: {},
    allItems: [],
    allTotal: '0',
    allHighest: '0',
    chartHeightPx: MIN_CHART_HEIGHT,
    loading: true,
    error: null
  },

  onLoad(options) {
    if (options.all === 'true') {
      this.mode = 'all'
      wx.setNavigationBarTitle({ title: '全部物品对比' })
    } else if (options.id) {
      this.mode = 'single'
      this.itemId = options.id
    } else {
      wx.showToast({ title: '参数错误', icon: 'none' })
      wx.navigateBack()
      return
    }
    this.loadData()
  },

  onReady() {
    this.pageReady = true
    this.tryDraw()
  },

  async loadData() {
    this.setData({ loading: true, error: null })
    try {
      if (this.mode === 'all') {
        await this.loadAllMode()
      } else {
        await this.loadSingleMode()
      }
      this.hasData = true
      this.tryDraw()
    } catch (err) {
      this.setData({ loading: false, error: { message: err.message, retryable: err.retryable } })
    }
  },

  async loadAllMode() {
    const raw = await itemRepo.getAllItems()
    if (raw.length === 0) {
      wx.showToast({ title: '还没有物品', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1200)
      return
    }

    const allItems = computeItemsUsage(raw)
      .sort((a, b) => parseFloat(b.dailyCost) - parseFloat(a.dailyCost))

    const total = allItems.reduce((s, i) => s + (parseFloat(i.dailyCost) || 0), 0).toFixed(1)
    // 画布高度跟着条数走：固定高度在物品多时会把柱子挤成负数
    const chartHeightPx = Math.max(MIN_CHART_HEIGHT, allItems.length * ROW_HEIGHT + 60)

    this.setData({
      isAllMode: true,
      allItems,
      allTotal: total,
      allHighest: allItems[0].dailyCost,
      chartHeightPx,
      loading: false
    })
  },

  async loadSingleMode() {
    const raw = await itemRepo.getItem(this.itemId)
    if (!raw) {
      wx.showToast({ title: '物品不存在', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1200)
      return
    }
    const item = computeItemsUsage([raw])[0]
    this.setData({ item, chartHeightPx: MIN_CHART_HEIGHT, loading: false })
  },

  /** 数据就绪 + 页面就绪 之后才绘制 */
  tryDraw() {
    if (!this.pageReady || !this.hasData) return
    this.draw()
  },

  draw() {
    this.initCanvas((ctx, w, h) => {
      if (this.mode === 'all') this.renderAllChart(ctx, w, h)
      else this.renderSingleChart(ctx, w, h)
    })
  },

  /**
   * 取 canvas 节点并处理 dpr。
   * 设置 canvas.width/height 会重置 context 状态，所以 scale 必须放在后面。
   */
  initCanvas(callback, retry = true) {
    wx.createSelectorQuery()
      .select('#costChart')
      .fields({ node: true, size: true })
      .exec(res => {
        const info = res && res[0]
        if (!info || !info.node) {
          // 节点尚未渲染出来，低端机上偶发，重试一次
          if (retry) setTimeout(() => this.initCanvas(callback, false), 200)
          return
        }
        const canvas = info.node
        const ctx = canvas.getContext('2d')
        const dpr = wx.getWindowInfo().pixelRatio
        canvas.width = info.width * dpr
        canvas.height = info.height * dpr
        ctx.scale(dpr, dpr)
        callback(ctx, info.width, info.height)
      })
  },

  // ==================== 全部物品对比（横向条形图） ====================

  renderAllChart(ctx, width, height) {
    const { allItems } = this.data
    const margin = { top: 20, right: 24, bottom: 30, left: 104 }
    const chartW = width - margin.left - margin.right
    const chartH = height - margin.top - margin.bottom
    ctx.clearRect(0, 0, width, height)

    const maxVal = allItems.reduce((m, i) => Math.max(m, parseFloat(i.dailyCost) || 0), 0.1)
    const axis = buildYAxis(maxVal)
    const layout = computeBarLayout(allItems.length, chartH)

    // 纵向网格线 + 底部刻度
    axis.ticks.forEach(v => {
      const px = margin.left + (v / axis.yMax) * chartW
      ctx.strokeStyle = COLORS.grid
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(px, margin.top)
      ctx.lineTo(px, margin.top + chartH)
      ctx.stroke()

      ctx.fillStyle = COLORS.label
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText('¥' + v, px, margin.top + chartH + 6)
    })

    allItems.forEach((item, i) => {
      const rowTop = margin.top + i * layout.rowH
      const y = rowTop + (layout.rowH - layout.barH) / 2
      const value = parseFloat(item.dailyCost) || 0
      const barW = Math.max(3, (value / axis.yMax) * chartW)
      const color = item.costLevel === 'cost-red' ? COLORS.red
        : item.costLevel === 'cost-orange' ? COLORS.orange
          : COLORS.green

      // 物品名（右对齐贴近轴线，超长截断）
      ctx.fillStyle = COLORS.text
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(fitText(ctx, item.name, margin.left - 16), margin.left - 8, y + layout.barH / 2)

      // 条形
      ctx.fillStyle = color
      roundRectPath(ctx, margin.left, y, barW, layout.barH, 4)
      ctx.fill()

      // 数值
      ctx.fillStyle = color
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'middle'
      ctx.fillText(`¥${item.dailyCost}/天`, margin.left + barW + 6, y + layout.barH / 2)
    })
  },

  // ==================== 单个物品（成本下降曲线） ====================

  renderSingleChart(ctx, width, height) {
    const { item } = this.data
    const price = parseFloat(item.price) || 0
    const totalDays = Math.max(1, item.daysUsed)
    const margin = { top: 34, right: 20, bottom: 46, left: 52 }
    const chartW = width - margin.left - margin.right
    const chartH = height - margin.top - margin.bottom
    ctx.clearRect(0, 0, width, height)

    const axis = buildYAxis(price)
    const xTicks = this.calcXTicks(totalDays)
    const xPos = d => margin.left + (d / totalDays) * chartW
    const yPos = c => margin.top + chartH - (c / axis.yMax) * chartH

    // 网格
    ctx.strokeStyle = COLORS.grid
    ctx.lineWidth = 1
    axis.ticks.forEach(v => {
      const py = yPos(v)
      ctx.beginPath()
      ctx.moveTo(margin.left, py)
      ctx.lineTo(width - margin.right, py)
      ctx.stroke()
    })
    xTicks.forEach(d => {
      const px = xPos(d)
      ctx.beginPath()
      ctx.moveTo(px, margin.top)
      ctx.lineTo(px, height - margin.bottom)
      ctx.stroke()
    })

    // 坐标轴
    ctx.strokeStyle = COLORS.axis
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(margin.left, margin.top)
    ctx.lineTo(margin.left, height - margin.bottom)
    ctx.lineTo(width - margin.right, height - margin.bottom)
    ctx.stroke()

    // 轴标签
    ctx.fillStyle = COLORS.label
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    axis.ticks.forEach(v => ctx.fillText('¥' + v, margin.left - 8, yPos(v)))

    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    xTicks.forEach(d => {
      ctx.fillText(d >= 365 ? formatDays(d) : `第${d}天`, xPos(d), height - margin.bottom + 8)
    })

    // 曲线采样点
    const points = []
    const step = Math.max(1, Math.floor(totalDays / 200))
    for (let d = 1; d <= totalDays; d += step) {
      points.push({ x: xPos(d), y: yPos(price / d) })
    }
    if (points.length === 0 || points[points.length - 1].x < xPos(totalDays)) {
      points.push({ x: xPos(totalDays), y: yPos(price / totalDays) })
    }

    // 面积
    if (points.length > 1) {
      const grad = ctx.createLinearGradient(0, margin.top, 0, height - margin.bottom)
      grad.addColorStop(0, 'rgba(0, 200, 83, 0.15)')
      grad.addColorStop(1, 'rgba(0, 200, 83, 0.01)')
      ctx.beginPath()
      ctx.moveTo(points[0].x, height - margin.bottom)
      points.forEach(p => ctx.lineTo(p.x, p.y))
      ctx.lineTo(points[points.length - 1].x, height - margin.bottom)
      ctx.closePath()
      ctx.fillStyle = grad
      ctx.fill()
    }

    // 曲线：用标准的二次贝塞尔平滑写法，
    // 原实现的循环终点是「最后两个点的中点」，曲线永远连不到今天这个点。
    if (points.length > 1) {
      ctx.strokeStyle = COLORS.primary
      ctx.lineWidth = 3
      ctx.lineJoin = 'round'
      ctx.beginPath()
      ctx.moveTo(points[0].x, points[0].y)
      for (let i = 1; i < points.length - 1; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2
        const yc = (points[i].y + points[i + 1].y) / 2
        ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc)
      }
      const tail = points[points.length - 1]
      ctx.lineTo(tail.x, tail.y)
      ctx.stroke()
    }

    // 采样点
    const dotStep = Math.max(1, Math.floor(points.length / 8))
    for (let i = 0; i < points.length; i += dotStep) {
      ctx.beginPath()
      ctx.arc(points[i].x, points[i].y, 4, 0, Math.PI * 2)
      ctx.fillStyle = COLORS.white
      ctx.fill()
      ctx.strokeStyle = COLORS.primary
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // 今天这个点
    const last = points[points.length - 1]
    ctx.beginPath()
    ctx.arc(last.x, last.y, 7, 0, Math.PI * 2)
    ctx.fillStyle = COLORS.primary
    ctx.fill()
    ctx.strokeStyle = COLORS.white
    ctx.lineWidth = 3
    ctx.stroke()

    // 今天标签：贴近右边界时改为右对齐，否则文字会被画布裁掉
    ctx.fillStyle = COLORS.primary
    ctx.font = 'bold 12px sans-serif'
    ctx.textBaseline = 'bottom'
    const todayText = `今天 ¥${(price / totalDays).toFixed(1)}/天`
    const labelY = Math.max(margin.top + 12, last.y - 14)
    if (last.x > width - margin.right - 80) {
      ctx.textAlign = 'right'
      ctx.fillText(todayText, last.x, labelY)
    } else {
      ctx.textAlign = 'center'
      ctx.fillText(todayText, last.x, labelY)
    }

    // 起点标签：左对齐画在点的右上方，避免和 Y 轴刻度重叠
    const first = points[0]
    ctx.fillStyle = COLORS.label
    ctx.font = '11px sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText(`第1天 ¥${price}`, first.x + 6, Math.max(margin.top + 10, first.y - 6))
  },

  /** X 轴刻度：按总天数选择疏密 */
  calcXTicks(totalDays) {
    if (totalDays <= 1) return [1]
    if (totalDays <= 7) return Array.from({ length: totalDays }, (_, i) => i + 1)
    if (totalDays <= 30) return [1, 7, 14, 21, totalDays].filter((d, i, arr) => arr.indexOf(d) === i && d <= totalDays)

    const ticks = [1, 7, 30]
    if (totalDays > 90) ticks.push(90)
    if (totalDays > 180) ticks.push(180)
    if (totalDays > 365) ticks.push(365)
    ticks.push(totalDays)
    return ticks.filter((d, i, arr) => arr.indexOf(d) === i)
  }
})
