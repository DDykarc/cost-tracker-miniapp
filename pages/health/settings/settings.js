const { calcBMI, getBMICategory } = require('../../../utils/calc')
const healthRepo = require('../../../utils/healthRepo')

Page({
  data: {
    height: '',
    targetWeight: '',
    compareDays: 1,
    gender: 'male',
    compareOptions: [
      { value: 1, label: '1天前' },
      { value: 3, label: '3天前' },
      { value: 7, label: '7天前' },
      { value: 30, label: '30天前' }
    ],
    bmi: null,
    bmiCategory: '',
    bmiCategoryClass: ''
  },

  onLoad() {
    const settings = healthRepo.getSettings()
    this.setData({
      height: settings.height ? String(settings.height) : '',
      targetWeight: settings.targetWeight ? String(settings.targetWeight) : '',
      compareDays: settings.compareDays || 1,
      gender: settings.gender || 'male'
    }, () => this.calcBMI())
  },

  onSelectGender(e) {
    this.setData({ gender: e.currentTarget.dataset.value })
  },

  onInputHeight(e) {
    this.setData({ height: e.detail.value }, () => this.calcBMI())
  },

  onInputTargetWeight(e) {
    this.setData({ targetWeight: e.detail.value }, () => this.calcBMI())
  },

  onSelectCompareDays(e) {
    this.setData({ compareDays: parseInt(e.currentTarget.dataset.value, 10) })
  },

  onSave() {
    const { height, targetWeight, compareDays, gender } = this.data
    healthRepo.saveSettings({
      height: parseFloat(height) || null,
      targetWeight: parseFloat(targetWeight) || null,
      compareDays,
      gender
    })
    wx.showToast({ title: '保存成功', icon: 'success' })
    setTimeout(() => wx.navigateBack(), 800)
  },

  onAbout() {
    wx.navigateTo({ url: '/pages/about/about' })
  },

  /** 用「身高 + 目标体重」估算 BMI，给用户一个参照 */
  calcBMI() {
    const h = parseFloat(this.data.height)
    const w = parseFloat(this.data.targetWeight)
    if (!h || !w) {
      this.setData({ bmi: null, bmiCategory: '', bmiCategoryClass: '' })
      return
    }
    const bmi = calcBMI(w, h)
    const category = getBMICategory(bmi)
    const categoryClass = category === '正常' ? 'normal' : (category === '偏瘦' ? 'low' : 'high')
    this.setData({ bmi, bmiCategory: category, bmiCategoryClass: categoryClass })
  }
})
