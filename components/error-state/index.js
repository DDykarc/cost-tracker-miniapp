Component({
  properties: {
    /** 错误文案 */
    message: { type: String, value: '加载失败' },
    /** 是否显示「重新加载」按钮（权限类错误重试也没用，就不显示） */
    retryable: { type: Boolean, value: true }
  },
  methods: {
    onRetry() {
      this.triggerEvent('retry')
    }
  }
})
