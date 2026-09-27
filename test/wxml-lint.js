/**
 * WXML 结构自检（临时脚本）
 * 检查标签配对、自闭合写法、组件引用是否存在
 * 用法：node test/wxml-lint.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
// 不预设「自闭合标签」名单：WXML 里 image 等既可以写成 <image /> 也可以写成
// <image></image>，统一按「自闭合」或「配对」两种合法形式处理即可。
const VOID_TAGS = []

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'miniprogram_npm') continue
    const full = path.join(dir, name)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) walk(full, out)
    else if (name.endsWith('.wxml')) out.push(full)
  }
  return out
}

let problems = 0

for (const file of walk(ROOT)) {
  const rel = path.relative(ROOT, file)
  // 先把 {{ ... }} 表达式整体替换掉，否则表达式里的 > 会被当成标签结束
  const src = fs.readFileSync(file, 'utf8').replace(/\{\{[\s\S]*?\}\}/g, 'EXPR')
  const stack = []
  const tagRe = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g
  let m

  while ((m = tagRe.exec(src)) !== null) {
    const closing = m[1] === '/'
    const tag = m[2]
    const selfClose = m[4] === '/'
    if (closing) {
      const top = stack.pop()
      if (top !== tag) {
        console.log(`  [标签不匹配] ${rel}: </${tag}> 对应的是 <${top || '空'}>`)
        problems++
      }
    } else if (!selfClose && VOID_TAGS.indexOf(tag) === -1) {
      stack.push(tag)
    }
  }
  if (stack.length) {
    console.log(`  [标签未闭合] ${rel}: ${stack.join(' > ')}`)
    problems++
  }
}

// 检查 usingComponents 引用的组件文件是否存在
const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'))
for (const page of appJson.pages) {
  const jsonPath = path.join(ROOT, page + '.json')
  if (!fs.existsSync(jsonPath)) continue
  const conf = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
  const comps = conf.usingComponents || {}
  for (const key of Object.keys(comps)) {
    const compPath = path.join(ROOT, comps[key].replace(/^\//, ''))
    if (!fs.existsSync(compPath + '.wxml')) {
      console.log(`  [组件缺失] ${page}.json 引用了 ${comps[key]}，但找不到 ${compPath}.wxml`)
      problems++
    }
  }
}

// 检查 app.json 里声明的页面是否都存在
for (const page of appJson.pages) {
  for (const ext of ['.js', '.json', '.wxml']) {
    if (!fs.existsSync(path.join(ROOT, page + ext))) {
      console.log(`  [页面文件缺失] ${page}${ext}`)
      problems++
    }
  }
}

console.log(problems === 0 ? '\nWXML / 配置自检通过' : `\n发现 ${problems} 个问题`)
process.exitCode = problems === 0 ? 0 : 1
