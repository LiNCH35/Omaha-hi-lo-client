import fs from 'node:fs'
import path from 'node:path'
import { createTable, playHand } from './core/runner'
import { extractFeatures, FEATURE_NAMES } from '@/helpers/neuralFeatures'
import { appCardToCode, evaluateOmaha, getAbsoluteNuts } from '@/helpers/hiLowEvaluator'
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

const sessions = opts.sessions === '1'
const sessionHands = parseInt(opts.sessionHands ?? '150', 10)
const sesStart = parseInt(opts.sesStart ?? '0', 10)
const endAlive = playerCount <= 2 ? 1 : 2
const handsPerLevel = parseInt(opts.handsPerLevel ?? '15', 10)
const BLIND_LADDER = [2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 40, 50, 60, 80, 100, 150, 200, 300, 400, 500, 600, 800, 1000, 1500, 2000, 3000, 4000, 5000, 6000, 8000, 10000, 15000, 20000, 30000, 50000]
const sessionStartBb = BLIND_LADDER.find(v => v >= startChips / 50) ?? BLIND_LADDER[BLIND_LADDER.length - 1]

const config = {
  hands,
  playerCount,
  startChips,
  cardCount,
  lowRules,
  smallBlind: sessions ? Math.max(1, Math.floor(sessionStartBb / 2)) : smallBlind,
  bigBlind: sessions ? sessionStartBb : bigBlind,
  sessions,
  sessionHands,
  handsPerLevel
}
let table = createTable(config)

const explore = opts.explore === '1'
const policy = opts.policy ?? 'random'
const raiseProb = parseFloat(opts.raiseProb ?? '0.15')
const callStation = opts.oppPolicy === 'callstation'
const raiser = opts.oppPolicy === 'raiser'
const neuralSeat = parseInt(opts.neuralSeat ?? '0', 10)
const recordSeat = opts.recordSeat !== undefined ? parseInt(opts.recordSeat, 10) : -1
const neuralMix = (callStation || raiser) ? 1 : parseFloat(opts.neuralMix ?? '0.85')
const nutRaiseProb = parseFloat(opts.nutRaiseProb ?? '0')
const preflopRaiseCap = parseFloat(opts.preflopRaiseCap ?? '0')
let neuralDecide = null
if (policy === 'neural') {
  neuralDecide = loadNeuralPolicy(path.resolve(process.cwd(), opts.models ?? 'models'), {
    margin: parseFloat(opts.margin ?? '1'),
    allowRaise: true,
    getRaiseState: () => table.store.state
  })
}

function holdsNuts(context) {
  try {
    const hole = context.actor.cards.map(appCardToCode)
    const board = context.board.map(appCardToCode)
    const current = evaluateOmaha(hole, board)
    const nuts = getAbsoluteNuts(board, hole)
    if (current.high >= nuts.high) {
      return true
    }
    return current.low !== 0 && (nuts.low === 0 || current.low <= nuts.low)
  } catch (error) {
    return false
  }
}

function clampRaise(context, action) {
  if (action !== 'raise' || preflopRaiseCap <= 0 || context.street !== 'preflop') {
    return action
  }
  const cap = Math.round(context.currentBet * preflopRaiseCap)
  const maxTo = (context.actor.currentBet || 0) + context.actor.chips
  if (table.store.state.raiseAmount > cap && cap > context.currentBet) {
    if (cap <= maxTo) {
      table.store.state.raiseAmount = cap
      return 'raise'
    }
    return 'call'
  }
  return action
}

function decide(context) {
  if ((callStation || raiser) && context.actorIndex !== neuralSeat) {
    if (raiser) {
      const maxTo = (context.actor.currentBet || 0) + context.actor.chips
      const raiseTo = Math.min(context.currentBet + context.pot, maxTo)
      if (raiseTo > context.currentBet) {
        table.store.state.raiseAmount = Math.round(raiseTo)
        return 'raise'
      }
    }
    const toCallStation = context.currentBet - (context.actor.currentBet || 0)
    return toCallStation === 0 ? 'check' : 'call'
  }
  if (nutRaiseProb > 0 && context.board.length >= 3 && Math.random() < nutRaiseProb && holdsNuts(context)) {
    const maxTo = (context.actor.currentBet || 0) + context.actor.chips
    const candidates = [context.currentBet + context.pot, context.currentBet * 3]
    let raiseTo = candidates[Math.floor(Math.random() * candidates.length)]
    raiseTo = Math.min(raiseTo, maxTo)
    if (raiseTo > context.currentBet) {
      table.store.state.raiseAmount = Math.round(raiseTo)
      return clampRaise(context, 'raise')
    }
  }
  if (neuralDecide && Math.random() < neuralMix) {
    return clampRaise(context, neuralDecide(context))
  }
  if (explore && Math.random() < raiseProb) {
    const maxTo = (context.actor.currentBet || 0) + context.actor.chips
    const candidates = [context.currentBet + context.pot, context.currentBet * 3]
    let raiseTo = candidates[Math.floor(Math.random() * candidates.length)]
    raiseTo = Math.min(raiseTo, maxTo)
    if (raiseTo > context.currentBet) {
      table.store.state.raiseAmount = Math.round(raiseTo)
      return clampRaise(context, 'raise')
    }
  }
  const toCall = context.currentBet - (context.actor.currentBet || 0)
  if (toCall === 0) {
    return 'check'
  }
  return Math.random() > 0.3 ? 'call' : 'fold'
}

const useDecisionFn = explore || neuralDecide !== null || nutRaiseProb > 0

fs.mkdirSync(path.dirname(outPath), { recursive: true })
const stream = fs.createWriteStream(outPath, { flags: 'w' })
stream.write(JSON.stringify({ t: 'meta', featureNames: FEATURE_NAMES, config }) + '\n')

let decisionCount = 0
let handsSimulated = 0
let sessionsGenerated = 0
const failures = []
const startedAt = Date.now()

function writeDecisionRow(handIndex, ses) {
  return (context, action) => {
    if (recordSeat >= 0 && context.actorIndex !== recordSeat) {
      return
    }
    const features = extractFeatures(context)
    decisionCount++
    const row = {
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
    }
    if (ses > 0) {
      row.ses = ses
    }
    stream.write(JSON.stringify(row) + '\n')
  }
}

function writeHandRow(record, handIndex, ses) {
  const row = {
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
  }
  if (ses > 0) {
    row.ses = ses
  }
  stream.write(JSON.stringify(row) + '\n')
}

if (!sessions) {
  for (let handIndex = 0; handIndex < hands; handIndex++) {
    try {
      const record = playHand(table, {
        startChips,
        dealerIndex: handIndex % playerCount,
        decisionFn: useDecisionFn ? decide : null,
        onDecision: writeDecisionRow(handIndex, 0)
      })
      writeHandRow(record, handIndex, 0)
      handsSimulated++
    } catch (error) {
      failures.push({ handIndex, error: String(error && error.message ? error.message : error) })
    }
  }
} else {
  let handIndex = 0
  let ses = sesStart
  while (handIndex < hands) {
    ses++
    sessionsGenerated++
    let bb = sessionStartBb
    let sb = Math.max(1, Math.floor(bb / 2))
    let dealer = 0
    let chips = Array.from({ length: playerCount }, () => startChips)
    const bustOrder = []
    table.store.setSmallBlind(sb)
    table.store.setBigBlind(bb)
    let hIn = 0
    for (; hIn < sessionHands; hIn++, handIndex++) {
      if (hIn > 0 && hIn % handsPerLevel === 0) {
        const next = BLIND_LADDER.find(v => v > bb)
        bb = next ?? bb * 2
        sb = Math.max(1, Math.floor(bb / 2))
        table.store.setSmallBlind(sb)
        table.store.setBigBlind(bb)
      }
      const prevChips = chips.slice()
      try {
        const record = playHand(table, {
          startChips,
          chipsPerSeat: chips,
          dealerIndex: dealer,
          decisionFn: useDecisionFn ? decide : null,
          onDecision: writeDecisionRow(handIndex, ses)
        })
        chips = record.chipsAfter.slice()
        chips.forEach((c, seat) => {
          if (c === 0 && prevChips[seat] > 0) {
            bustOrder.push(seat)
          }
        })
        writeHandRow(record, handIndex, ses)
        handsSimulated++
        if (chips.filter(c => c > 0).length <= endAlive) {
          break
        }
        let nextDealer = (dealer + 1) % playerCount
        while (chips[nextDealer] === 0) {
          nextDealer = (nextDealer + 1) % playerCount
        }
        dealer = nextDealer
      } catch (error) {
        failures.push({ handIndex, ses, error: String(error && error.message ? error.message : error) })
        table = createTable(config)
        break
      }
    }
    const alive = chips
      .map((c, seat) => ({ seat, c }))
      .filter(x => x.c > 0)
      .sort((a, b) => b.c - a.c || a.seat - b.seat)
    const ranks = new Map(alive.map((x, i) => [x.seat, i + 1]))
    ;[...bustOrder].reverse().forEach((seat, i) => ranks.set(seat, alive.length + i + 1))
    stream.write(JSON.stringify({
      t: 'ses',
      ses,
      reason: chips.filter(c => c > 0).length <= endAlive ? 'top2' : 'cap',
      hands: hIn,
      bb,
      ranks: chips.map((c, seat) => ({ seat, rank: ranks.get(seat), chips: c }))
    }) + '\n')
  }
}

stream.end(() => {
  console.log = originalConsoleLog
  originalConsoleLog(JSON.stringify({
    out: outPath,
    config,
    sessions,
    sessionsGenerated: sessions ? sessionsGenerated : undefined,
    handsSimulated,
    decisions: decisionCount,
    failureCount: failures.length,
    failures: failures.slice(0, 3),
    elapsedMs: Date.now() - startedAt
  }, null, 2))
})
