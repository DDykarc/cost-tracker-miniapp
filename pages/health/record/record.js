const { HEALTH_TYPE_META, SUGAR_TIMING, HEALTH_TYPES } = require('../../../utils/config')
const { calcBMI, getBMICategory } = require('../../../utils/calc')
const { formatDate, formatTime, parseDateTime } = require('../../../utils/format')
const healthRepo = require('../../../utils/healthRepo')

Page({
  data: {
    type: '',
    typeName: '',
    unit: '',
    isEdit: false,
    editId: '',

    value: '',
    note: '',
    timing: '',
    medicated: null,
    medicine: '',

    // 时间选择（原生 picker）
    dateValue: '', // "YYYY-MM-DD"
    timeValue: '', // "HH:mm"
    today: '',     // 日期选择上限

    timingOptions: SUGAR_TIMING,
    canSave: false,
    saving: false,

    height: null,
    bmi: null,
    bmiCategory: ''
  },

  onLoad(options) {
    const type = options.type
    const meta = HEALTH_TYPE_META[type] || { name: '', unit: '' }
    const now = new Date()
    const dateVal = formatDate(now)
    const timeVal = formatTime(now)
    const settings = healthRepo.getSettings()

    this.setData({
      type,
      typeName: meta.name,
      unit: meta.unit,
      dateValue: dateVal,
      timeValue: timeVal,
      today: dateVal,
      timing: type === HEALTH_TYPES.BLOOD_SUGAR ? '空腹' : '',
      height: settings.height || null
    })

    if (options.id) {
      this.setData({ isEdit: true, editId: options.id })
      this.loadRecord(options.id)
    }

    this.checkCanSave()
  },

  async loadRecord(id) {
    try {
      const record = await healthRepo.getRecord(id)
      if (!record) {
        wx.showToast({ title: '记录不存在', icon: 'none' })
        return
      }
      const d = record.recordTime ? new Date(record.recordTime) : new Date()
      this.setData({
        value: String(record.value),
        dateValue: formatDate(d),
        timeValue: formatTime(d),
        note: record.note || '',
        timing: record.timing || '',
        medicated: record.medicated === undefined ? null : record.medicated,
        medicine: record.medicine || ''
      })
      this.checkCanSave()
      this.updateBMI()
    } catch (err) {
      wx.showToast({ title: err.message, icon: 'none' })
    }
  },

  onInputValue(e) {
    this.setData({ value: e.detail.value })
    this.updateBMI()
    this.checkCanSave()
  },

  /** 体重类型实时计算 BMI */
  updateBMI() {
    if (this.data.type !== HEALTH_TYPES.WEIGHT || !this.data.height) return
    const num = parseFloat(this.data.value)
    if (isNaN(num) || num <= 0) {
      this.setData({ bmi: null, bmiCategory: '' })
      return
    }
    const bmi = calcBMI(num, this.data.height)
    this.setData({ bmi, bmiCategory: getBMICategory(bmi) })
  },

  onDateChange(e) {
    this.setData({ dateValue: e.detail.value })
    this.checkCanSave()
  },

  onTimeChange(e) {
    this.setData({ timeValue: e.detail.value })
    this.checkCanSave()
  },

  onInputNote(e) {
    this.setData({ note: e.detail.value })
  },

  onSelectTiming(e) {
    this.setData({ timing: e.currentTarget.dataset.value })
  },

  onSelectMedicated(e) {
    this.setData({ medicated: e.currentTarget.dataset.value === 'true' })
  },

  onInputMedicine(e) {
    this.setData({ medicine: e.detail.value })
  },

  checkCanSave() {
    const { value, dateValue, timeValue } = this.data
    const num = parseFloat(value)
    this.setData({
      canSave: value !== '' && !isNaN(num) && num > 0 && !!dateValue && !!timeValue
    })
  },

  async onSave() {
    const { type, value, dateValue, timeValue, note, timing, medicated, medicine, isEdit, editId } = this.data
    if (this.data.saving) return

    const numValue = parseFloat(value)
    if (isNaN(numValue) || numValue <= 0) {
      wx.showToast({ title: '请输入大于 0 的数值', icon: 'none' })
      return
    }

    const record = {
      type,
      value: numValue,
      recordTime: parseDateTime(dateValue, timeValue),
      // 用空字符串而不是 undefined：更新时传 undefined 不会清掉数据库里的旧值，
      // 用户清空备注后会以为没生效。
      note: note.trim(),
      unit: this.data.unit
    }
    if (type === HEALTH_TYPES.BLOOD_SUGAR) {
      record.timing = timing
    }
    if (type === HEALTH_TYPES.URIC_ACID) {
      record.medicated = medicated
      record.medicine = medicine.trim()
    }

    this.setData({ saving: true })
    wx.showLoading({ title: '保存中...' })
    try {
      if (isEdit) {
        await healthRepo.updateRecord(editId, record)
      } else {
        await healthRepo.addRecord(record)
      }
      wx.hideLoading()
      this.setData({ saving: false })
      wx.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => wx.navigateBack(), 800)
    } catch (err) {
      wx.hideLoading()
      this.setData({ saving: false })
      wx.showToast({ title: err.message, icon: 'none' })
    }
  },

  onDelete() {
    if (!this.data.isEdit) return
    wx.showModal({
      title: '确认删除',
      content: '删除后无法恢复，确定删除这条记录吗？',
      confirmColor: '#FF4444',
      success: async (res) => {
        if (!res.confirm) return
        wx.showLoading({ title: '删除中...' })
        try {
          await healthRepo.deleteRecord(this.data.editId)
          wx.hideLoading()
          wx.showToast({ title: '已删除', icon: 'success' })
          setTimeout(() => wx.navigateBack(), 800)
        } catch (err) {
          wx.hideLoading()
          wx.showToast({ title: err.message, icon: 'none' })
        }
      }
    })
  }
})
