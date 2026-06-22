import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(import.meta.dirname, '..')

function walk(dir, files = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) walk(full, files)
    else if (name.endsWith('.ts') || name.endsWith('.tsx')) files.push(full)
  }
  return files
}

const skip = new Set([
  path.join(ROOT, 'src', 'types', 'index.ts'),
  path.join(ROOT, 'src', 'App.tsx'),
  path.join(ROOT, 'src', 'main.tsx'),
  path.join(ROOT, 'src', 'persistence.ts'),
])

for (const file of walk(path.join(ROOT, 'src'))) {
  if (skip.has(file)) continue
  if (file.includes('vite-env')) continue
  let s = fs.readFileSync(file, 'utf8')
  const orig = s
  s = s.replace(/^function /gm, 'export function ')
  s = s.replace(/^const ([A-Z_]+) =/gm, 'export const $1 =')
  if (s !== orig) {
    fs.writeFileSync(file, s)
    console.log('exports:', path.relative(ROOT, file))
  }
}
