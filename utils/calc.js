/**
 * 业务计算（纯函数，不依赖 wx API，可在 Node 中直接单测）
 * ====================================
 * 原来「已用天数 + 日均成本」这套算法在 index.js 和 chart.js 各写了一遍，
 * 两处必须同步修改，这里合并成唯一实现。
 */

const { REF_RANGE } = require('./config')

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 成本等级：决定列表里的红/橙/绿配色
 * @param {number} daysUsed
 * @param {number} dailyCost
 * @returns {'cost-green'|'cost-orange'|'cost-red'}
 */
function costLevelOf(daysUsed, dailyCost) {
  if (daysUsed <= 30 && dailyCost >= 10) return 'cost-red'
  if (dailyCost >= 5) return 'cost-orange'
  return 'cost-green'
}

/**
 * 计算一件物品的使用天数、日均成本与成本等级
 * @param {Object} item - 至少包含 price、buyDate
 * @param {number} [now] - 当前时间戳，默认 Date.now()（显式传入便于测试）
 * @returns {{daysUsed:number, dailyCost:string, costLevel:string}}
 */
function computeItemUsage(item, now = Date.now()) {
  const buyTime = new Date(item.buyDate).getTime()
  // 购买当天记为第 1 天；购买日期若异常（未来/非法）则兜底为 1 天，避免出现 0 或负数
  const daysUsed = Math.max(1, Math.floor((now - buyTime) / DAY_MS) + 1)
  const dailyCost = item.price / daysUsed
  const dailyCostText = dailyCost.toFixed(1)
  return {
    daysUsed,
    dailyCost: dailyCostText,
    // 用「显示出来的值」判等级，否则会出现显示 ¥10.0 却标成绿色的不一致
    costLevel: costLevelOf(daysUsed, parseFloat(dailyCostText))
  }
}

/**
 * 批量计算物品列表
 * @param {Array} items
 * @param {number} [now]
 */
function computeItemsUsage(items, now = Date.now()) {
  return (items || []).map(item => Object.assign({}, item, computeItemUsage(item, now)))
}

/**
 * 计算 BMI
 * @param {number} weight - kg
 * @param {number} height - cm
 * @returns {number|null}
 */
function calcBMI(weight, height) {
  if (!weight || !height || height <= 0) return null
  return Math.round((weight / ((height / 100) ** 2)) * 10) / 10
}

/**
 * BMI 分类（中国成人标准）
 * @param {number|null} bmi
 * @returns {string}
 */
function getBMICategory(bmi) {
  if (bmi === null || bmi === undefined || isNaN(bmi)) return ''
  if (bmi < 18.5) return '偏瘦'
  if (bmi < 24) return '正常'
  if (bmi < 28) return '偏胖'
  return '肥胖'
}

/**
 * 取某个健康类型的参考范围
 * @param {string} type
 * @param {{timing?:string, gender?:string}} options
 * @returns {{min:number, max:number}|null}
 */
function getRefRange(type, options = {}) {
  if (type === 'blood_sugar') {
    return REF_RANGE.blood_sugar[options.timing || '空腹'] || null
  }
  if (type === 'uric_acid') {
    return REF_RANGE.uric_acid[options.gender || 'male'] || null
  }
  return null
}

/**
 * 判断数值状态
 * @param {string} type
 * @param {number} value
 * @param {{timing?:string, gender?:string}} options
 * @returns {'normal'|'high'|'low'|'unknown'}
 */
function getStatus(type, value, options = {}) {
  const range = getRefRange(type, options)
  if (!range) return 'unknown'
  if (value < range.min) return 'low'
  if (value > range.max) return 'high'
  return 'normal'
}

/**
 * 统计一组健康记录
 * @param {Array} records
 * @returns {{max:number|null, min:number|null, avg:number|null, latest:number|null, latestTime:number|null, count:number}}
 */
function calcStats(records) {
  if (!records || records.length === 0) {
    return { max: null, min: null, avg: null, latest: null, latestTime: null, count: 0 }
  }
  let max = -Infinity
  let min = Infinity
  let sum = 0
  let latest = records[0]
  for (let i = 0; i < records.length; i++) {
    const r = records[i]
    if (r.value > max) max = r.value
    if (r.value < min) min = r.value
    sum += r.value
    if (r.recordTime > latest.recordTime) latest = r
  }
  return {
    max,
    min,
    avg: Math.round((sum / records.length) * 100) / 100,
    latest: latest.value,
    latestTime: latest.recordTime,
    count: records.length
  }
}

/**
 * 把记录按时间倒序排列（不修改原数组）
 * @param {Array} records
 */
function sortByTimeDesc(records) {
  return [...(records || [])].sort((a, b) => b.recordTime - a.recordTime)
}

/** 按时间正序排列（不修改原数组） */
function sortByTimeAsc(records) {
  return [...(records || [])].sort((a, b) => a.recordTime - b.recordTime)
}

module.exports = {
  costLevelOf,
  computeItemUsage,
  computeItemsUsage,
  calcBMI,
  getBMICategory,
  getRefRange,
  getStatus,
  calcStats,
  sortByTimeDesc,
  sortByTimeAsc
}
