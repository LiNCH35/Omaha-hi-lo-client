import fs from 'node:fs'
import path from 'node:path'
import { appCardToCode } from '../../src/helpers/hiLowEvaluator'
import { mcEquityCurve } from './features/mcEquity'

const args = process.argv.slice(2)
const opts = {}
for (const arg of args) {
  const match = /^--([a-zA-Z]+)=?(.*)$/.exec(arg)
  if (match) {
    opts[match[1]] = match[2] === '' ? true : match[2]
  }
}

const inPath = path.resolve(process.cwd(), opts.in ?? 'data/omaha4_8p.jsonl')
const outPath = path.resolve(process.cwd(), opts.out ?? inPath.replace(/\.jsonl$/, '_labeled.jsonl'))
const sims = parseInt(opts.sims ?? '1200', 10)
const callProb = parseFloat(opts.q ?? '0.7')
const limit = opts.limit ? parseInt(opts.limit, 10) : 0

const raw = fs.readFileSync(inPath, 'utf8').split('\n').filter(Boolean)
const meta = JSON.parse(raw[0])
const lowRules = Boolean(meta.config.lowRules)

const toCard = str => ({ rank: str[0], suit: str[1] })
const toCodes = cards => cards.map(c => appCardToCode(toCard(c)))

const stream = fs.createWriteStream(outPath, { flags: 'w' })
stream.write(JSON.stringify({
  t: 'meta',
  featureNames: meta.featureNames,
  eqNames: ['hi', 'lo', 'scoop', 'split', 'lose', 'share'],
  evNames: ['ev_fold', 'ev_call', 'ev_raise'],
  source: inPath,
  sims,
  callProb,
  lowRules
}) + '\n')

const startedAt = Date.now()
let labeled = 0
let processed = 0

for (const line of raw.slice(1)) {
  const record = JSON.parse(line)
  if (record.t !== 'd') {
    continue
  }
  if (limit > 0 && processed >= limit) {
    break
  }
  processed++

  const hole = toCodes(record.hole)
  const board = toCodes(record.board)
  const opponents = Math.max(1, record.f[1] - 1)
  const { eq, shares } = mcEquityCurve({ hole, board, opponents, lowRules, sims })

  const bb = record.bb || 20
  const pot = record.pot
  const toCall = record.toCall
  const stackChips = record.f[4] * bb
  const evCall = (shares[opponents - 1] * (pot + toCall) - toCall) / bb
  const raiseAdd = Math.max(0, Math.min(pot + toCall, stackChips - toCall))
  let evRaise = evCall
  if (raiseAdd > 0) {
    let binomProb = Math.pow(1 - callProb, opponents)
    let evRaiseChips = 0
    for (let k = 0; k <= opponents; k++) {
      const share = k === 0 ? 1 : shares[k - 1]
      evRaiseChips += binomProb * (share * (pot + toCall + raiseAdd * (1 + k)) - (toCall + raiseAdd))
      binomProb = binomProb * (opponents - k) / (k + 1) * callProb / (1 - callProb)
    }
    evRaise = evRaiseChips / bb
  }

  stream.write(JSON.stringify({
    f: record.f,
    eq,
    ev: [0, evCall, evRaise]
  }) + '\n')

  labeled++
  if (labeled % 1000 === 0) {
    console.error(`[label] ${labeled} decisions, ${Math.round((Date.now() - startedAt) / 1000)}s`)
  }
}

stream.end(() => {
  console.error(`[label] done: ${labeled} decisions in ${Math.round((Date.now() - startedAt) / 1000)}s`)
  process.stdout.write(JSON.stringify({
    in: inPath,
    out: outPath,
    sims,
    lowRules,
    decisions: labeled,
    elapsedMs: Date.now() - startedAt
  }, null, 2) + '\n')
})
