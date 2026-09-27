const { HEALTH_TYPE_META, HEALTH_TYPES } = require('../../../utils/config')
const { calcStats, getRefRange, getStatus, sortByTimeAsc } = require('../../../utils/calc')
const { formatShortDate } = require('../../../utils/format')
const healthRepo = require('../../../utils/healthRepo')

/** 绘图区内边距（px） */
const PADDING = { top: 40, right: 30, bottom: 60, left: 60 }
/** 缩放下限与上限 */
const MIN_SCALE = 1
const MAX_SCALE = 8
/** tooltip 的估算宽度，用于避免贴边时被裁掉 */
const TOOLTIP_W = 110

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v))
}

Page({
  data: {
    type: '',
    typeName: '',
    unit: '',
    period: 'all',
    periods: [
      { key: 'all', label: '全部' },
      { key: '7', label: '7天' },
      { key: '30', label: '30天' }
    ],
    records: [],
    stats: { max: 0, min: 0, avg: 0 },
    loading: true,
    error: null,
    settings: {},
    refLabel: '',
    refText: '',
    tooltipShow: false,
    tooltipX: 0,
    tooltipY: 0,
    tooltipText: ''
  },

  // 交互状态：不参与渲染，直接挂在实例上，避免高频 setData
  _canvas: null,
  _ctx: null,
  _width: 0,
  _height: 0,
  _offsetX: 0,
  _scale: 1,
  _isDragging: false,
  _lastX: 0,
  _pinchStartDist: 0,
  _touchStartTime: 0,
  _touchStartX: 0,
  _touchStartY: 0,

  onLoad(options) {
    const type = options.type
    const meta = HEALTH_TYPE_META[type] || { name: '', unit: '' }
    const settings = healthRepo.getSettings()
    this.setData({ type, typeName: meta.name, unit: meta.unit, settings })
    wx.setNavigationBarTitle({ title: meta.name + '趋势' })
  },

  onReady() {
    this.initCanvas()
  },

  onShow() {
    this.loadData()
  },

  onUnload() {
    if (this._tooltipTimer) clearTimeout(this._tooltipTimer)
    this._rafPending = false
  },

  /** 取 canvas 节点（onReady 之后才拿得到，失败时重试一次） */
  initCanvas(retry = true) {
    wx.createSelectorQuery()
      .select('#trendChart')
      .fields({ node: true, size: true })
      .exec(res => {
        const info = res && res[0]
        if (!info || !info.node) {
          if (retry) setTimeout(() => this.initCanvas(false), 200)
          return
        }
        const canvas = info.node
        const ctx = canvas.getContext('2d')
        const dpr = wx.getWindowInfo().pixelRatio
        canvas.width = info.width * dpr
        canvas.height = info.height * dpr
        ctx.scale(dpr, dpr)

        this._canvas = canvas
        this._ctx = ctx
        this._width = info.width
        this._height = info.height
        this.tryDraw()
      })
  },

  onSelectPeriod(e) {
    this.setData({ period: e.currentTarget.dataset.key }, () => this.loadData())
  },

  async loadData() {
    const { type, period } = this.data
    const days = period === 'all' ? null : parseInt(period, 10)
    this.setData({ loading: true, error: null })

    try {
      const records = await healthRepo.getRecords(type, days)
      const sorted = sortByTimeAsc(records)
      const stats = calcStats(sorted)
      this.resetView()
      this.setData({ records: sorted, stats, loading: false })
      this.updateRefInfo(sorted)
      this.tryDraw()
    } catch (err) {
      this.setData({ loading: false, error: { message: err.message, retryable: err.retryable } })
    }
  },

  /** 数据和画布都就绪后才绘制 */
  tryDraw() {
    if (!this._ctx || this.data.records.length < 2) return
    this.drawChart()
  },

  resetView() {
    this._offsetX = 0
    this._scale = 1
  },

  /**
   * 参考范围。
   * 血糖只有在所有记录的测量时机一致时才给参考线 —— 混合时机画一条线会误导用户。
   */
  updateRefInfo(records) {
    const { type, settings } = this.data
    let label = ''
    let range = null

    if (type === HEALTH_TYPES.BLOOD_SUGAR) {
      if (records.length) {
        const timings = records.map(r => r.timing || '空腹')
        const unique = timings.filter((t, i) => timings.indexOf(t) === i)
        if (unique.length === 1) {
          range = getRefRange(type, { timing: unique[0] })
          label = unique[0] + '血糖'
        }
      }
    } else if (type === HEALTH_TYPES.URIC_ACID) {
      const gender = settings.gender || 'male'
      range = getRefRange(type, { gender })
      label = gender === 'male' ? '尿酸（男性）' : '尿酸（女性）'
    }

    this.setData({
      refLabel: range ? label : '',
      refText: range ? `${range.min} ~ ${range.max} ${this.data.unit}` : ''
    })
  },

  /** 当前缩放下的每格宽度 */
  getItemWidth() {
    const chartW = this._width - PADDING.left - PADDING.right
    const n = Math.max(1, this.data.records.length - 1)
    return (chartW / n) * this._scale
  },

  /** Y 轴范围：绘制和点击命中都用它，避免两处算法不一致 */
  computeYRange() {
    const values = this.data.records.map(r => r.value)
    const minVal = Math.min.apply(null, values)
    const maxVal = Math.max.apply(null, values)
    let yPadding = (maxVal - minVal) * 0.2
    if (yPadding < 1) yPadding = 1
    let yMin = minVal - yPadding
    let yMax = maxVal + yPadding
    if (yMax - yMin < 2) {
      const center = (minVal + maxVal) / 2
      yMin = center - 1
      yMax = center + 1
    }
    return { yMin, yMax }
  },

  /** 用 rAF 合并高频重绘（拖动时 touchmove 每秒触发几十次） */
  scheduleDraw() {
    if (this._rafPending) return
    this._rafPending = true
    const canvas = this._canvas
    const run = () => {
      this._rafPending = false
      this.drawChart()
    }
    if (canvas && typeof canvas.requestAnimationFrame === 'function') {
      canvas.requestAnimationFrame(run)
    } else {
      setTimeout(run, 16)
    }
  },

  drawChart() {
    const { records, type, settings } = this.data
    if (records.length < 2 || !this._ctx) return

    const ctx = this._ctx
    const width = this._width
    const height = this._height
    const chartW = width - PADDING.left - PADDING.right
    const chartH = height - PADDING.top - PADDING.bottom
    const { yMin, yMax } = this.computeYRange()
    const itemWidth = this.getItemWidth()

    const xAt = i => PADDING.left + i * itemWidth + this._offsetX
    const yAt = v => PADDING.top + chartH * (1 - (v - yMin) / (yMax - yMin))

    ctx.clearRect(0, 0, width, height)

    // 坐标轴
    ctx.strokeStyle = '#E0E0E0'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PADDING.left, PADDING.top)
    ctx.lineTo(PADDING.left, height - PADDING.bottom)
    ctx.lineTo(width - PADDING.right, height - PADDING.bottom)
    ctx.stroke()

    // 参考线
    const ref = this.getRefRangeForDraw()
    if (ref) {
      ctx.strokeStyle = '#00C853'
      ctx.setLineDash([5, 5])
      ctx.lineWidth = 2
      ;[ref.min, ref.max].forEach(refVal => {
        if (refVal >= yMin && refVal <= yMax) {
          const y = yAt(refVal)
          ctx.beginPath()
          ctx.moveTo(PADDING.left, y)
          ctx.lineTo(width - PADDING.right, y)
          ctx.stroke()
        }
      })
      ctx.setLineDash([])
    }

    // Y 轴刻度与横向网格
    ctx.font = '12px sans-serif'
    for (let i = 0; i <= 5; i++) {
      const y = PADDING.top + chartH * (1 - i / 5)
      const val = yMin + (yMax - yMin) * (i / 5)
      ctx.fillStyle = '#999'
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(val.toFixed(1), PADDING.left - 10, y)

      if (i > 0) {
        ctx.strokeStyle = '#F0F0F0'
        ctx.beginPath()
        ctx.moveTo(PADDING.left, y)
        ctx.lineTo(width - PADDING.right, y)
        ctx.stroke()
      }
    }

    // X 轴标签：只画落在可视区内的
    ctx.fillStyle = '#999'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    const step = Math.max(1, Math.floor(records.length / 5))
    for (let i = 0; i < records.length; i += step) {
      const x = xAt(i)
      if (x < PADDING.left - 1 || x > width - PADDING.right + 1) continue
      ctx.fillText(formatShortDate(records[i].recordTime), x, height - PADDING.bottom + 20)
    }

    // 折线
    ctx.strokeStyle = '#00C853'
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.beginPath()
    records.forEach((r, i) => {
      const x = xAt(i)
      const y = yAt(r.value)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()

    // 数据点：按状态着色
    records.forEach((r, i) => {
      const x = xAt(i)
      if (x < PADDING.left - 8 || x > width - PADDING.right + 8) return
      const y = yAt(r.value)
      let color = '#00C853'
      const status = this.getRecordStatus(r, type, settings)
      if (status === 'high') color = '#F44336'
      else if (status === 'low') color = '#FF9800'

      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(x, y, 4, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(x, y, 2, 0, Math.PI * 2)
      ctx.fill()
    })
  },

  /** 取绘图用的参考范围（血糖需所有记录时机一致） */
  getRefRangeForDraw() {
    const { records, type, settings } = this.data
    if (!records.length) return null
    if (type === HEALTH_TYPES.BLOOD_SUGAR) {
      const timings = records.map(r => r.timing || '空腹')
      const unique = timings.filter((t, i) => timings.indexOf(t) === i)
      if (unique.length !== 1) return null
      return getRefRange(type, { timing: unique[0] })
    }
    if (type === HEALTH_TYPES.URIC_ACID) {
      return getRefRange(type, { gender: settings.gender || 'male' })
    }
    return null
  },

  getRecordStatus(record, type, settings) {
    if (type === HEALTH_TYPES.BLOOD_SUGAR) {
      return getStatus(type, record.value, { timing: record.timing })
    }
    if (type === HEALTH_TYPES.URIC_ACID) {
      return getStatus(type, record.value, { gender: settings.gender })
    }
    return 'normal'
  },

  // ==================== 触摸交互 ====================

  onTouchStart(e) {
    const touches = e.touches
    this._touchStartTime = Date.now()
    this._touchStartX = touches[0].x
    this._touchStartY = touches[0].y

    if (touches.length === 1) {
      this._isDragging = false
      this._lastX = touches[0].x
    } else if (touches.length === 2) {
      const dx = touches[0].x - touches[1].x
      const dy = touches[0].y - touches[1].y
      this._pinchStartDist = Math.sqrt(dx * dx + dy * dy)
    }
  },

  onTouchMove(e) {
    const touches = e.touches

    if (touches.length === 1) {
      if (!this._isDragging) {
        const dx = Math.abs(touches[0].x - this._touchStartX)
        const dy = Math.abs(touches[0].y - this._touchStartY)
        if (dx > 5 || dy > 5) this._isDragging = true
      }
      if (this._isDragging) {
        this._offsetX += touches[0].x - this._lastX
        this._lastX = touches[0].x
        this.clampOffset()
        this.scheduleDraw()
      }
      return
    }

    if (touches.length === 2 && this._pinchStartDist > 0) {
      const dx = touches[0].x - touches[1].x
      const dy = touches[0].y - touches[1].y
      const dist = Math.sqrt(dx * dx + dy * dy)
      const centerX = (touches[0].x + touches[1].x) / 2
      this.applyScale(dist / this._pinchStartDist, centerX)
      this._pinchStartDist = dist
      this.scheduleDraw()
    }
  },

  /**
   * 以 centerX 为锚点缩放，并限制缩放倍数。
   * 原来的实现不限制倍数（可以缩到 0 或无穷），缩放时内容还会「跳」。
   */
  applyScale(scaleChange, centerX) {
    if (!scaleChange || !isFinite(scaleChange)) return
    const prevScale = this._scale
    const nextScale = clamp(prevScale * scaleChange, MIN_SCALE, MAX_SCALE)
    if (nextScale === prevScale) return

    const d = centerX - PADDING.left
    this._offsetX = d - (d - this._offsetX) * (nextScale / prevScale)
    this._scale = nextScale
    this.clampOffset()
  },

  /** 把内容限制在可视区内（左右边界对称） */
  clampOffset() {
    const chartW = this._width - PADDING.left - PADDING.right
    const contentW = chartW * this._scale
    const minX = Math.min(0, chartW - contentW)
    this._offsetX = clamp(this._offsetX, minX, 0)
  },

  onTouchEnd(e) {
    const duration = Date.now() - this._touchStartTime
    const touch = e.changedTouches && e.changedTouches[0]
    if (touch) {
      const moveX = Math.abs(touch.x - this._touchStartX)
      const moveY = Math.abs(touch.y - this._touchStartY)
      if (duration < 300 && moveX < 10 && moveY < 10 && !this._isDragging) {
        this.handleTap(touch.x, touch.y)
      }
    }
    this._isDragging = false
    this._pinchStartDist = 0
  },

  /** 点击最近的数据点，弹出数值提示 */
  handleTap(x, y) {
    const { records } = this.data
    if (records.length < 2) return

    const chartW = this._width - PADDING.left - PADDING.right
    const chartH = this._height - PADDING.top - PADDING.bottom
    const { yMin, yMax } = this.computeYRange()
    const itemWidth = this.getItemWidth()

    let closest = null
    let closestDist = 24
    for (let i = 0; i < records.length; i++) {
      const px = PADDING.left + i * itemWidth + this._offsetX
      const py = PADDING.top + chartH * (1 - (records[i].value - yMin) / (yMax - yMin))
      const dist = Math.sqrt(Math.pow(x - px, 2) + Math.pow(y - py, 2))
      if (dist < closestDist) {
        closestDist = dist
        closest = { idx: i, x: px, y: py }
      }
    }

    if (!closest) {
      this.setData({ tooltipShow: false })
      return
    }

    const record = records[closest.idx]
    // 贴边时把气泡拉回可视区内
    const tx = clamp(closest.x, 4, Math.max(4, this._width - TOOLTIP_W))
    const ty = Math.max(4, closest.y - 46)

    this.setData({
      tooltipShow: true,
      tooltipX: tx,
      tooltipY: ty,
      tooltipText: `${formatShortDate(record.recordTime)}\n数值: ${record.value}`
    })

    if (this._tooltipTimer) clearTimeout(this._tooltipTimer)
    this._tooltipTimer = setTimeout(() => this.setData({ tooltipShow: false }), 3000)
  }
})
