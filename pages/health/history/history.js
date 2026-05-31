const healthDb = require('../../../utils/healthDb')

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
    settings: {},
    timeRanges: TIME_RANGES,
    selectedRange: '30',
    // 统计数据
    stats: { max: null, min: null, avg: null, count: 0 }
  },

  onLoad(options) {
    const type = options.type
    const typeMap = {
      blood_sugar: { name: '血糖', unit: 'mmol/L' },
      uric_acid: { name: '尿酸', unit: 'μmol/L' },
      weight: { name: '体重', unit: 'kg' }
    }
    const info = typeMap[type] || { name: '', unit: '' }
    const settings = healthDb.getSettings()
    this.setData({ type, typeName: info.name, unit: info.unit, settings })
    wx.setNavigationBarTitle({ title: info.name + '记录' })
  },

  onShow() {
    this.loadData()
  },

  loadData() {
    const { type, settings } = this.data
    this.setData({ loading: true })
    healthDb.getRecords(type).then(records => {
      records.sort((a, b) => b.recordTime - a.recordTime)

      const enrichedRecords = records.map(r => {
        let status = 'unknown'
        if (type === 'blood_sugar') {
          status = healthDb.getStatus(type, r.value, { timing: r.timing })
        } else if (type === 'uric_acid') {
          status = healthDb.getStatus(type, r.value, { gender: settings.gender || 'male' })
        }

        const d = new Date(r.recordTime)
        const month = d.getMonth() + 1
        const day = d.getDate()
        const hour = String(d.getHours()).padStart(2, '0')
        const minute = String(d.getMinutes()).padStart(2, '0')
        const timeStr = month + '/' + day + ' ' + hour + ':' + minute

        return { ...r, status, timeStr }
      })

      this.setData({ records: enrichedRecords, loading: false })
      this.applyFilter()
    })
  },

  // 时间范围切换
  onSwitchRange(e) {
    const range = e.currentTarget.dataset.range
    this.setData({ selectedRange: range })
    this.applyFilter()
  },

  // 应用时间筛选
  applyFilter() {
    const { records, selectedRange } = this.data
    let filtered = records

    if (selectedRange !== 'all') {
      const days = parseInt(selectedRange)
      const since = Date.now() - days * 24 * 60 * 60 * 1000
      filtered = records.filter(r => r.recordTime >= since)
    }

    // 计算筛选后的统计
    let stats = { max: null, min: null, avg: null, count: filtered.length }
    if (filtered.length > 0) {
      const values = filtered.map(r => r.value)
      stats.max = Math.max(...values)
      stats.min = Math.min(...values)
      stats.avg = (values.reduce((s, v) => s + v, 0) / values.length).toFixed(1)
    }

    this.setData({ filteredRecords: filtered, stats })
  },

  onTapRecord(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/health/record/record?type=${this.data.type}&id=${id}`
    })
  },

  onDelete(e) {
    const id = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复，是否继续？',
      success: (res) => {
        if (res.confirm) {
          healthDb.deleteRecord(id).then(() => {
            wx.showToast({ title: '已删除', icon: 'success' })
            this.loadData()
          })
        }
      }
    })
  }
})
