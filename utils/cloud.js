/**
 * 云开发基础设施
 * ====================================
 * 只做三件事：初始化云环境、归一化错误、分页拉取数据。
 * 不包含业务逻辑，也不弹任何 UI 提示 —— 提示交给页面自己决定。
 */

const { CLOUD_ENV, PAGE_SIZE, MAX_FETCH } = require('./config')

let _db = null

/**
 * 初始化云开发。在 app.js 的 onLaunch 里调用一次即可。
 * 重复调用是安全的（内部只初始化一次）。
 */
function initCloud() {
  if (!wx.cloud) {
    throw new Error('当前微信基础库不支持云开发，请升级微信客户端')
  }
  if (_db) return _db
  wx.cloud.init({ env: CLOUD_ENV })
  _db = wx.cloud.database()
  return _db
}

/** 取数据库实例（首次调用时自动初始化） */
function getDB() {
  return _db || initCloud()
}

/** 取查询指令对象（_.gte 等） */
function getCommand() {
  return getDB().command
}

/** 取集合引用 */
function getCollection(name) {
  return getDB().collection(name)
}

/**
 * 云开发官方错误码 → 用户可读文案。
 * 码值取自 wx-server-sdk 源码常量表，其中 -502005 是「集合不存在」而非权限错误。
 */
const ERROR_MESSAGES = {
  '-502001': '数据库请求失败，请重试',
  '-502002': '查询条件不合法',
  '-502003': '没有权限访问该数据',
  '-502004': '集合数量已达上限',
  '-502005': '数据集合不存在，请先在云开发控制台创建',
  '-602001': '查询结果过大，请缩小范围',
  '-601001': '服务暂时不可用，请稍后重试',
  '-601003': '网络异常，请检查网络后重试',
  '-601008': '请求超时，请重试'
}

/** 这些错误重试没有意义（条件错/权限错/集合不存在） */
const NON_RETRYABLE = ['-502002', '-502003', '-502004', '-502005']

/**
 * 构造一个带用户可读文案的错误对象
 * @param {string} message
 * @param {string} [code]
 * @param {boolean} [retryable]
 */
function friendlyError(message, code = 'APP', retryable = true) {
  const e = new Error(message)
  e.code = code
  e.retryable = retryable
  return e
}

/**
 * 把云端返回的原始错误转成带可读文案的 Error
 * @param {*} err
 * @param {string} [fallbackMessage]
 * @returns {Error}
 */
function toFriendlyError(err, fallbackMessage = '操作失败，请重试') {
  if (err && err.code && err.retryable !== undefined) return err

  const rawCode = err && (err.errCode !== undefined ? err.errCode : err.code)
  const code = rawCode === undefined || rawCode === null ? '' : String(rawCode)
  const rawText = String((err && (err.errMsg || err.message)) || '')

  if (ERROR_MESSAGES[code]) {
    return friendlyError(ERROR_MESSAGES[code], code, !NON_RETRYABLE.includes(code))
  }
  if (/timeout/i.test(rawText)) {
    return friendlyError('请求超时，请重试', code || 'TIMEOUT', true)
  }
  if (/network|请求失败/i.test(rawText)) {
    return friendlyError('网络异常，请检查网络后重试', code || 'NETWORK', true)
  }
  const e = friendlyError(fallbackMessage, code || 'UNKNOWN', true)
  e.raw = rawText
  return e
}

/**
 * 分页拉取全部数据。
 *
 * 为什么必须有它：小程序端单次查询最多只返回 20 条
 * （limit 的「默认值和最大上限」都是 20，云函数端才是 1000）。
 * 传 limit(100) 不会报错，但会被服务端静默截断成 20 条，看起来就像数据丢了。
 *
 * 实现：先 count 拿总数，再分批并发拉取所有页。
 * 调用方必须给 query 加上稳定的二级排序（orderBy('_id')），
 * 否则排序字段有重复值时，分页之间可能重复或遗漏记录。
 *
 * @param {Object} baseQuery - 已带 where/orderBy 的 Query 对象
 * @param {{max?:number, batchSize?:number}} [options]
 * @returns {Promise<Array>}
 */
async function fetchAll(baseQuery, options = {}) {
  const max = options.max || MAX_FETCH
  const batchSize = options.batchSize || 5

  const countRes = await baseQuery.count()
  const total = Math.min(countRes.total || 0, max)
  if (total === 0) return []

  const pageCount = Math.ceil(total / PAGE_SIZE)
  let list = []
  for (let i = 0; i < pageCount; i += batchSize) {
    const tasks = []
    const end = Math.min(i + batchSize, pageCount)
    for (let p = i; p < end; p++) {
      tasks.push(baseQuery.skip(p * PAGE_SIZE).limit(PAGE_SIZE).get())
    }
    const results = await Promise.all(tasks)
    results.forEach(res => {
      list = list.concat(res.data || [])
    })
  }
  return list
}

module.exports = {
  initCloud,
  getDB,
  getCommand,
  getCollection,
  friendlyError,
  toFriendlyError,
  fetchAll,
  PAGE_SIZE
}
