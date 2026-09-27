const { HEALTH_TYPES, HEALTH_TYPE_META } = require('../../../utils/config')
const { calcStats, getStatus, calcBMI, getBMICategory, sortByTimeDesc } = require('../../../utils/calc')
const { formatShortDateTime } = require('../../../utils/format')
const healthRepo = require('../../../utils/healthRepo')

/** 三个健康模块的展示配置 */
const MODULES = [
  Object.assign({ key: HEALTH_TYPES.BLOOD_SUGAR }, HEALTH_TYPE_META.blood_sugar),
  Object.assign({ key: HEALTH_TYPES.URIC_ACID }, HEALTH_TYPE_META.uric_acid),
  Object.assign({ key: HEALTH_TYPES.WEIGHT }, HEALTH_TYPE_META.weight)
]

/** CSV 字段转义：换行会破坏行结构，逗号会和分隔符冲突 */
function escapeCSV(value) {
  const text = value === undefined || value === null ? '' : String(value)
  return text.replace(/\r?\n/g, ' ').replace(/,/g, '，')
}

Page({
  data: {
    modules: MODULES,
    moduleData: {},
    loading: true,
    error: null,
    settings: {}
  },

  onShow() {
    this.loadAllData()
  },

  onPullDownRefresh() {
    this.loadAllData().finally(() => wx.stopPullDownRefresh())
  },

  async loadAllData() {
    this.setData({ loading: true, error: null })
    const settings = healthRepo.getSettings()
    this.setData({ settings })

    try {
      const results = await Promise.all(MODULES.map(m => this.loadModule(m, settings)))
      const moduleData = {}
      results.forEach(r => { moduleData[r.key] = r })
      this.setData({ moduleData, loading: false })
    } catch (err) {
      this.setData({ loading: false, error: { message: err.message, retryable: err.retryable } })
    }
  },

  /**
   * 加载单个模块的数据与统计
   * @param {Object} module
   * @param {Object} settings
   */
  async loadModule(module, settings) {
    const records = await healthRepo.getRecords(module.key)
    const sorted = sortByTimeDesc(records)
    const stats = calcStats(sorted)

    let status = 'unknown'
    if (stats.latest !== null) {
      if (module.key === HEALTH_TYPES.BLOOD_SUGAR) {
        // 按最新那条记录自己的测量时机来判定
        status = getStatus(module.key, stats.latest, { timing: sorted[0].timing })
      } else if (module.key === HEALTH_TYPES.URIC_ACID) {
        status = getStatus(module.key, stats.latest, { gender: settings.gender })
      }
    }

    const result = Object.assign({ key: module.key }, stats, {
      status,
      latestTime: stats.latestTime ? formatShortDateTime(stats.latestTime) : ''
    })

    if (module.key === HEALTH_TYPES.WEIGHT && stats.latest !== null) {
      if (settings.height) {
        result.bmi = calcBMI(stats.latest, settings.height)
        result.bmiCategory = getBMICategory(result.bmi)
        result.bmiText = result.bmi ? `BMI ${result.bmi} ${result.bmiCategory}` : ''
      }
      if (settings.targetWeight) {
        result.targetDiff = Math.round((stats.latest - settings.targetWeight) * 10) / 10
      }
      if (settings.compareDays && sorted.length > 1) {
        const compareDate = new Date()
        compareDate.setDate(compareDate.getDate() - settings.compareDays)
        const compareRecord = sorted.find(r => r.recordTime <= compareDate.getTime())
        if (compareRecord) {
          result.compareDiff = Math.round((stats.latest - compareRecord.value) * 10) / 10
          result.compareDays = settings.compareDays
        }
      }
    }

    return result
  },

  onTapCard(e) {
    wx.navigateTo({ url: `/pages/health/history/history?type=${e.currentTarget.dataset.key}` })
  },

  onTapRecord(e) {
    wx.navigateTo({ url: `/pages/health/record/record?type=${e.currentTarget.dataset.key}` })
  },

  onTapChart(e) {
    wx.navigateTo({ url: `/pages/health/chart/chart?type=${e.currentTarget.dataset.key}` })
  },

  onTapSettings() {
    wx.navigateTo({ url: '/pages/health/settings/settings' })
  },

  /** 导出全部健康记录为 CSV */
  async onExport() {
    wx.showLoading({ title: '整理数据中...' })
    try {
      const results = await Promise.all(MODULES.map(m => healthRepo.getRecords(m.key)))
      wx.hideLoading()

      let csv = '类型,数值,单位,测量时机,是否服药,记录时间,备注\n'
      results.forEach((records, idx) => {
        const module = MODULES[idx]
        records.forEach(r => {
          const medicated = r.medicated === true ? '服药' : (r.medicated === false ? '未服药' : '')
          const time = r.recordTime ? new Date(r.recordTime).toLocaleString('zh-CN') : ''
          csv += [
            module.name,
            r.value,
            r.unit || module.unit,
            escapeCSV(r.timing),
            medicated,
            time,
            escapeCSV(r.note)
          ].join(',') + '\n'
        })
      })

      this.saveAndOpenCSV(csv)
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message, icon: 'none' })
    }
  },

  saveAndOpenCSV(csvContent) {
    const fs = wx.getFileSystemManager()
    const fileName = `健康记录导出_${new Date().toISOString().slice(0, 10)}.csv`
    const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`

    fs.writeFile({
      filePath,
      // 加 BOM，否则 Excel 打开中文会乱码
      data: '\uFEFF' + csvContent,
      encoding: 'utf8',
      success: () => {
        wx.openDocument({
          filePath,
          fileType: 'csv',
          showMenu: true,
          success: () => wx.showToast({ title: '导出成功', icon: 'success' }),
          fail: () => this.shareCSVFile(filePath, fileName)
        })
      },
      fail: (err) => {
        console.error('写入文件失败', err)
        wx.showToast({ title: '导出失败', icon: 'none' })
      }
    })
  },

  shareCSVFile(filePath, fileName) {
    wx.shareFileMessage({
      filePath,
      fileName,
      success: () => wx.showToast({ title: '分享成功', icon: 'success' }),
      fail: (err) => {
        console.error('分享失败', err)
        // 最后兜底：把内容复制到剪贴板
        wx.getFileSystemManager().readFile({
          filePath,
          encoding: 'utf8',
          success: (res) => {
            wx.setClipboardData({
              data: res.data,
              success: () => {
                wx.showModal({
                  title: '导出提示',
                  content: '文件分享失败，CSV 内容已复制到剪贴板，您可以粘贴到备忘录或发送给朋友。',
                  showCancel: false
                })
              }
            })
          }
        })
      }
    })
  },

  /** 右下角加号：弹出类型选择 */
  onTapQuickAdd() {
    wx.showActionSheet({
      itemList: MODULES.map(m => `${m.icon} 记录${m.name}`),
      success: (res) => {
        const type = MODULES[res.tapIndex].key
        wx.navigateTo({ url: `/pages/health/record/record?type=${type}` })
      }
    })
  },

  /** 阻止卡片点击冒泡 */
  onActionTap() {}
})
