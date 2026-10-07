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

const tournaments = parseInt(opts.tournaments ?? '20', 10)
const handsCap = parseInt(opts.handsCap ?? '200', 10)
const playerCount = parseInt(opts.players ?? '2', 10)
const startChips = parseInt(opts.chips ?? '10000', 10)
const cardCount = parseInt(opts.cards ?? '7', 10)
const lowRules = opts.low === '1'
const bigBlind = parseInt(opts.bb ?? '200', 10)
const smallBlind = Math.max(1, Math.floor(bigBlind / 2))
const oppPolicy = opts.oppPolicy ?? 'raiser'
const sesStart = parseInt(opts.sesStart ?? '0', 10)
const neuralNoRaise = opts.neuralNoRaise === '1' || opts.neuralNoRaise === true
const neuralSeat = 0
const modelsDir = path.resolve(process.cwd(), opts.models ?? 'models')
const outArg = opts.out ?? `data/tcheck_${oppPolicy}.jsonl`
const outPath = path.isAbsolute(outArg) ? outArg : path.resolve(process.cwd(), outArg)

const config = {
  hands: 0,
  playerCount,
  startChips,
  cardCount,
  lowRules,
  smallBlind,
  bigBlind,
  oppPolicy,
  neuralNoRaise,
  tournaments,
  handsCap
}
let table = createTable(config)

const neuralDecide = loadNeuralPolicy(modelsDir, {
  margin: parseFloat(opts.margin ?? '0.05'),
  allowRaise: !neuralNoRaise,
  getRaiseState: () => table.store.state,
  decisionEv: opts.decisionEv === 'analytic' ? 'analytic' : 'trained'
})

function botDecide(context) {
  if (oppPolicy === 'raiser') {
    const maxTo = (context.actor.currentBet || 0) + context.actor.chips
    const raiseTo = Math.min(context.currentBet + context.pot, maxTo)
    if (raiseTo > context.currentBet) {
      table.store.state.raiseAmount = Math.round(raiseTo)
      return 'raise'
    }
  }
  const toCall = context.currentBet - (context.actor.currentBet || 0)
  return toCall === 0 ? 'check' : 'call'
}

function decide(context) {
  return context.actorIndex === neuralSeat ? neuralDecide(context) : botDecide(context)
}

fs.mkdirSync(path.dirname(outPath), { recursive: true })
const stream = fs.createWriteStream(outPath, { flags: 'w' })
stream.write(JSON.stringify({ t: 'meta', featureNames: FEATURE_NAMES, config }) + '\n')

function writeDecisionRow(tournament, handIndex) {
  return (context, action) => {
    if (context.actorIndex !== neuralSeat) {
      return
    }
    const features = extractFeatures(context)
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
      bb: context.bigBlind,
      ses: sesStart + tournament
    }) + '\n')
  }
}

function writeHandRow(record, tournament, handIndex, extras, netBySeat) {
  stream.write(JSON.stringify({
    t: 'h',
    h: handIndex,
    board: record.board.map(c => c.rank + c.suit),
    results: record.players.map((p, seat) => ({
      seat,
      net: netBySeat ? netBySeat[seat] : p.net,
      showdown: p.wentToShowdown,
      hiWinner: p.isWinner,
      loWinner: p.isLowWinner
    })),
    ses: sesStart + tournament,
    ...extras
  }) + '\n')
}

function bettingEndStreet(actions) {
  let street = null
  for (const a of actions) {
    if (a.action === 'raise' || (a.action === 'call' && a.toCall > 0)) {
      street = a.street
    }
  }
  return street
}

const startedAt = Date.now()
const results = []
const failures = []
for (let t = 1; t <= tournaments; t++) {
  table.engine.preflopStats = new Map()
  let chips = Array.from({ length: playerCount }, () => startChips)
  let dealer = t % playerCount
  let preflopAllInHands = 0
  let winner = null
  let handsPlayed = 0
  let handIndex = 0
  let failed = false
  for (let h = 0; h < handsCap; h++) {
    handsPlayed = h + 1
    try {
      const prevChips = chips.slice()
      const record = playHand(table, {
        startChips,
        chipsPerSeat: chips,
        dealerIndex: dealer,
        decisionFn: decide,
        onDecision: writeDecisionRow(t, handIndex)
      })
      chips = record.chipsAfter.slice()
      const allInSeats = record.players
        .map((p, seat) => ({ p, seat }))
        .filter(x => x.p.totalBet > 0 && chips[x.seat] === 0 && prevChips[x.seat] > 0)
        .map(x => x.seat)
      const endStreet = bettingEndStreet(record.actions)
      const war = allInSeats.length > 0 && endStreet === 'preflop'
      if (war) {
        preflopAllInHands++
      }
      const netBySeat = prevChips.map((c, seat) => c - chips[seat])
      writeHandRow(record, t, handIndex, { allInSeats, bettingEndStreet: endStreet, preflopWar: war }, netBySeat)
      handIndex++
      const busts = chips
        .map((c, seat) => ({ c, seat }))
        .filter(x => x.c === 0)
        .map(x => x.seat)
      if (busts.length > 0) {
        winner = busts[0] === neuralSeat ? 1 : neuralSeat
        break
      }
      dealer = (dealer + 1) % playerCount
    } catch (error) {
      failures.push({ tournament: t, handIndex, error: String(error && error.message ? error.message : error) })
      winner = null
      failed = true
      break
    }
  }
  const won = winner === neuralSeat
  const verdict = winner === null
    ? (failed ? 'error' : 'cap')
    : (preflopAllInHands > 0 ? 'preflop_allin' : (won ? 'pass' : 'loss'))
  results.push({
    tournament: t,
    winner,
    hands: handsPlayed,
    preflopAllInHands,
    neuralChips: chips[neuralSeat],
    verdict
  })
  stream.write(JSON.stringify({
    t: 'ses',
    ses: sesStart + t,
    reason: winner === null ? 'cap' : 'bust',
    hands: handsPlayed,
    bb: bigBlind,
    winner,
    preflopAllInHands,
    ranks: chips.map((c, seat) => ({ seat, rank: c === 0 ? 2 : 1, chips: c }))
  }) + '\n')
}

stream.end(() => {
  console.log = originalConsoleLog
  const wins = results.filter(r => r.verdict === 'pass').length
  const losses = results.filter(r => r.verdict === 'loss').length
  const caps = results.filter(r => r.verdict === 'cap').length
  const wars = results.filter(r => r.verdict === 'preflop_allin').length
  const errors = results.filter(r => r.verdict === 'error').length
  originalConsoleLog(JSON.stringify({
    out: outPath,
    models: modelsDir,
    oppPolicy,
    tournaments,
    handsCap,
    bigBlind,
    startChips,
    wins,
    losses,
    caps,
    preflopWarTournaments: wars,
    errors,
    passRate: tournaments > 0 ? wins / tournaments : 0,
    pass: wins === tournaments && wars === 0 && errors === 0,
    totalHands: results.reduce((sum, r) => sum + r.hands, 0),
    failureCount: failures.length,
    failures: failures.slice(0, 3),
    perTournament: results,
    elapsedMs: Date.now() - startedAt
  }, null, 2))
})
