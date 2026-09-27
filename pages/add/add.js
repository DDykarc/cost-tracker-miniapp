const { CATEGORIES } = require('../../utils/config')
const { computeItemUsage } = require('../../utils/calc')
const { formatDate } = require('../../utils/format')
const itemRepo = require('../../utils/itemRepo')

Page({
  data: {
    isEdit: false,
    editId: null,

    name: '',
    price: '',
    buyDate: '',
    category: '',
    note: '',
    imageUrl: '',      // 预览用：本地临时路径 或 cloud:// 地址
    imageFileID: '',   // 已存在于云存储的 fileID
    imageChanged: false,

    categories: CATEGORIES,

    previewDays: 0,
    previewDailyCost: '0.0',

    today: '',
    canSave: false,
    saving: false
  },

  onLoad(options) {
    this.setData({ today: formatDate(new Date()) })

    if (options.id) {
      this.loadItem(options.id)
    }
  },

  async loadItem(id) {
    wx.showLoading({ title: '加载中...' })
    try {
      const item = await itemRepo.getItem(id)
      wx.hideLoading()
      if (!item) {
        wx.showToast({ title: '物品不存在', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1200)
        return
      }
      wx.setNavigationBarTitle({ title: '编辑物品' })
      this.setData({
        isEdit: true,
        editId: item._id,
        name: item.name || '',
        price: String(item.price),
        buyDate: item.buyDate,
        category: item.category || '',
        note: item.note || '',
        imageUrl: item.imageUrl || '',
        imageFileID: item.imageFileID || ''
      })
      this.updatePreview()
      this.checkCanSave()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: err.message, icon: 'none' })
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

  /** 选择图片（选完先压缩，再存本地临时路径用于预览） */
  onChooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const tempPath = res.tempFiles[0].tempFilePath
        wx.compressImage({
          src: tempPath,
          quality: 60,
          success: (compressed) => {
            this.setData({ imageUrl: compressed.tempFilePath, imageChanged: true })
          },
          fail: () => {
            // 压缩失败就用原图，不阻断流程
            this.setData({ imageUrl: tempPath, imageChanged: true })
          }
        })
      }
    })
  },

  onPreviewImage() {
    if (this.data.imageUrl) {
      wx.previewImage({ urls: [this.data.imageUrl] })
    }
  },

  onRemoveImage() {
    this.setData({ imageUrl: '', imageFileID: '', imageChanged: true })
  },

  checkCanSave() {
    const { name, price, buyDate } = this.data
    this.setData({
      canSave: !!(name.trim() && parseFloat(price) > 0 && buyDate)
    })
  },

  updatePreview() {
    const { name, price, buyDate } = this.data
    const numPrice = parseFloat(price)
    if (!name.trim() || !numPrice || !buyDate) {
      this.setData({ previewDays: 0, previewDailyCost: '0.0' })
      return
    }
    const usage = computeItemUsage({ price: numPrice, buyDate })
    this.setData({ previewDays: usage.daysUsed, previewDailyCost: usage.dailyCost })
  },

  /** 上传图片到云存储，resolve 出 fileID */
  uploadImage(filePath) {
    return new Promise((resolve, reject) => {
      wx.showLoading({ title: '上传图片中...' })
      wx.cloud.uploadFile({
        cloudPath: 'item_images/' + Date.now() + '-' + Math.floor(Math.random() * 1000) + '.jpg',
        filePath,
        success: (res) => {
          wx.hideLoading()
          resolve(res.fileID)
        },
        fail: (err) => {
          wx.hideLoading()
          reject(err)
        }
      })
    })
  },

  async onSave() {
    const { isEdit, editId, name, price, buyDate, category, note, imageUrl, imageFileID } = this.data
    if (!this.data.canSave || this.data.saving) return

    this.setData({ saving: true })

    const oldFileID = imageFileID
    let newFileID = imageFileID

    // 图片被移除
    if (!imageUrl) {
      newFileID = ''
    } else if (imageUrl.indexOf('cloud://') === 0) {
      // 已经是云端地址，无需重新上传
      newFileID = imageUrl
    } else if (this.data.imageChanged) {
      // 本地新选的图，需要上传
      try {
        newFileID = await this.uploadImage(imageUrl)
      } catch (err) {
        console.error('图片上传失败', err)
        newFileID = ''
        wx.showToast({ title: '图片上传失败，将只保存文字', icon: 'none', duration: 2000 })
      }
    }

    const itemData = {
      name: name.trim(),
      price: parseFloat(price),
      buyDate,
      category: category || '其他',
      note: note.trim(),
      // imageUrl 统一存 cloud:// 地址：本地临时路径在小程序重启后会失效
      imageUrl: newFileID,
      imageFileID: newFileID
    }

    try {
      if (isEdit) {
        await itemRepo.updateItem(editId, itemData)
      } else {
        itemData.createdAt = new Date().toISOString()
        await itemRepo.addItem(itemData)
      }
      this.setData({ saving: false })

      // 保存成功后，清理已经不再引用的云存储文件
      if (oldFileID && oldFileID !== newFileID) {
        wx.cloud.deleteFile({
          fileList: [oldFileID],
          fail: (err) => console.warn('清理旧图片失败（不影响数据）', err)
        })
      }

      wx.showToast({ title: isEdit ? '已更新' : '已添加', icon: 'success', duration: 1500 })
      setTimeout(() => wx.navigateBack(), 1500)
    } catch (err) {
      this.setData({ saving: false })
      wx.showToast({ title: err.message, icon: 'none' })
    }
  },

  onDelete() {
    const { editId, name, imageFileID } = this.data
    wx.showModal({
      title: '删除物品',
      content: `确定要永久删除「${name}」吗？`,
      confirmText: '删除',
      confirmColor: '#FF3B30',
      cancelText: '取消',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await itemRepo.deleteItem(editId)
          // 数据删掉后，顺带清理它引用的云存储文件
          if (imageFileID) {
            wx.cloud.deleteFile({
              fileList: [imageFileID],
              fail: (err) => console.warn('清理图片失败（不影响数据）', err)
            })
          }
          wx.showToast({
            title: '已删除',
            icon: 'success',
            duration: 1500,
            success: () => setTimeout(() => wx.navigateBack(), 1500)
          })
        } catch (err) {
          wx.showToast({ title: err.message, icon: 'none' })
        }
      }
    })
  }
})
