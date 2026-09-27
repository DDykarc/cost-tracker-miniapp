/**
 * 云函数：初始化数据库集合
 * ====================================
 * 部署后在开发者工具里右键「云端测试」调用一次即可。
 *
 * ⚠️ 这里只负责「建集合」，不负责设置权限。
 * 数据库的读写权限无法通过 wx-server-sdk 设置 —— 该 SDK 的 Database 类
 * 只有 collection / createCollection / runTransaction / startTransaction
 * 四个方法，没有 setPermission。权限只能在云开发控制台的
 * 「数据库 → 权限设置」里配置（或调用开放平台的 HTTP 接口 modifydatabaseacl）。
 *
 * 请在控制台按下面的建议设置各集合权限：
 *   items           → 仅创建者可读写
 *   health_records  → 仅创建者可读写
 *   version_info    → 所有用户可读
 *
 * 「仅创建者可读写」是预设权限，云开发会自动在查询条件里补上
 * _openid == 当前用户，因此前端代码不需要（也不应该）手写 _openid 条件。
 */
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const COLLECTIONS = ['items', 'health_records', 'version_info']

exports.main = async () => {
  const results = []

  for (const name of COLLECTIONS) {
    try {
      await db.createCollection(name)
      results.push({ name, status: 'created' })
    } catch (err) {
      const message = String((err && err.message) || '')
      if (message.indexOf('already exists') !== -1) {
        results.push({ name, status: 'already_exists' })
      } else {
        results.push({ name, status: 'error', error: message })
      }
    }
  }

  return {
    success: true,
    results,
    reminder: '集合权限需要在云开发控制台手动设置：items 与 health_records 设为「仅创建者可读写」'
  }
}
