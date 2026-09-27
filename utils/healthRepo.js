/**
 * 健康记录数据服务
 * ====================================
 * 约定与 itemRepo 一致：成功 resolve 数据，失败 reject 带可读文案的 Error。
 */

const { COLLECTIONS, SETTINGS_KEY, DEFAULT_SETTINGS } = require('./config')
const { getCollection, getDB, getCommand, fetchAll, toFriendlyError, friendlyError } = require('./cloud')

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 查询某类型的健康记录，按记录时间倒序
 *
 * @param {string} type - blood_sugar | uric_acid | weight
 * @param {number} [days] - 只取最近 N 天；不传表示全部
 * @returns {Promise<Array>}
 */
async function getRecords(type, days) {
  try {
    const cond = { type }
    if (days) {
      cond.recordTime = getCommand().gte(Date.now() - days * DAY_MS)
    }
    // 一次 where 传全部条件。链式调用 .where().where() 是「覆盖」语义而不是合并，
    // 会把第一个 where 的条件丢掉（已用 @cloudbase/database 实测确认）。
    const query = getCollection(COLLECTIONS.HEALTH_RECORDS)
      .where(cond)
      .orderBy('recordTime', 'desc')
      .orderBy('_id', 'desc')
    return await fetchAll(query)
  } catch (err) {
    throw toFriendlyError(err, '读取健康记录失败')
  }
}

/**
 * 取单条记录
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
async function getRecord(id) {
  try {
    const res = await getCollection(COLLECTIONS.HEALTH_RECORDS).doc(id).get()
    return res.data || null
  } catch (err) {
    throw toFriendlyError(err, '读取记录失败')
  }
}

/**
 * 新增记录。小程序端写入时云端会自动补 _openid，不需要（也不能）手动设置。
 * @param {Object} record
 * @returns {Promise<string>} 新记录 _id
 */
async function addRecord(record) {
  try {
    const data = Object.assign({}, record, { createTime: getDB().serverDate() })
    const res = await getCollection(COLLECTIONS.HEALTH_RECORDS).add({ data })
    if (!res || !res._id) throw friendlyError('保存失败，请重试', 'NO_ID')
    return res._id
  } catch (err) {
    throw toFriendlyError(err, '保存失败，请重试')
  }
}

/**
 * 更新记录
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<boolean>}
 */
async function updateRecord(id, data) {
  let res
  try {
    res = await getCollection(COLLECTIONS.HEALTH_RECORDS).doc(id).update({ data })
  } catch (err) {
    throw toFriendlyError(err, '更新失败，请重试')
  }
  const updated = res && res.stats ? res.stats.updated : 0
  if (!updated) {
    throw friendlyError('这条记录不存在，或没有修改权限', 'NO_UPDATE', false)
  }
  return true
}

/**
 * 删除记录
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function deleteRecord(id) {
  let res
  try {
    res = await getCollection(COLLECTIONS.HEALTH_RECORDS).doc(id).remove()
  } catch (err) {
    throw toFriendlyError(err, '删除失败，请重试')
  }
  const removed = res && res.stats ? res.stats.removed : 0
  if (!removed) {
    throw friendlyError('这条记录不存在，或没有删除权限', 'NO_REMOVE', false)
  }
  return true
}

/**
 * 读取健康设置（身高 / 目标体重 / 对比天数 / 性别）
 * 存在本地，换设备不同步。
 * @returns {{height:number|null, targetWeight:number|null, compareDays:number, gender:string}}
 */
function getSettings() {
  try {
    const data = wx.getStorageSync(SETTINGS_KEY)
    if (data && typeof data === 'object') {
      return Object.assign({}, DEFAULT_SETTINGS, data)
    }
  } catch (e) {
    // 读取失败时退回默认值
  }
  return Object.assign({}, DEFAULT_SETTINGS)
}

/**
 * 保存健康设置
 * @param {Object} settings
 */
function saveSettings(settings) {
  wx.setStorageSync(SETTINGS_KEY, Object.assign({}, DEFAULT_SETTINGS, settings))
}

module.exports = {
  getRecords,
  getRecord,
  addRecord,
  updateRecord,
  deleteRecord,
  getSettings,
  saveSettings
}
