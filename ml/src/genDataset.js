import fs from 'node:fs'
import path from 'node:path'
import { createTable, playHand } from './core/runner'
import { extractFeatures, FEATURE_NAMES } from '@/helpers/neuralFeatures'
import { loadNeuralPolicy } from './core/neuralPolicy'

const verbose = process.env.POKER_ML_VERBOSE === '1'
const originalConsoleLog = console.log

if (!verbose) {
  console.log = () => {}
}

const args = process.argv.slice(2)
const opts = {}
for (const arg of args) {
  const match = /^--([a-zA-Z]+)=?(.*)$/.exec(arg)
  if (match) {
    opts[match[1]] = match[2] === '' ? true : match[2]
  }
}

const hands = parseInt(opts.hands ?? '1000', 10)
const playerCount = parseInt(opts.players ?? '8', 10)
const startChips = parseInt(opts.chips ?? '1000', 10)
const cardCount = parseInt(opts.cards ?? '4', 10)
const lowRules = opts.low === '1'
const bigBlind = parseInt(opts.bb ?? '20', 10)
const smallBlind = Math.max(1, Math.floor(bigBlind / 2))
const outArg = opts.out ?? `omaha${cardCount}_${playerCount}p${lowRules ? '_lo' : ''}.jsonl`
const outPath = path.isAbsolute(outArg) ? outArg : path.resolve(process.cwd(), outArg)

const config = { hands, playerCount, startChips, cardCount, lowRules, smallBlind, bigBlind }
const table = createTable(config)

const explore = opts.explore === '1'
const policy = opts.policy ?? 'random'
const raiseProb = parseFloat(opts.raiseProb ?? '0.15')
const neuralMix = parseFloat(opts.neuralMix ?? '0.85')
let neuralDecide = null
if (policy === 'neural') {
  neuralDecide = loadNeuralPolicy(path.resolve(process.cwd(), opts.models ?? 'models'), {
    margin: parseFloat(opts.margin ?? '1'),
    allowRaise: true
  })
}

function decide(context) {
  if (neuralDecide && Math.random() < neuralMix) {
    return neuralDecide(context)
  }
  if (explore && Math.random() < raiseProb) {
    const maxTo = (context.actor.currentBet || 0) + context.actor.chips
    const candidates = [context.currentBet + context.pot, context.currentBet * 3]
    let raiseTo = candidates[Math.floor(Math.random() * candidates.length)]
    raiseTo = Math.min(raiseTo, maxTo)
    if (raiseTo > context.currentBet) {
      table.store.state.raiseAmount = Math.round(raiseTo)
      return 'raise'
    }
  }
  const toCall = context.currentBet - (context.actor.currentBet || 0)
  if (toCall === 0) {
    return 'check'
  }
  return Math.random() > 0.3 ? 'call' : 'fold'
}

const useDecisionFn = explore || neuralDecide !== null

fs.mkdirSync(path.dirname(outPath), { recursive: true })
const stream = fs.createWriteStream(outPath, { flags: 'w' })
stream.write(JSON.stringify({ t: 'meta', featureNames: FEATURE_NAMES, config }) + '\n')

let decisionCount = 0
const failures = []
const startedAt = Date.now()

for (let handIndex = 0; handIndex < hands; handIndex++) {
  try {
    const record = playHand(table, {
      startChips,
      dealerIndex: handIndex % playerCount,
      decisionFn: useDecisionFn ? decide : null,
      onDecision: (context, action) => {
        const features = extractFeatures(context)
        decisionCount++
        stream.write(JSON.stringify({
          t: 'd',
          h: handIndex,
          s: context.street,
          seat: context.actorIndex,
          a: action,
          f: features,
          hole: context.actor.cards.map(c => c.rank + c.suit),
          board: context.board.map(c => c.rank + c.suit),
          pot: context.pot,
          toCall: context.currentBet - (context.actor.currentBet || 0),
          bb: context.bigBlind
        }) + '\n')
      }
    })
    stream.write(JSON.stringify({
      t: 'h',
      h: handIndex,
      board: record.board.map(c => c.rank + c.suit),
      results: record.players.map((p, seat) => ({
        seat,
        net: p.net,
        showdown: p.wentToShowdown,
        hiWinner: p.isWinner,
        loWinner: p.isLowWinner
      }))
    }) + '\n')
  } catch (error) {
    failures.push({ handIndex, error: String(error && error.message ? error.message : error) })
  }
}

stream.end(() => {
  console.log = originalConsoleLog
  originalConsoleLog(JSON.stringify({
    out: outPath,
    config,
    handsSimulated: hands - failures.length,
    decisions: decisionCount,
    failureCount: failures.length,
    failures: failures.slice(0, 3),
    elapsedMs: Date.now() - startedAt
  }, null, 2))
})
