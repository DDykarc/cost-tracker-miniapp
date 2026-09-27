const { CATEGORIES } = require('../../utils/config')
const { computeItemsUsage } = require('../../utils/calc')
const itemRepo = require('../../utils/itemRepo')

Page({
  data: {
    items: [],
    filteredItems: [],
    totalSpent: '0.0',
    dailyTotal: '0.0',
    categories: CATEGORIES,
    selectedCategory: '全部',
    loading: true,
    error: null
  },

  onShow() {
    // 已有数据时静默刷新，避免每次返回首页都闪一下 loading
    this.loadData({ silent: this.data.items.length > 0 })
  },

  onPullDownRefresh() {
    this.loadData({ silent: true }).finally(() => wx.stopPullDownRefresh())
  },

  /**
   * 加载物品列表
   * @param {{silent?:boolean}} [options]
   */
  async loadData(options = {}) {
    if (!options.silent) this.setData({ loading: true })
    this.setData({ error: null })

    let raw
    try {
      raw = await itemRepo.getAllItems()
    } catch (err) {
      // 读取失败要和「确实没有数据」区分开，否则用户会以为数据丢了
      this.setData({ loading: false, error: { message: err.message, retryable: err.retryable } })
      return
    }

    // 首次使用：把老版本存在本地的数据迁移到云端
    if (raw.length === 0) {
      const localItems = wx.getStorageSync('items') || []
      if (localItems.length > 0) {
        this.setData({ loading: false })
        this.migrateLocalToCloud(localItems)
        return
      }
    }

    this.renderItems(raw)
    this.setData({ loading: false })
  },

  /** 把本地存储里的旧数据迁移到云端 */
  async migrateLocalToCloud(localItems) {
    wx.showLoading({ title: '同步数据中...' })
    try {
      await Promise.all(localItems.map(item => itemRepo.addItem(item)))
      // 迁移成功后清除本地数据，重新从云端加载
      wx.setStorageSync('items', [])
      wx.hideLoading()
      this.loadData({ silent: true })
    } catch (err) {
      wx.hideLoading()
      // 不清除本地数据，保留恢复机会
      this.setData({ error: { message: '数据同步失败：' + err.message, retryable: true } })
    }
  },

  /** 渲染数据：补上已用天数、日均成本、成本等级 */
  renderItems(rawItems) {
    const items = computeItemsUsage(rawItems)
    this.setData({
      items,
      totalSpent: this.calcTotalSpent(items),
      dailyTotal: this.calcDailyTotal(items)
    })
    this.applyFilter()
  },

  /** 应用分类筛选 */
  applyFilter() {
    const { items, selectedCategory } = this.data
    const filtered = selectedCategory === '全部'
      ? items
      : items.filter(i => i.category === selectedCategory)
    this.setData({ filteredItems: filtered })
  },

  onFilterCategory(e) {
    const cat = e.currentTarget.dataset.category
    this.setData({ selectedCategory: cat }, () => this.applyFilter())
  },

  calcTotalSpent(items) {
    return items.reduce((sum, i) => sum + (parseFloat(i.price) || 0), 0).toFixed(1)
  },

  calcDailyTotal(items) {
    return items.reduce((sum, i) => sum + (parseFloat(i.dailyCost) || 0), 0).toFixed(1)
  },

  onAddItem() {
    wx.navigateTo({ url: '/pages/add/add' })
  },

  onEditItem(e) {
    wx.navigateTo({ url: `/pages/add/add?id=${e.currentTarget.dataset.id}` })
  },

  onViewChart(e) {
    wx.navigateTo({ url: `/pages/chart/chart?id=${e.currentTarget.dataset.id}` })
  },

  onViewReport() {
    wx.navigateTo({ url: '/pages/report/report' })
  },

  onViewAllChart() {
    wx.navigateTo({ url: '/pages/chart/chart?all=true' })
  },

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
      success: async (res) => {
        if (!res.confirm) return
        try {
          await itemRepo.deleteItem(id)
          wx.showToast({ title: '已删除', icon: 'success', duration: 1500 })
          this.loadData({ silent: true })
        } catch (err) {
          wx.showToast({ title: err.message, icon: 'none' })
        }
      }
    })
  }
})
