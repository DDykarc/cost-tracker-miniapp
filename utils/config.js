/**
 * 全局配置与业务常量
 * ====================================
 * 全项目唯一的配置来源：环境 ID、集合名、分类、健康类型、参考范围都在这里。
 * 新增一个分类或健康类型时，只需要改这个文件。
 */

/** 云开发环境 ID */
const CLOUD_ENV = 'cloud1-d5gt7eqr59e199765'

/** 云数据库集合名 */
const COLLECTIONS = {
  ITEMS: 'items',
  HEALTH_RECORDS: 'health_records',
  VERSION_INFO: 'version_info'
}

/**
 * 单页查询条数。
 * 重要：小程序端 limit 的默认值「和最大上限」都是 20（云函数端才是 1000）。
 * 传更大的值不会报错，但会被服务端静默截断到 20 条 —— 这是本项目的核心坑，
 * 所有「可能超过 20 条」的查询都必须走 cloud.js 的 fetchAll 分页。
 */
const PAGE_SIZE = 20

/** 单次全量拉取的条数上限，防止数据量过大时并发请求失控 */
const MAX_FETCH = 1000

/** 物品分类（首页 / 添加页 / 报表页共用） */
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

/** 健康记录类型 */
const HEALTH_TYPES = {
  BLOOD_SUGAR: 'blood_sugar',
  URIC_ACID: 'uric_acid',
  WEIGHT: 'weight'
}

/**
 * 健康类型的展示信息（名称 / 单位 / 颜色 / 图标）
 * 原来这段映射重复散落在 4 个页面里，改一处容易漏三处。
 */
const HEALTH_TYPE_META = {
  blood_sugar: { name: '血糖', unit: 'mmol/L', color: '#FF6B6B', icon: '🩸' },
  uric_acid: { name: '尿酸', unit: 'μmol/L', color: '#4ECDC4', icon: '💊' },
  weight: { name: '体重', unit: 'kg', color: '#45B7D1', icon: '⚖️' }
}

/** 血糖测量时机 */
const SUGAR_TIMING = ['空腹', '餐后1小时', '餐后2小时', '随机血糖', '睡前']

/**
 * 健康参考范围
 * 血糖按测量时机分类（mmol/L）；尿酸按性别分类（μmol/L）。
 * 注意：这只是内置默认值，页面展示时应当从 getRefRange() 取，不要直接读这里。
 */
const REF_RANGE = {
  blood_sugar: {
    空腹: { min: 3.9, max: 6.1 },
    餐后1小时: { min: 0, max: 11.1 },
    餐后2小时: { min: 0, max: 7.8 },
    随机血糖: { min: 0, max: 11.1 },
    睡前: { min: 3.9, max: 6.1 }
  },
  uric_acid: {
    male: { min: 208, max: 428 },
    female: { min: 155, max: 357 }
  }
}

/** 健康设置的默认值 */
const DEFAULT_SETTINGS = {
  height: null,
  targetWeight: null,
  compareDays: 1,
  gender: 'male'
}

/** 健康设置在本地的存储键 */
const SETTINGS_KEY = 'health_settings'

/** 报表分类配色 */
const CHART_COLORS = [
  '#00C853', '#FF6B6B', '#4ECDC4', '#FFD93D', '#6C5CE7',
  '#FF8A65', '#45B7D1', '#F06292', '#90A4AE'
]

module.exports = {
  CLOUD_ENV,
  COLLECTIONS,
  PAGE_SIZE,
  MAX_FETCH,
  CATEGORIES,
  HEALTH_TYPES,
  HEALTH_TYPE_META,
  SUGAR_TIMING,
  REF_RANGE,
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  CHART_COLORS
}
