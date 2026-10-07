import fs from 'node:fs'
import path from 'node:path'
import { appCardToCode, cardToString } from '../../src/helpers/hiLowEvaluator'
import { evaluateStartingHand } from '../../src/helpers/evaluateStartingHand'
import { mcEquityCurve } from './features/mcEquity'

const args = process.argv.slice(2)
const opts = {}
for (const arg of args) {
  const match = /^--([a-zA-Z0-9]+)=?(.*)$/.exec(arg)
  if (match) {
    opts[match[1]] = match[2] === '' ? true : match[2]
  }
}

const inPath = path.resolve(process.cwd(), opts.in ?? 'data/omaha4_8p.jsonl')
const outPath = path.resolve(process.cwd(), opts.out ?? inPath.replace(/\.jsonl$/, '_labeled.jsonl'))
const sims = parseInt(opts.sims ?? '1200', 10)
const callProb = parseFloat(opts.q ?? '0.7')
const limit = opts.limit ? parseInt(opts.limit, 10) : 0
const rangeTop = parseFloat(opts.rangeTop ?? '0')
const aggroTop = parseFloat(opts.aggroTop ?? '0')
const rangeMinBb = parseFloat(opts.rangeMinBb ?? '2.5')
const shovePenalty = parseFloat(opts.shovePenalty ?? '1')
const rewardTop1 = parseFloat(opts.rewardTop1 ?? '0')
const rewardTop2 = parseFloat(opts.rewardTop2 ?? '0')
const rewardOther = parseFloat(opts.rewardOther ?? '0')
const warPenalty = parseFloat(opts.warPenalty ?? '0')
const outcomeReward = parseFloat(opts.outcomeReward ?? '0')
const rewardShaped = rewardTop1 !== 0 || rewardTop2 !== 0 || rewardOther !== 0

const RANKS = '23456789TJQKA'
const SUITS = 'cdhs'

function randomHandCodes(count = 4) {
  const deck = []
  for (const r of RANKS) {
    for (const s of SUITS) {
      deck.push(r + s)
    }
  }
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(Math.random() * (deck.length - i))
    const tmp = deck[i]
    deck[i] = deck[j]
    deck[j] = tmp
  }
  return deck.slice(0, count)
}

const raw = fs.readFileSync(inPath, 'utf8').split('\n').filter(Boolean)
const meta = JSON.parse(raw[0])
const lowRules = opts.low === '1' ? true : opts.low === '0' ? false : Boolean(meta.config.lowRules)

const toCard = str => ({ rank: str[0], suit: str[1] })
const toCodes = cards => cards.map(c => appCardToCode(toCard(c)))

let cardsPerHand = 4
for (const line of raw.slice(1)) {
  let rec
  try {
    rec = JSON.parse(line)
  } catch {
    continue
  }
  if (rec.t === 'd' && Array.isArray(rec.hole) && rec.hole.length > 0) {
    cardsPerHand = rec.hole.length
    break
  }
}

function minScoreFor(top, calibN, calibScores) {
  const idx = Math.min(calibN - 1, Math.floor(calibN * (1 - top)))
  return calibScores[idx]
}

function buildRowFilter(top) {
  if (top <= 0) {
    return null
  }
  const calibN = parseInt(opts.rangeCalib ?? '20000', 10)
  const scores = new Float64Array(calibN)
  for (let i = 0; i < calibN; i++) {
    scores[i] = evaluateStartingHand(randomHandCodes(cardsPerHand).map(s => ({ rank: s[0], suit: s[1] }))).overall
  }
  scores.sort()
  const minScore = minScoreFor(top, calibN, scores)
  return {
    top,
    minScore,
    fn: codes => evaluateStartingHand(codes.map(c => ({ rank: cardToString(c)[0], suit: cardToString(c)[1] }))).overall >= minScore
  }
}

const raiseFilter = buildRowFilter(rangeTop)
const aggroFilter = buildRowFilter(aggroTop)
if (raiseFilter) {
  console.error(`[label] rangeTop=${rangeTop} rangeMinBb=${rangeMinBb} minScore=${raiseFilter.minScore} (calib, ${cardsPerHand} cards)`)
}
if (aggroFilter) {
  console.error(`[label] aggroTop=${aggroTop} minScore=${aggroFilter.minScore}`)
}

const sesRanks = new Map()
const sesWinner = new Map()
const warHands = new Set()
if (rewardShaped || warPenalty > 0 || outcomeReward > 0) {
  for (const line of raw.slice(1)) {
    let rec
    try {
      rec = JSON.parse(line)
    } catch {
      continue
    }
    if (rec.t === 'ses' && rec.ses) {
      sesWinner.set(rec.ses, rec.winner)
      const rankMap = new Map()
      for (const r of rec.ranks || []) {
        rankMap.set(r.seat, r.rank)
      }
      sesRanks.set(rec.ses, rankMap)
    } else if (rec.t === 'h' && rec.preflopWar) {
      warHands.add(`${rec.ses}:${rec.h}`)
    }
  }
}

const stream = fs.createWriteStream(outPath, { flags: 'w' })
stream.write(JSON.stringify({
  t: 'meta',
  featureNames: meta.featureNames,
  eqNames: ['hi', 'lo', 'scoop', 'split', 'lose', 'share'],
  evNames: ['ev_fold', 'ev_call', 'ev_raise'],
  source: inPath,
  sims,
  callProb,
  rangeTop,
  aggroTop,
  rangeMinBb,
  cardsPerHand,
  minScore: raiseFilter?.minScore ?? 0,
  aggroMinScore: aggroFilter?.minScore ?? 0,
  shovePenalty,
  rewardShaped,
  rewardTop1,
  rewardTop2,
  rewardOther,
  warPenalty,
  outcomeReward,
  evUnits: 'pot',
  decisionEv: opts.decisionEv === 'trained' ? 'trained' : 'analytic',
  lowRules
}) + '\n')

const startedAt = Date.now()
let labeled = 0
let processed = 0
let warPenaltyCount = 0
let outcomeRewardCount = 0
let oppFilterCount = 0

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
  const bb = record.bb || 20
  const toCall = record.toCall
  const facingRaise = toCall >= rangeMinBb * bb
  const handAggro = record.f.length > 26 ? record.f[26] : 0
  let rowFilter = null
  if (handAggro > 0.5 && aggroFilter) {
    rowFilter = aggroFilter
  } else if (facingRaise && raiseFilter) {
    rowFilter = raiseFilter
  }
  if (rowFilter) {
    oppFilterCount++
  }
  const { eq, shares } = mcEquityCurve({ hole, board, opponents, lowRules, sims, oppFilter: rowFilter?.fn ?? null })

  const pot = record.pot
  const stackChips = record.f[4] * bb
  const potBb = Math.max(pot, bb) / bb
  const evDenom = potBb * bb
  let evCall = (shares[opponents - 1] * (pot + toCall) - toCall) / evDenom
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
    evRaise = evRaiseChips / evDenom
  }
  if (rewardShaped && record.ses) {
    const rank = sesRanks.get(record.ses)?.get(record.seat)
    if (rank !== undefined) {
      const adj = rank === 1 ? rewardTop1 : rank === 2 ? rewardTop2 : rewardOther
      evCall += adj
      evRaise += adj
    }
  }
  let warAdj = 0
  if (warPenalty > 0 && record.s === 'preflop' && record.a === 'raise' && record.seat === 0) {
    if (warHands.has(`${record.ses}:${record.h}`)) {
      warAdj = -warPenalty
      evCall += warAdj
      evRaise += warAdj
      warPenaltyCount++
    }
  }
  let outcomeAdj = 0
  if (outcomeReward > 0 && record.s === 'preflop' && record.seat === 0 && record.a !== 'fold') {
    if (warHands.has(`${record.ses}:${record.h}`)) {
      const won = sesWinner.get(record.ses) === record.seat
      outcomeAdj = won ? outcomeReward : -outcomeReward
      evCall += outcomeAdj
      evRaise += outcomeAdj
      outcomeRewardCount++
    }
  }
  evCall = Math.max(-8, Math.min(8, evCall))
  evRaise = Math.max(-8, Math.min(8, evRaise))

  const allInCall = toCall >= stackChips
  const allInRaise = raiseAdd > 0 && raiseAdd >= stackChips - toCall
  if (shovePenalty > 1) {
    if (allInCall && evCall < 0) {
      evCall *= shovePenalty
    }
    if (allInRaise && evRaise < 0) {
      evRaise *= shovePenalty
    }
  }

  stream.write(JSON.stringify({
    f: record.f,
    eq,
    ev: [0, evCall, evRaise],
    rng: facingRaise ? 1 : 0
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
    rangeTop,
    aggroTop,
    rangeMinBb,
    minScore: raiseFilter?.minScore ?? 0,
    aggroMinScore: aggroFilter?.minScore ?? 0,
    rewardShaped,
    decisions: labeled,
    warHands: warHands.size,
    warPenaltyDecisions: warPenaltyCount,
    outcomeReward,
    outcomeRewardDecisions: outcomeRewardCount,
    oppFilterDecisions: oppFilterCount,
    elapsedMs: Date.now() - startedAt
  }, null, 2) + '\n')
})
