const healthDb = require('../../../utils/healthDb')

Page({
  data: {
    modules: [
      { key: 'blood_sugar', name: '血糖', icon: '🩸', unit: 'mmol/L', color: '#FF6B6B' },
      { key: 'uric_acid',   name: '尿酸', icon: '💊', unit: 'μmol/L', color: '#4ECDC4' },
      { key: 'weight',      name: '体重', icon: '⚖️', unit: 'kg',     color: '#45B7D1' }
    ],
    moduleData: {},  // { blood_sugar: { latest, max, min, avg, status } }
    loading: true,
    settings: {}
  },

  onShow() {
    this.loadAllData()
  },

  loadAllData() {
    this.setData({ loading: true })
    const settings = healthDb.getSettings()
    this.setData({ settings })

    const promises = this.data.modules.map(m => {
      return healthDb.getRecords(m.key).then(records => {
        // 确保按recordTime倒序排列（云数据库返回的数据可能顺序不对）
        records.sort((a, b) => b.recordTime - a.recordTime)
        const stats = healthDb.calcStats(records)
        // 根据类型传入不同参数判断状态
        let status = 'unknown'
        if (stats.latest !== null) {
          if (m.key === 'blood_sugar') {
            // 最新记录的timing（records已按时间倒序）
            const latestRecord = records[0]
            status = healthDb.getStatus(m.key, stats.latest, { timing: latestRecord.timing })
          } else if (m.key === 'uric_acid') {
            status = healthDb.getStatus(m.key, stats.latest, { gender: settings.gender || 'male' })
          }
        }

        const result = { key: m.key, stats, status, count: records.length }

        // 体重额外计算BMI、N天对比、目标差
        if (m.key === 'weight' && stats.latest !== null) {
          // BMI
          if (settings.height) {
            result.bmi = healthDb.calcBMI(stats.latest, settings.height)
            result.bmiCategory = result.bmi ? healthDb.getBMICategory(result.bmi) : ''
          }
          // 目标体重差
          if (settings.targetWeight) {
            result.targetDiff = Math.round((stats.latest - settings.targetWeight) * 10) / 10
          }
          // N天对比
          if (settings.compareDays && records.length > 1) {
            const compareDate = new Date()
            compareDate.setDate(compareDate.getDate() - settings.compareDays)
            const compareRecord = records.find(r => r.recordTime <= compareDate.getTime())
            if (compareRecord) {
              result.compareDiff = Math.round((stats.latest - compareRecord.value) * 10) / 10
              result.compareDays = settings.compareDays
            }
          }
        }

        return result
      })
    })
    Promise.all(promises).then(results => {
      const moduleData = {}
      results.forEach(r => {
        // 格式化 latestTime 为可读日期
        let latestTimeStr = ''
        if (r.latestTime) {
          const d = new Date(r.latestTime)
          const month = d.getMonth() + 1
          const day = d.getDate()
          const hour = String(d.getHours()).padStart(2, '0')
          const minute = String(d.getMinutes()).padStart(2, '0')
          latestTimeStr = month + '/' + day + ' ' + hour + ':' + minute
        }
        moduleData[r.key] = { ...r.stats, status: r.status, count: r.count, ...r, latestTime: latestTimeStr }
      })
      this.setData({ moduleData, loading: false })
    })
  },

  onTapCard(e) {
    const key = e.currentTarget.dataset.key
    wx.navigateTo({ url: `/pages/health/history/history?type=${key}` })
  },

  onTapRecord(e) {
    const key = e.currentTarget.dataset.key
    wx.navigateTo({ url: `/pages/health/record/record?type=${key}` })
  },

  onTapChart(e) {
    const key = e.currentTarget.dataset.key
    wx.navigateTo({ url: `/pages/health/chart/chart?type=${key}` })
  },

  onTapSettings() {
    wx.navigateTo({ url: '/pages/health/settings/settings' })
  },

  onExport() {
    const types = this.data.modules.map(m => m.key)
    const typeNames = { blood_sugar: '血糖', uric_acid: '尿酸', weight: '体重' }
    let csv = '类型,数值,单位,测量时机,是否服药,记录时间,备注\n'

    const promises = types.map(type =>
      healthDb.getRecords(type).then(records => ({ type, records }))
    )

    Promise.all(promises).then(results => {
      results.forEach(({ type, records }) => {
        records.forEach(r => {
          const name = typeNames[type] || type
          const timing = r.timing || ''
          const medicated = r.medicated === true ? '服药' : (r.medicated === false ? '未服药' : '')
          const time = r.recordTime ? new Date(r.recordTime).toLocaleString('zh-CN') : ''
          const note = (r.note || '').replace(/,/g, '，')
          csv += `${name},${r.value},${r.unit || ''},${timing},${medicated},${time},${note}\n`
        })
      })

      // 直接保存文件并打开
      this.saveAndOpenCSV(csv)
    })
  },

  saveAndOpenCSV(csvContent) {
    const fs = wx.getFileSystemManager()
    const fileName = `健康记录导出_${new Date().toISOString().slice(0,10)}.csv`
    const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`

    fs.writeFile({
      filePath,
      data: '\uFEFF' + csvContent,
      encoding: 'utf8',
      success: () => {
        // 先尝试打开文件预览
        wx.openDocument({
          filePath,
          fileType: 'csv',
          showMenu: true,
          success: () => {
            wx.showToast({ title: '导出成功', icon: 'success' })
          },
          fail: () => {
            // 如果打不开，尝试分享
            this.shareCSVFile(filePath, fileName)
          }
        })
      },
      fail: (err) => {
        console.error('写入文件失败', err)
        wx.showToast({ title: '导出失败', icon: 'none' })
      }
    })
  },

  shareCSVFile(filePath, fileName) {
    // 尝试分享到聊天
    wx.shareFileMessage({
      filePath,
      fileName,
      success: () => {
        wx.showToast({ title: '分享成功', icon: 'success' })
      },
      fail: (err) => {
        console.error('分享失败', err)
        // 最后 fallback：复制到剪贴板
        wx.getFileSystemManager().readFile({
          filePath,
          encoding: 'utf8',
          success: (res) => {
            wx.setClipboardData({
              data: res.data,
              success: () => {
                wx.showModal({
                  title: '导出提示',
                  content: '文件分享失败，CSV内容已复制到剪贴板，您可以粘贴到备忘录或发送给朋友。',
                  showCancel: false
                })
              }
            })
          }
        })
      }
    })
  },

  getStatusText(status) {
    return { normal: '正常', high: '偏高', low: '偏低' }[status] || ''
  },
  getStatusClass(status) {
    return { normal: 'tag-green', high: 'tag-red', low: 'tag-orange' }[status] || ''
  },

  // 阻止事件冒泡
  onActionTap() {
    // 什么都不做，只是阻止冒泡
  }
})
