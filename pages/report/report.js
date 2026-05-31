const db = require('../../utils/db')

const CATEGORIES = [
  { name: '电子设备', icon: '📱' },
  { name: '家居生活', icon: '🏠' },
  { name: '服装鞋包', icon: '👕' },
  { name: '租房住房', icon: '🏢' },
  { name: '技能培训', icon: '📚' },
  { name: '交通出行', icon: '🚗' },
  { name: '餐饮美食', icon: '🍜' },
  { name: '娱乐休闲', icon: '🎮' },
  { name: '其他', icon: '📦' }
]

const COLORS = [
  '#00C853', '#FF6B6B', '#4ECDC4', '#FFD93D', '#6C5CE7',
  '#FF8A65', '#45B7D1', '#F06292', '#90A4AE'
]

Page({
  data: {
    mode: 'month', // month | year
    currentYear: 0,
    currentMonth: 0,
    totalSpent: '0',
    itemCount: 0,
    avgPerItem: '0',
    categoryData: [], // { name, icon, amount, percent, color }
    monthTrend: [],   // { label, amount } (仅年报模式)
    topItems: [],     // { name, price, category }
    hasData: false,
    allItems: []
  },

  onLoad() {
    const now = new Date()
    this.setData({
      currentYear: now.getFullYear(),
      currentMonth: now.getMonth() + 1
    })
    this.loadAllData()
  },

  loadAllData() {
    wx.showLoading({ title: '加载中...' })
    db.getAllItems().then(items => {
      wx.hideLoading()
      this.setData({ allItems: items })
      this.calcReport()
    })
  },

  // 切换月报/年报
  onSwitchMode(e) {
    const mode = e.currentTarget.dataset.mode
    this.setData({ mode }, () => this.calcReport())
  },

  // 切换上一月/年
  onPrev() {
    let { currentYear, currentMonth, mode } = this.data
    if (mode === 'month') {
      currentMonth--
      if (currentMonth < 1) { currentMonth = 12; currentYear-- }
    } else {
      currentYear--
    }
    this.setData({ currentYear, currentMonth }, () => this.calcReport())
  },

  // 切换下一月/年
  onNext() {
    let { currentYear, currentMonth, mode } = this.data
    const now = new Date()
    if (mode === 'month') {
      currentMonth++
      if (currentMonth > 12) { currentMonth = 1; currentYear++ }
      // 不超过当前月
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

  // 计算报告数据
  calcReport() {
    const { allItems, mode, currentYear, currentMonth } = this.data
    if (!allItems.length) {
      this.setData({ hasData: false, categoryData: [], monthTrend: [], topItems: [] })
      return
    }

    // 筛选当前时间段内购买的物品
    let filtered = allItems.filter(item => {
      const d = new Date(item.buyDate)
      if (mode === 'month') {
        return d.getFullYear() === currentYear && (d.getMonth() + 1) === currentMonth
      } else {
        return d.getFullYear() === currentYear
      }
    })

    if (filtered.length === 0) {
      this.setData({ hasData: false, categoryData: [], monthTrend: [], topItems: [], itemCount: 0, totalSpent: '0', avgPerItem: '0' })
      return
    }

    // 总花费
    const total = filtered.reduce((s, i) => s + i.price, 0)
    const avgPerItem = (total / filtered.length).toFixed(0)

    // 按分类统计
    const catMap = {}
    filtered.forEach(item => {
      const cat = item.category || '其他'
      catMap[cat] = (catMap[cat] || 0) + item.price
    })
    const categoryData = Object.entries(catMap)
      .map(([name, amount], idx) => {
        const catInfo = CATEGORIES.find(c => c.name === name)
        return {
          name,
          icon: catInfo ? catInfo.icon : '📦',
          amount: amount.toFixed(0),
          percent: Math.round(amount / total * 100),
          color: COLORS[idx % COLORS.length]
        }
      })
      .sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount))

    // 年报模式：月度趋势
    let monthTrend = []
    if (mode === 'year') {
      for (let m = 1; m <= 12; m++) {
        const monthItems = allItems.filter(item => {
          const d = new Date(item.buyDate)
          return d.getFullYear() === currentYear && (d.getMonth() + 1) === m
        })
        const monthTotal = monthItems.reduce((s, i) => s + i.price, 0)
        monthTrend.push({ label: m + '月', amount: monthTotal.toFixed(0) })
      }
    }

    // 花费最多的物品 Top 5
    const topItems = [...filtered]
      .sort((a, b) => b.price - a.price)
      .slice(0, 5)
      .map(item => ({
        name: item.name,
        price: item.price.toFixed(0),
        category: item.category || '其他'
      }))

    this.setData({
      hasData: true,
      totalSpent: total.toFixed(0),
      itemCount: filtered.length,
      avgPerItem,
      categoryData,
      monthTrend,
      topItems
    })

    // 延迟绘制图表
    setTimeout(() => this.drawChart(), 100)
  },

  // Canvas 绘制分类占比图
  drawChart() {
    const { mode, categoryData, monthTrend } = this.data
    if (mode === 'month' && categoryData.length > 0) {
      this.drawPieChart()
    } else if (mode === 'year' && monthTrend.length > 0) {
      this.drawBarChart()
    }
  },

  drawPieChart() {
    wx.createSelectorQuery()
      .select('#reportChart')
      .fields({ node: true, size: true })
      .exec(res => {
        if (!res?.[0]?.node) return
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const dpr = wx.getSystemInfoSync().pixelRatio
        canvas.width = res[0].width * dpr
        canvas.height = res[0].height * dpr
        ctx.scale(dpr, dpr)
        const w = res[0].width
        const h = res[0].height

        const { categoryData } = this.data
        const cx = w * 0.35
        const cy = h / 2
        const radius = Math.min(cx, cy) - 10
        const total = categoryData.reduce((s, c) => s + parseFloat(c.amount), 0)

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

        // 中心白色圆（甜甜圈效果）
        ctx.beginPath()
        ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2)
        ctx.fillStyle = '#FFFFFF'
        ctx.fill()

        // 中心文字
        ctx.fillStyle = '#333'
        ctx.font = 'bold 16px sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(`¥${this.data.totalSpent}`, cx, cy - 8)
        ctx.fillStyle = '#999'
        ctx.font = '11px sans-serif'
        ctx.fillText('总花费', cx, cy + 12)

        // 右侧图例
        const legendX = w * 0.65
        let legendY = 15
        categoryData.forEach(cat => {
          ctx.fillStyle = cat.color
          ctx.fillRect(legendX, legendY, 12, 12)
          ctx.fillStyle = '#333'
          ctx.font = '12px sans-serif'
          ctx.textAlign = 'left'
          ctx.textBaseline = 'top'
          ctx.fillText(`${cat.icon} ${cat.name}`, legendX + 18, legendY)
          ctx.fillStyle = '#999'
          ctx.font = '11px sans-serif'
          ctx.fillText(`¥${cat.amount} (${cat.percent}%)`, legendX + 18, legendY + 16)
          legendY += 38
        })
      })
  },

  drawBarChart() {
    wx.createSelectorQuery()
      .select('#reportChart')
      .fields({ node: true, size: true })
      .exec(res => {
        if (!res?.[0]?.node) return
        const canvas = res[0].node
        const ctx = canvas.getContext('2d')
        const dpr = wx.getSystemInfoSync().pixelRatio
        canvas.width = res[0].width * dpr
        canvas.height = res[0].height * dpr
        ctx.scale(dpr, dpr)
        const w = res[0].width
        const h = res[0].height

        const { monthTrend } = this.data
        const margin = { top: 20, right: 20, bottom: 40, left: 50 }
        const chartW = w - margin.left - margin.right
        const chartH = h - margin.top - margin.bottom

        const maxVal = Math.max(...monthTrend.map(m => parseFloat(m.amount)), 1)
        const yMax = Math.ceil(maxVal / 100) * 100 || 100
        const barW = Math.min(40, (chartW - (monthTrend.length - 1) * 8) / monthTrend.length)
        const gap = barW + 8

        // 网格线
        ctx.strokeStyle = '#F0F0F0'
        ctx.lineWidth = 1
        for (let y = 0; y <= yMax; y += Math.ceil(yMax / 4 / 100) * 100) {
          const py = margin.top + chartH - (y / yMax) * chartH
          ctx.beginPath()
          ctx.moveTo(margin.left, py)
          ctx.lineTo(w - margin.right, py)
          ctx.stroke()
          ctx.fillStyle = '#999'
          ctx.font = '10px sans-serif'
          ctx.textAlign = 'right'
          ctx.textBaseline = 'middle'
          ctx.fillText(`${y}`, margin.left - 8, py)
        }

        // 柱子
        monthTrend.forEach((m, i) => {
          const x = margin.left + i * gap + (chartW - monthTrend.length * gap) / 2
          const val = parseFloat(m.amount)
          const barH = val > 0 ? (val / yMax) * chartH : 0
          const y = margin.top + chartH - barH

          const grad = ctx.createLinearGradient(x, y, x, margin.top + chartH)
          grad.addColorStop(0, '#00C853')
          grad.addColorStop(1, '#69F0AE')
          ctx.fillStyle = grad

          const rx = 4
          ctx.beginPath()
          ctx.moveTo(x + rx, y)
          ctx.lineTo(x + barW - rx, y)
          ctx.quadraticCurveTo(x + barW, y, x + barW, y + rx)
          ctx.lineTo(x + barW, margin.top + chartH)
          ctx.lineTo(x, margin.top + chartH)
          ctx.lineTo(x, y + rx)
          ctx.quadraticCurveTo(x, y, x + rx, y)
          ctx.fill()

          // 数值
          if (val > 0) {
            ctx.fillStyle = '#333'
            ctx.font = '10px sans-serif'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'bottom'
            ctx.fillText(`¥${m.amount}`, x + barW / 2, y - 4)
          }

          // X轴标签
          ctx.fillStyle = '#999'
          ctx.font = '10px sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'top'
          ctx.fillText(m.label, x + barW / 2, margin.top + chartH + 8)
        })
      })
  }
})
