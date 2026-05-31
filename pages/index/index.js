const app = getApp()
const db = require('../../utils/db')

// 预设分类（名称 + 图标）
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

Page({
  data: {
    items: [],
    filteredItems: [],
    totalSpent: 0,
    dailyTotal: 0,
    categories: CATEGORIES,
    selectedCategory: '全部'
  },

  onShow() {
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData()
  },

  // 加载数据（从云端）
  loadData() {
    wx.showLoading({ title: '加载中...' })
    db.getAllItems().then(items => {
      if (items.length === 0) {
        // 首次使用：尝试从本地存储迁移
        const localItems = wx.getStorageSync('items') || []
        if (localItems.length > 0) {
          this.migrateLocalToCloud(localItems)
          return
        }
      }
      wx.hideLoading()
      this.renderItems(items)
      wx.stopPullDownRefresh()
    })
  },

  // 从本地存储迁移到云端
  migrateLocalToCloud(localItems) {
    wx.showLoading({ title: '同步数据中...' })
    const promises = localItems.map(item => db.addItem(item))
    Promise.all(promises).then(() => {
      wx.hideLoading()
      // 迁移成功后清除本地数据，重新从云端加载
      wx.setStorageSync('items', [])
      this.loadData()
    }).catch(err => {
      wx.hideLoading()
      console.error('数据迁移失败', err)
      wx.showToast({ title: '同步失败，请重试', icon: 'none' })
      // 不清除本地数据，保留恢复机会
    })
  },

  // 渲染数据
  renderItems(items) {
    const processed = this.processItems(items)
    this.setData({
      items: processed,
      totalSpent: this.calcTotalSpent(items),
      dailyTotal: this.calcDailyTotal(processed)
    })
    this.applyFilter()
  },

  // 应用分类筛选
  applyFilter() {
    const { items, selectedCategory } = this.data
    const filtered = selectedCategory === '全部'
      ? items
      : items.filter(i => i.category === selectedCategory)
    this.setData({ filteredItems: filtered })
  },

  // 分类筛选
  onFilterCategory(e) {
    const cat = e.currentTarget.dataset.category
    this.setData({ selectedCategory: cat }, () => {
      this.applyFilter()
    })
  },

  // 处理数据：计算已用天数和日均成本
  processItems(items) {
    const now = Date.now()
    return items.map(item => {
      const buyDate = new Date(item.buyDate)
      const diff = now - buyDate.getTime()
      const daysUsed = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1
      const dailyCost = (item.price / daysUsed).toFixed(1)

      let costLevel = 'cost-green'
      if (daysUsed <= 30 && dailyCost >= 10) costLevel = 'cost-red'
      else if (dailyCost >= 5) costLevel = 'cost-orange'

      return { ...item, daysUsed, dailyCost, costLevel }
    })
  },

  calcTotalSpent(items) {
    return items.reduce((sum, item) => sum + item.price, 0).toFixed(1)
  },

  calcDailyTotal(items) {
    const total = items.reduce((sum, item) => sum + parseFloat(item.dailyCost), 0)
    return total.toFixed(1)
  },

  onAddItem() {
    wx.navigateTo({ url: '/pages/add/add' })
  },

  // 编辑商品（传 _id）
  onEditItem(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/add/add?id=${id}` })
  },

  // 查看趋势图
  onViewChart(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: `/pages/chart/chart?id=${id}` })
  },

  onViewReport() {
    wx.navigateTo({ url: "/pages/report/report" })
  },

  onViewAllChart() {
    wx.navigateTo({ url: '/pages/chart/chart?all=true' })
  },

  // 长按删除（从云端删除）
  onDeleteItem(e) {
    const id = e.currentTarget.dataset.id
    const item = this.data.items.find(i => i._id === id)
    if (!item) return

    wx.showModal({
      title: '删除物品',
      content: `确定要删除「${item.name}」吗？`,
      confirmText: '删除',
      confirmColor: '#FF3B30',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          db.deleteItem(id).then(success => {
            if (success) {
              this.loadData()
              wx.showToast({ title: '已删除', icon: 'success', duration: 1500 })
            }
          })
        }
      }
    })
  }
})
