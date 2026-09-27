const { initCloud } = require('./utils/cloud')

App({
  onLaunch() {
    // 云开发在这里初始化一次，所有数据服务都复用这个实例。
    // 原来是在 utils/db.js 和 utils/healthDb.js 里各 init 一次，
    // 靠给 wx.cloud 挂私有属性去重，初始化时机取决于模块加载顺序。
    try {
      initCloud()
    } catch (err) {
      console.error('云开发初始化失败', err)
      wx.showModal({
        title: '初始化失败',
        content: err.message || '云开发初始化失败，请升级微信后重试',
        showCancel: false
      })
    }
  },
  globalData: {}
})
