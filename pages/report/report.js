const { CATEGORIES, CHART_COLORS } = require('../../utils/config')
const { buildYAxis, roundRectPath, fitText } = require('../../utils/chart')
const itemRepo = require('../../utils/itemRepo')

/** 图例每行高度（px） */
const LEGEND_ROW_H = 38
/** 图例列宽（px） */
const LEGEND_W = 150

Page({
  data: {
    mode: 'month', // month | year
    currentYear: 0,
    currentMonth: 0,
    totalSpent: '0',
    itemCount: 0,
    avgPerItem: '0',
    categoryData: [], // { name, icon, amount, percent, color }
    monthTrend: [],   // { label, amount }（仅年报模式）
    topItems: [],     // { name, price, category }
    hasData: false,
    chartHeightPx: 200,
    allItems: [],
    loading: true,
    error: null
  },

  onLoad() {
    const now = new Date()
    this.setData({
      currentYear: now.getFullYear(),
      currentMonth: now.getMonth() + 1
    })
    this.loadAllData()
  },

  async loadAllData() {
    this.setData({ loading: true, error: null })
    try {
      const items = await itemRepo.getAllItems()
      this.setData({ allItems: items, loading: false })
      this.calcReport()
    } catch (err) {
      this.setData({ loading: false, error: { message: err.message, retryable: err.retryable } })
    }
  },

  onSwitchMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode }, () => this.calcReport())
  },

  onPrev() {
    let { currentYear, currentMonth, mode } = this.data
    if (mode === 'month') {
      currentMonth--
      if (currentMonth < 1) {
        currentMonth = 12
        currentYear--
      }
    } else {
      currentYear--
    }
    this.setData({ currentYear, currentMonth }, () => this.calcReport())
  },

  onNext() {
    let { currentYear, currentMonth, mode } = this.data
    const now = new Date()
    if (mode === 'month') {
      currentMonth++
      if (currentMonth > 12) {
        currentMonth = 1
        currentYear++
      }
      if (currentYear > now.getFullYear() ||
        (currentYear === now.getFullYear() && currentMonth > now.getMonth() + 1)) {
        return
      }
    } else {
      currentYear++
      if (currentYear > now.getFullYear()) return
    }
    this.setData({ currentYear, currentMonth }, () => this.calcReport())
  },

  /** 按当前模式与时间段计算报表数据 */
  calcReport() {
    const { allItems, mode, currentYear, currentMonth } = this.data
    if (!allItems.length) {
      this.setData({ hasData: false, categoryData: [], monthTrend: [], topItems: [] })
      return
    }

    const filtered = allItems.filter(item => {
      const d = new Date(item.buyDate)
      if (mode === 'month') {
        return d.getFullYear() === currentYear && (d.getMonth() + 1) === currentMonth
      }
      return d.getFullYear() === currentYear
    })

    if (filtered.length === 0) {
      this.setData({
        hasData: false,
        categoryData: [],
        monthTrend: [],
        topItems: [],
        itemCount: 0,
        totalSpent: '0',
        avgPerItem: '0'
      })
      return
    }

    const total = filtered.reduce((s, i) => s + (parseFloat(i.price) || 0), 0)

    // 按分类汇总
    const catMap = {}
    filtered.forEach(item => {
      const cat = item.category || '其他'
      catMap[cat] = (catMap[cat] || 0) + (parseFloat(item.price) || 0)
    })
    const categoryData = Object.keys(catMap)
      .map((name, idx) => {
        const catInfo = CATEGORIES.find(c => c.name === name)
        const amount = catMap[name]
        return {
          name,
          icon: catInfo ? catInfo.icon : '📦',
          amount: amount.toFixed(0),
          percent: total > 0 ? Math.round((amount / total) * 100) : 0,
          color: CHART_COLORS[idx % CHART_COLORS.length]
        }
      })
      .sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount))

    // 年报模式：逐月趋势
    let monthTrend = []
    if (mode === 'year') {
      for (let m = 1; m <= 12; m++) {
        const monthTotal = allItems
          .filter(item => {
            const d = new Date(item.buyDate)
            return d.getFullYear() === currentYear && (d.getMonth() + 1) === m
          })
          .reduce((s, i) => s + (parseFloat(i.price) || 0), 0)
        monthTrend.push({ label: m + '月', amount: monthTotal.toFixed(0) })
      }
    }

    const topItems = [...filtered]
      .sort((a, b) => (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0))
      .slice(0, 5)
      .map(item => ({
        name: item.name,
        price: (parseFloat(item.price) || 0).toFixed(0),
        category: item.category || '其他'
      }))

    // 画布高度跟着图例条数走，否则分类一多图例就被裁掉
    const chartHeightPx = mode === 'month'
      ? Math.max(200, categoryData.length * LEGEND_ROW_H + 24)
      : 200

    this.setData({
      hasData: true,
      totalSpent: total.toFixed(0),
      itemCount: filtered.length,
      avgPerItem: (total / filtered.length).toFixed(0),
      categoryData,
      monthTrend,
      topItems,
      chartHeightPx
    }, () => this.drawChart())
  },

  drawChart() {
    const { mode, categoryData, monthTrend } = this.data
    if (mode === 'month' && categoryData.length > 0) {
      this.initCanvas((ctx, w, h) => this.drawPieChart(ctx, w, h))
    } else if (mode === 'year' && monthTrend.length > 0) {
      this.initCanvas((ctx, w, h) => this.drawBarChart(ctx, w, h))
    }
  },

  /**
   * 取 canvas 节点并处理 dpr。
   * 节点还没渲染出来时重试一次 —— 原来直接 return，低端机上会出现「有数据但图表空白」。
   */
  initCanvas(callback, retry = true) {
    wx.createSelectorQuery()
      .select('#reportChart')
      .fields({ node: true, size: true })
      .exec(res => {
        const info = res && res[0]
        if (!info || !info.node) {
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

  /** 月报：分类占比环形图 + 右侧图例 */
  drawPieChart(ctx, width, height) {
    const { categoryData, totalSpent } = this.data
    ctx.clearRect(0, 0, width, height)

    const legendX = width - LEGEND_W + 4
    const pieAreaW = width - LEGEND_W
    const cx = pieAreaW / 2
    const cy = height / 2
    const radius = Math.max(30, Math.min(cx - 12, cy - 12, 88))

    const total = categoryData.reduce((s, c) => s + parseFloat(c.amount), 0) || 1

    let startAngle = -Math.PI / 2
    categoryData.forEach(cat => {
      const sliceAngle = (parseFloat(cat.amount) / total) * Math.PI * 2
      ctx.beginPath()
      ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, radius, startAngle, startAngle + sliceAngle)
      ctx.closePath()
      ctx.fillStyle = cat.color
      ctx.fill()
      startAngle += sliceAngle
    })

    // 中心留白，形成环形
    ctx.beginPath()
    ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()

    ctx.fillStyle = '#333'
    ctx.font = 'bold 16px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(`¥${totalSpent}`, cx, cy - 8)
    ctx.fillStyle = '#999'
    ctx.font = '11px sans-serif'
    ctx.fillText('总花费', cx, cy + 12)

    // 图例
    let legendY = 12
    categoryData.forEach(cat => {
      ctx.fillStyle = cat.color
      ctx.fillRect(legendX, legendY + 3, 10, 10)

      ctx.fillStyle = '#333'
      ctx.font = '12px sans-serif'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(fitText(ctx, `${cat.icon} ${cat.name}`, LEGEND_W - 24), legendX + 16, legendY)

      ctx.fillStyle = '#999'
      ctx.font = '11px sans-serif'
      ctx.fillText(`¥${cat.amount} (${cat.percent}%)`, legendX + 16, legendY + 16)

      legendY += LEGEND_ROW_H
    })
  },

  /** 年报：月度柱状图 */
  drawBarChart(ctx, width, height) {
    const { monthTrend } = this.data
    const margin = { top: 24, right: 16, bottom: 34, left: 46 }
    const chartW = width - margin.left - margin.right
    const chartH = height - margin.top - margin.bottom
    ctx.clearRect(0, 0, width, height)

    const maxVal = monthTrend.reduce((m, i) => Math.max(m, parseFloat(i.amount) || 0), 1)
    const axis = buildYAxis(maxVal)

    // 网格线与 Y 轴刻度
    axis.ticks.forEach(v => {
      const py = margin.top + chartH - (v / axis.yMax) * chartH
      ctx.strokeStyle = '#F0F0F0'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(margin.left, py)
      ctx.lineTo(width - margin.right, py)
      ctx.stroke()

      ctx.fillStyle = '#999'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText('¥' + v, margin.left - 6, py)
    })

    const slotW = chartW / monthTrend.length
    const barW = Math.min(28, slotW * 0.6)

    monthTrend.forEach((m, i) => {
      const x = margin.left + i * slotW + (slotW - barW) / 2
      const val = parseFloat(m.amount) || 0
      const barH = (val / axis.yMax) * chartH
      const y = margin.top + chartH - barH

      if (barH > 0.5) {
        const grad = ctx.createLinearGradient(x, y, x, margin.top + chartH)
        grad.addColorStop(0, '#00C853')
        grad.addColorStop(1, '#69F0AE')
        ctx.fillStyle = grad
        roundRectPath(ctx, x, y, barW, barH, Math.min(4, barW / 2))
        ctx.fill()

        if (val > 0) {
          ctx.fillStyle = '#333'
          ctx.font = '9px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'bottom'
          ctx.fillText(String(val), x + barW / 2, y - 3)
        }
      }

      ctx.fillStyle = '#999'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      ctx.fillText(m.label, x + barW / 2, margin.top + chartH + 6)
    })
  }
})
