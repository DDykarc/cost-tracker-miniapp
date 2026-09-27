/**
 * 格式化工具（纯函数，不依赖 wx API，可在 Node 中直接单测）
 * ====================================
 * 原来这些逻辑散落在 6 个页面里各写一遍，格式还略有出入。
 */

function pad2(n) {
  return String(n).padStart(2, '0')
}

/**
 * 把时间戳格式化为「M/D HH:mm」
 * @param {number} ts
 * @returns {string}
 */
function formatShortDateTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

/**
 * 把时间戳格式化为「M/D」
 * @param {number} ts
 * @returns {string}
 */
function formatShortDate(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

/**
 * 把 Date 格式化为「YYYY-MM-DD」（本地时间）
 * @param {Date} date
 * @returns {string}
 */
function formatDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/**
 * 把 Date 格式化为「HH:mm」（本地时间）
 * @param {Date} date
 * @returns {string}
 */
function formatTime(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

/**
 * 把「YYYY-MM-DD」+「HH:mm」解析为时间戳。
 * 手动拆解而不是 new Date(string)：iOS 对带空格的日期字符串解析不稳定，
 * 这是小程序里的经典坑。
 * @param {string} dateStr "YYYY-MM-DD"
 * @param {string} timeStr "HH:mm"
 * @returns {number}
 */
function parseDateTime(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  return new Date(y, m - 1, d, hh, mm).getTime()
}

/**
 * 天数标签：满一年显示「x.x年」，否则显示「x天」
 * @param {number} days
 * @returns {string}
 */
function formatDays(days) {
  return days >= 365 ? `${(days / 365).toFixed(1)}年` : `${days}天`
}

module.exports = {
  pad2,
  formatShortDateTime,
  formatShortDate,
  formatDate,
  formatTime,
  parseDateTime,
  formatDays
}
