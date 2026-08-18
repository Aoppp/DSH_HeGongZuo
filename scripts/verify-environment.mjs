import { readFile } from 'node:fs/promises'

const minimumNodeVersion = [22, 19, 0]
const currentNodeVersion = process.versions.node.split('.').map(Number)

/**
 * @param {number[]} left
 * @param {number[]} right
 */
function compareVersions(left, right) {
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

if (compareVersions(currentNodeVersion, minimumNodeVersion) < 0) {
  console.error(
    `Node.js ${process.versions.node} 不满足要求，请升级到 22.19.0 或更高版本。`,
  )
  process.exitCode = 1
} else {
  console.log(`Node.js ${process.versions.node}: OK`)
}

const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
)

if (packageJson.devDependencies?.['@deepseek-ai/dsh'] !== '0.1.0-rc.6') {
  console.error('DSH 必须精确锁定为 0.1.0-rc.6。')
  process.exitCode = 1
} else {
  console.log('DSH 0.1.0-rc.6: OK')
}

if (packageJson.packageManager !== 'pnpm@11.7.0') {
  console.error('pnpm 必须锁定为 11.7.0。')
  process.exitCode = 1
} else {
  console.log('pnpm 11.7.0: OK')
}
