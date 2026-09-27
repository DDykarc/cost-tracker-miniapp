/**
 * 分页拉取逻辑单测
 * 运行：node test/cloud.test.js
 *
 * 背景：小程序端单次查询最多返回 20 条（limit 的默认值和上限都是 20），
 * 传 limit(100) 不报错但会被静默截断。fetchAll 负责把数据完整取回来，
 * 这里用 mock query 验证它的分页、顺序和边界行为。
 */
const { test, group, summary, assert } = require('./runner')
const { fetchAll } = require('../utils/cloud')

/**
 * 模拟云数据库 Query：skip/limit 每次返回新对象（与真实 API 行为一致，
 * 这也是 fetchAll 能并发取多页的前提）
 */
function makeFakeQuery(allData, skip = 0, limit = 20) {
  const q = {
    count: async () => ({ total: allData.length }),
    skip: n => makeFakeQuery(allData, n, limit),
    limit: n => makeFakeQuery(allData, skip, n),
    get: async () => ({ data: allData.slice(skip, skip + limit) })
  }
  return q
}

function makeData(n) {
  const list = []
  for (let i = 0; i < n; i++) list.push({ _id: 'id' + i, value: i })
  return list
}

group('fetchAll —— 分页拉全')

test('空集合返回空数组', async () => {
  const out = await fetchAll(makeFakeQuery([]))
  assert.deepStrictEqual(out, [])
})

test('不足一页时正常返回', async () => {
  const out = await fetchAll(makeFakeQuery(makeData(5)))
  assert.strictEqual(out.length, 5)
})

test('刚好一页（20 条）不会多取', async () => {
  const out = await fetchAll(makeFakeQuery(makeData(20)))
  assert.strictEqual(out.length, 20)
})

test('21 条会跨页取全（这是原来被静默截断的场景）', async () => {
  const out = await fetchAll(makeFakeQuery(makeData(21)))
  assert.strictEqual(out.length, 21, '第 21 条不能丢')
})

test('100 条完整返回且顺序不乱、不重复', async () => {
  const out = await fetchAll(makeFakeQuery(makeData(100)))
  assert.strictEqual(out.length, 100)

  // 逐位校验：第 i 个位置必须正好是 id{i}
  out.forEach((row, i) => {
    assert.strictEqual(row._id, 'id' + i, `第 ${i} 位应是 id${i}，实际是 ${row._id}`)
  })
})

test('超过 max 上限时按上限截断（防止请求数失控）', async () => {
  const out = await fetchAll(makeFakeQuery(makeData(500)), { max: 60 })
  assert.strictEqual(out.length, 60)
})

test('单页大小由 PAGE_SIZE 决定，不是写死的 100', async () => {
  // 记录每次 get 拿到的条数，验证分页确实按 20 条切
  const pageSizes = []
  const data = makeData(45)
  function spyQuery(skip = 0, limit = 20) {
    return {
      count: async () => ({ total: data.length }),
      skip: n => spyQuery(n, limit),
      limit: n => spyQuery(skip, n),
      get: async () => {
        const slice = data.slice(skip, skip + limit)
        pageSizes.push(slice.length)
        return { data: slice }
      }
    }
  }
  const out = await fetchAll(spyQuery())
  assert.strictEqual(out.length, 45)
  assert.ok(pageSizes.every(s => s <= 20), '每次请求都不应超过 20 条：' + pageSizes.join(','))
})

summary()
