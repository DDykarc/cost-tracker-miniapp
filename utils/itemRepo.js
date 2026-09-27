/**
 * 物品数据服务（回本清单）
 * ====================================
 * 约定：成功时 resolve 数据；失败时 reject 一个带 message/code/retryable 的 Error。
 * 「空数组」表示确实没有数据，「reject」表示读取失败 —— 两者必须区分，
 * 否则网络异常时页面会显示成「还没有物品」，让用户以为数据丢了。
 */

const { COLLECTIONS } = require('./config')
const { getCollection, fetchAll, toFriendlyError, friendlyError } = require('./cloud')

/**
 * 拉取全部物品（自动分页，最多 1000 条），按创建时间倒序
 * @returns {Promise<Array>}
 */
async function getAllItems() {
  try {
    const query = getCollection(COLLECTIONS.ITEMS)
      .orderBy('createdAt', 'desc')
      .orderBy('_id', 'desc')
    return await fetchAll(query)
  } catch (err) {
    throw toFriendlyError(err, '读取物品失败')
  }
}

/**
 * 按 _id 取单个物品
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
async function getItem(id) {
  try {
    const res = await getCollection(COLLECTIONS.ITEMS).doc(id).get()
    return res.data || null
  } catch (err) {
    throw toFriendlyError(err, '读取物品失败')
  }
}

/**
 * 新增物品
 * @param {Object} item
 * @returns {Promise<string>} 新记录的 _id
 */
async function addItem(item) {
  try {
    const res = await getCollection(COLLECTIONS.ITEMS).add({ data: item })
    if (!res || !res._id) throw friendlyError('保存失败，请重试', 'NO_ID')
    return res._id
  } catch (err) {
    throw toFriendlyError(err, '保存失败，请重试')
  }
}

/**
 * 更新物品
 * 注意：权限为「仅创建者可读写」时，更新别人的记录不会报错，
 * 只会返回 updated: 0。所以这里必须显式检查影响条数。
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<boolean>}
 */
async function updateItem(id, data) {
  let res
  try {
    res = await getCollection(COLLECTIONS.ITEMS).doc(id).update({ data })
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
 * 删除物品
 * @param {string} id
 * @returns {Promise<boolean>}
 */
async function deleteItem(id) {
  let res
  try {
    res = await getCollection(COLLECTIONS.ITEMS).doc(id).remove()
  } catch (err) {
    throw toFriendlyError(err, '删除失败，请重试')
  }
  const removed = res && res.stats ? res.stats.removed : 0
  if (!removed) {
    throw friendlyError('这条记录不存在，或没有删除权限', 'NO_REMOVE', false)
  }
  return true
}

module.exports = {
  getAllItems,
  getItem,
  addItem,
  updateItem,
  deleteItem
}
