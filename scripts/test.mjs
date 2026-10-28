// Corre todos los src/*.test.mjs (son scripts con assert: fallan con código ≠ 0).
// `npm test` — auditoría 2026-10-27, hallazgo C-6: los tests existían pero nada los ejecutaba.
import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = path.join(raiz, 'src')
const tests = readdirSync(dir).filter(f => f.endsWith('.test.mjs')).sort()
let fallidos = 0
for (const t of tests) {
  const r = spawnSync(process.execPath, [path.join(dir, t)], { stdio: 'inherit' })
  if (r.status !== 0) { fallidos++; console.error('FALLA ' + t) }
}
console.log(`\n${tests.length - fallidos}/${tests.length} archivos de prueba OK`)
process.exit(fallidos ? 1 : 0)
