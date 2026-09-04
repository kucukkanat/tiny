// What a first visit actually downloads: the entry script plus everything
// index.html tells the browser to preload, gzipped one file at a time.
import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const dist = new URL('./dist/', import.meta.url).pathname
const html = readFileSync(join(dist, 'index.html'), 'utf8')
const files = [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.(?:js|css))"/g)].map(
  ([, path]) => path,
)

const total = { js: { raw: 0, gz: 0 }, css: { raw: 0, gz: 0 } }
for (const file of files) {
  const bytes = readFileSync(join(dist, file))
  const gz = gzipSync(bytes, { level: 9 }).length
  const kind = file.endsWith('.css') ? 'css' : 'js'
  total[kind].raw += bytes.length
  total[kind].gz += gz
  console.log(`${String(bytes.length).padStart(9)} ${String(gz).padStart(8)}  ${file}`)
}
const say = (name, { raw, gz }) =>
  console.log(
    `${name.padEnd(5)} ${raw.toLocaleString().padStart(11)} B raw  ${gz.toLocaleString().padStart(9)} B gzip`,
  )
console.log(`\n${files.length} files on first paint`)
say('js', total.js)
say('css', total.css)
