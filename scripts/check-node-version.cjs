// Keep this check runnable before dependencies are installed, even on old Node.
const { engines } = require('../package.json')
const requiredMajor = Number(engines.node.replace('.x', ''))
const actualMajor = Number(process.versions.node.split('.')[0])
const actualMinor = Number(process.versions.node.split('.')[1])

if (actualMajor !== requiredMajor || actualMinor < 7) {
  console.error(`FAIL: Node.js ${process.versions.node}; use Node.js 24.7+ (latest 24.x LTS patch) for native Argon2 support`)
  process.exitCode = 1
} else {
  console.log(`PASS: Node.js ${process.versions.node} matches the ${engines.node} release runtime`)
}
