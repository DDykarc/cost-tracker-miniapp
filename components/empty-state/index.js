Component({
  properties: {
    icon: { type: String, value: '📭' },
    title: { type: String, value: '暂无数据' },
    desc: { type: String, value: '' },
    /** 紧凑模式：用于列表页内部的空态，上下留白更小 */
    compact: { type: Boolean, value: false }
  }
})
