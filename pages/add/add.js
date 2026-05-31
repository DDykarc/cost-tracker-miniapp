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

const db = require('../../utils/db')

Page({
  data: {
    isEdit: false,
    editId: null,

    name: '',
    price: '',
    buyDate: '',
    category: '',
    note: '',
    imageUrl: '',
    imageFileID: '',
    imageChanged: false,

    categories: CATEGORIES,

    previewDays: 0,
    previewDailyCost: '0.0',

    today: '',
    canSave: false,
    saving: false
  },

  onLoad(options) {
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    this.setData({ today: `${y}-${m}-${d}` })

    // 编辑模式：从云端加载
    if (options.id) {
      wx.showLoading({ title: '加载中...' })
      db.getItem(options.id).then(item => {
        wx.hideLoading()
        if (item) {
          wx.setNavigationBarTitle({ title: '编辑物品' })
          this.setData({
            isEdit: true,
            editId: item._id,
            name: item.name,
            price: String(item.price),
            buyDate: item.buyDate,
            category: item.category || '',
            note: item.note || '',
            imageUrl: item.imageUrl || '',
            imageFileID: item.imageFileID || ''
          })
          this.updatePreview()
          this.checkCanSave()
        }
      })
    }
  },

  onNameInput(e) {
    this.setData({ name: e.detail.value })
    this.checkCanSave()
    this.updatePreview()
  },

  onPriceInput(e) {
    this.setData({ price: e.detail.value })
    this.checkCanSave()
    this.updatePreview()
  },

  onDateChange(e) {
    this.setData({ buyDate: e.detail.value })
    this.checkCanSave()
    this.updatePreview()
  },

  onCategorySelect(e) {
    this.setData({ category: e.currentTarget.dataset.name })
    this.checkCanSave()
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value })
  },

  // 选择图片
  onChooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const tempPath = res.tempFiles[0].tempFilePath
        // 压缩图片到 60% 质量
        wx.compressImage({
          src: tempPath,
          quality: 60,
          success: (compressed) => {
            this.setData({
              imageUrl: compressed.tempFilePath,
              imageChanged: true
            })
          },
          fail: () => {
            this.setData({
              imageUrl: tempPath,
              imageChanged: true
            })
          }
        })
      }
    })
  },

  // 预览图片
  onPreviewImage() {
    if (this.data.imageUrl) {
      wx.previewImage({ urls: [this.data.imageUrl] })
    }
  },

  // 移除图片
  onRemoveImage() {
    this.setData({
      imageUrl: '',
      imageFileID: '',
      imageChanged: true
    })
  },

  checkCanSave() {
    const { name, price, buyDate } = this.data
    this.setData({
      canSave: !!(name.trim() && parseFloat(price) > 0 && buyDate)
    })
  },

  updatePreview() {
    const { name, price, buyDate } = this.data
    if (!name.trim() || !parseFloat(price) || !buyDate) {
      this.setData({ previewDays: 0, previewDailyCost: '0.0' })
      return
    }

    const now = Date.now()
    const buyDateTime = new Date(buyDate).getTime()
    const diff = now - buyDateTime
    const daysUsed = Math.floor(diff / (1000 * 60 * 60 * 24)) + 1
    const dailyCost = (parseFloat(price) / daysUsed).toFixed(1)

    this.setData({
      previewDays: daysUsed > 0 ? daysUsed : 1,
      previewDailyCost: dailyCost
    })
  },

  // 保存到云端
  onSave() {
    const { isEdit, editId, name, price, buyDate, category, note } = this.data
    if (!this.data.canSave) return

    this.setData({ saving: true })

    const itemData = {
      name: name.trim(),
      price: parseFloat(price),
      buyDate,
      category: category || '其他',
      note: note.trim()
    }

    // 实际保存逻辑
    const doSave = (imageUrl, imageFileID) => {
      if (imageUrl) itemData.imageUrl = imageUrl
      if (imageFileID) itemData.imageFileID = imageFileID

      if (isEdit) {
        // 图片被移除时清理字段
        if (!this.data.imageUrl && !this.data.imageFileID) {
          itemData.imageUrl = ''
          itemData.imageFileID = ''
        }
        db.updateItem(editId, itemData).then(success => {
          this.setData({ saving: false })
          if (success) {
            wx.showToast({ title: '已更新', icon: 'success', duration: 1500 })
            setTimeout(() => wx.navigateBack(), 1500)
          }
        })
      } else {
        itemData.createdAt = new Date().toISOString()
        db.addItem(itemData).then(newId => {
          this.setData({ saving: false })
          if (newId) {
            wx.showToast({ title: '已添加', icon: 'success', duration: 1500 })
            setTimeout(() => wx.navigateBack(), 1500)
          }
        })
      }
    }

    // 需要上传新图片
    if (this.data.imageUrl && this.data.imageChanged && !this.data.imageUrl.startsWith('cloud://')) {
      wx.showLoading({ title: '上传图片中...' })
      const cloudPath = 'item_images/' + Date.now() + '.jpg'
      wx.cloud.uploadFile({
        cloudPath,
        filePath: this.data.imageUrl,
        success: (res) => {
          wx.hideLoading()
          doSave(this.data.imageUrl, res.fileID)
        },
        fail: (err) => {
          wx.hideLoading()
          console.error('图片上传失败', err)
          wx.showToast({ title: '图片上传失败，仅保存文字', icon: 'none' })
          doSave('', '')
        }
      })
    } else {
      doSave(this.data.imageUrl, this.data.imageFileID)
    }
  },

  // 从云端删除
  onDelete() {
    const { editId, name } = this.data
    wx.showModal({
      title: '删除物品',
      content: `确定要永久删除「${name}」吗？`,
      confirmText: '删除',
      confirmColor: '#FF3B30',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          db.deleteItem(editId).then(success => {
            if (success) {
              wx.showToast({
                title: '已删除',
                icon: 'success',
                duration: 1500,
                success: () => setTimeout(() => wx.navigateBack(), 1500)
              })
            }
          })
        }
      }
    })
  }
})
