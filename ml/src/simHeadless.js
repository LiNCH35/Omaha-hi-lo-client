import { runSimulation } from './core/runner'

const verbose = process.env.POKER_ML_VERBOSE === '1'
const originalConsoleLog = console.log

if (!verbose) {
  console.log = () => {}
}

const args = process.argv.slice(2)
const opts = {}
for (const arg of args) {
  const match = /^--([a-zA-Z]+)=(.*)$/.exec(arg)
  if (match) {
    opts[match[1]] = match[2]
  }
}

const hands = parseInt(opts.hands ?? '300', 10)
const playerCount = parseInt(opts.players ?? '8', 10)
const startChips = parseInt(opts.chips ?? '1000', 10)
const cardCount = parseInt(opts.cards ?? '4', 10)
const lowRules = opts.low === '1'

const startedAt = Date.now()
const { records, stats, failures } = runSimulation({ hands, playerCount, startChips, cardCount, lowRules })
const elapsedMs = Date.now() - startedAt

console.log = originalConsoleLog

originalConsoleLog(JSON.stringify({
  config: { hands, playerCount, startChips, cardCount, lowRules },
  stats,
  failureCount: failures.length,
  failures: failures.slice(0, 3),
  elapsedMs,
  handsPerSecond: Math.round((stats.hands / Math.max(elapsedMs, 1)) * 1000)
}, null, 2))
