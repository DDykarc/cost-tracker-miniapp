const { HEALTH_TYPE_META, HEALTH_TYPES } = require('../../../utils/config')
const { getStatus, sortByTimeDesc } = require('../../../utils/calc')
const { formatShortDateTime } = require('../../../utils/format')
const healthRepo = require('../../../utils/healthRepo')

const TIME_RANGES = [
  { key: '7', label: '近7天' },
  { key: '30', label: '近30天' },
  { key: '90', label: '近90天' },
  { key: 'all', label: '全部' }
]

Page({
  data: {
    type: '',
    typeName: '',
    unit: '',
    records: [],
    filteredRecords: [],
    loading: true,
    error: null,
    settings: {},
    timeRanges: TIME_RANGES,
    selectedRange: '30',
    stats: { max: null, min: null, avg: null, count: 0 }
  },

  onLoad(options) {
    const type = options.type
    const meta = HEALTH_TYPE_META[type] || { name: '', unit: '' }
    const settings = healthRepo.getSettings()
    this.setData({ type, typeName: meta.name, unit: meta.unit, settings })
    wx.setNavigationBarTitle({ title: meta.name + '记录' })
  },

  onShow() {
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData().finally(() => wx.stopPullDownRefresh())
  },

  async loadData() {
    const { type, settings } = this.data
    this.setData({ loading: true, error: null })

    try {
      const records = await healthRepo.getRecords(type)
      const enriched = sortByTimeDesc(records).map(r => {
        let status = 'unknown'
        if (type === HEALTH_TYPES.BLOOD_SUGAR) {
          status = getStatus(type, r.value, { timing: r.timing })
        } else if (type === HEALTH_TYPES.URIC_ACID) {
          status = getStatus(type, r.value, { gender: settings.gender })
        }
        return Object.assign({}, r, {
          status,
          timeStr: formatShortDateTime(r.recordTime)
        })
      })

      this.setData({ records: enriched, loading: false })
      this.applyFilter()
    } catch (err) {
      this.setData({ loading: false, error: { message: err.message, retryable: err.retryable } })
    }
  },

  onSwitchRange(e) {
    this.setData({ selectedRange: e.currentTarget.dataset.range }, () => this.applyFilter())
  },

  /** 按时间范围筛选，并计算筛选后的统计 */
  applyFilter() {
    const { records, selectedRange } = this.data
    let filtered = records

    if (selectedRange !== 'all') {
      const days = parseInt(selectedRange, 10)
      const since = Date.now() - days * 24 * 60 * 60 * 1000
      filtered = records.filter(r => r.recordTime >= since)
    }

    const stats = { max: null, min: null, avg: null, count: filtered.length }
    if (filtered.length > 0) {
      const values = filtered.map(r => r.value)
      stats.max = Math.max.apply(null, values)
      stats.min = Math.min.apply(null, values)
      stats.avg = (values.reduce((s, v) => s + v, 0) / values.length).toFixed(1)
    }

    this.setData({ filteredRecords: filtered, stats })
  },

  onTapRecord(e) {
    wx.navigateTo({
      url: `/pages/health/record/record?type=${this.data.type}&id=${e.currentTarget.dataset.id}`
    })
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复，是否继续？',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await healthRepo.deleteRecord(id)
          wx.showToast({ title: '已删除', icon: 'success' })
          this.loadData()
        } catch (err) {
          wx.showToast({ title: err.message, icon: 'none' })
        }
      }
    })
  }
})
