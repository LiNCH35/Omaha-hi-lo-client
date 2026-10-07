import fs from 'node:fs'
import path from 'node:path'
import { extractFeatures } from '@/helpers/neuralFeatures'
import { SCENARIOS } from './scenarios'
import { buildVector, FEATURE_SETS } from './features/variants'
import { loadFastModel } from './features/fastForward'
import { loadNeuralPolicy } from './core/neuralPolicy'
import { mcEquityCurve } from './features/mcEquity'
import { appCardToCode, cardToString } from '../../src/helpers/hiLowEvaluator'
import { evaluateStartingHand } from '../../src/helpers/evaluateStartingHand'

const args = process.argv.slice(2)
const opts = {}
for (const arg of args) {
  const match = /^--([a-zA-Z]+)=?(.*)$/.exec(arg)
  if (match) {
    opts[match[1]] = match[2] === '' ? true : match[2]
  }
}

const modelsDir = path.resolve(process.cwd(), opts.models ?? 'models_v55/ratioOuts')
const filter = opts.filter ? String(opts.filter) : null
const decisionEv = opts.decisionEv === 'analytic' ? 'analytic' : 'trained'

const meta = JSON.parse(fs.readFileSync(path.join(modelsDir, 'trainingMeta.json'), 'utf8'))
const mean = meta.norm.mean
const std = meta.norm.std
const set = meta.featureSet ?? 'base'
const equityForward = loadFastModel(path.join(modelsDir, 'equity'), fs, path)
const evForward = loadFastModel(path.join(modelsDir, 'ev'), fs, path)

const neuralDecide = loadNeuralPolicy(modelsDir, { allowRaise: true, decisionEv })

const toCard = s => ({ rank: s[0], suit: s[1] })
const ACTION_LABEL = { fold: 'FOLD', call: 'CALL', raise: 'RAISE' }

let aggroFilterFn = null
function getAggroFilter(top, cardsPerHand) {
  if (!aggroFilterFn) {
    const calibN = 20000
    const deck = []
    for (const r of '23456789TJQKA') {
      for (const s of 'cdhs') {
        deck.push(r + s)
      }
    }
    const scores = new Float64Array(calibN)
    for (let i = 0; i < calibN; i++) {
      for (let k = 0; k < cardsPerHand; k++) {
        const j = k + Math.floor(Math.random() * (deck.length - k))
        const t = deck[k]
        deck[k] = deck[j]
        deck[j] = t
      }
      scores[i] = evaluateStartingHand(deck.slice(0, cardsPerHand).map(c => ({ rank: c[0], suit: c[1] }))).overall
    }
    scores.sort()
    const minScore = scores[Math.floor(calibN * (1 - top))]
    aggroFilterFn = codes => evaluateStartingHand(codes.map(c => ({ rank: cardToString(c)[0], suit: cardToString(c)[1] }))).overall >= minScore
  }
  return aggroFilterFn
}

function makeContext(sc) {
  const actorIndex = sc.actorIsDealer === false ? 1 : 0
  const oppIndex = 1 - actorIndex
  const actorCurrentBet = sc.actorCurrentBet ?? 0
  const oppCurrentBet = sc.oppCurrentBet ?? 0
  const actorChips = (sc.actorChips ?? 10000) - actorCurrentBet
  const oppChips = (sc.oppChips ?? 10000) - oppCurrentBet
  const players = []
  players[actorIndex] = {
    index: actorIndex,
    name: 'Neural',
    chips: actorChips,
    currentBet: actorCurrentBet,
    totalBet: actorCurrentBet,
    hasFolded: false,
    hasActed: false
  }
  players[oppIndex] = {
    index: oppIndex,
    name: 'Opp',
    chips: oppChips,
    currentBet: oppCurrentBet,
    totalBet: oppCurrentBet,
    hasFolded: false,
    hasActed: false
  }
  return {
    street: sc.street,
    actorIndex,
    dealerIndex: 0,
    smallBlind: 100,
    bigBlind: 200,
    board: (sc.board ?? []).map(toCard),
    pot: sc.pot,
    currentBet: sc.currentBet,
    actor: {
      name: 'Neural',
      cards: sc.hole.map(toCard),
      chips: actorChips,
      currentBet: actorCurrentBet,
      totalBet: actorCurrentBet
    },
    players,
    actions: sc.actions ?? [],
    oppHistory: sc.oppHistory
  }
}

function inspect(context) {
  const f27 = extractFeatures(context)
  const features = set === 'base' ? f27 : buildVector(set, {
    f: f27,
    hole: context.actor.cards.map(c => c.rank + c.suit),
    board: context.board.map(c => c.rank + c.suit)
  })
  const normalized = features.slice(0, mean.length).map((v, i) => (v - mean[i]) / std[i])
  const equityOut = equityForward(normalized)
  const evOut = evForward(normalized.concat(Array.from(equityOut)))
  let mc = null
  if (opts.mc === '1') {
    const sims = parseInt(opts.sims ?? '600', 10)
    const hole = context.actor.cards.map(c => appCardToCode({ rank: c.rank, suit: c.suit }))
    const board = context.board.map(c => appCardToCode({ rank: c.rank, suit: c.suit }))
    const opponents = Math.max(1, context.players.filter(p => !p.hasFolded && p.index !== context.actorIndex).length)
    const oppAggro = (context.actions ?? []).some(a => a.action === 'raise' && a.seat !== context.actorIndex)
    const oppFilter = oppAggro ? getAggroFilter(parseFloat(opts.aggroTop ?? '0.15'), hole.length) : null
    const curve = mcEquityCurve({ hole, board, opponents, lowRules: true, sims, oppFilter })
    mc = curve.eq
  }
  return { equityOut, evOut, mc }
}

const startedAt = Date.now()
const rows = []
let passed = 0
for (const sc of SCENARIOS) {
  if (filter && !sc.name.includes(filter) && !sc.group.includes(filter)) {
    continue
  }
  const context = makeContext(sc)
  const toCall = context.currentBet - context.actor.currentBet
  const action = neuralDecide(context)
  const { equityOut, evOut, mc } = inspect(context)
  const display = action === 'call' && toCall === 0 ? 'check' : action
  const ok = sc.expect.includes(action)
  if (ok) {
    passed++
  }
  rows.push({
    sc,
    action,
    display,
    toCall,
    ok,
    equity: equityOut,
    ev: Array.from(evOut).map(v => Math.max(-8, Math.min(8, v))),
    mc
  })
}

for (const r of rows) {
  const evStr = r.ev.map(v => v.toFixed(2)).join('/')
  const eqStr = `hi=${r.equity[0].toFixed(2)} lo=${r.equity[1].toFixed(2)} scoop=${r.equity[2].toFixed(2)} share=${r.equity[5].toFixed(2)}`
  const mcStr = r.mc ? `  MC: hi=${r.mc[0].toFixed(2)} lo=${r.mc[1].toFixed(2)} scoop=${r.mc[2].toFixed(2)} share=${r.mc[5].toFixed(2)}` : ''
  console.log(`${r.ok ? 'PASS' : 'MISS'} [${r.sc.group}] ${r.sc.name}`)
  console.log(`    action=${r.display.toUpperCase()} expect=[${r.sc.expect.join(',')}] toCall=${r.toCall}`)
  console.log(`    ev(f/c/r)=${evStr}  ${eqStr}${mcStr}`)
  console.log(`    ${r.sc.note}`)
}

console.log('')
console.log(`scenarios: ${passed}/${rows.length} matched, ${Date.now() - startedAt}ms, models=${modelsDir}, decisionEv=${decisionEv}`)
