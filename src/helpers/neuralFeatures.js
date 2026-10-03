import { appCardToCode, evaluateOmaha, getAbsoluteNuts, getNutOuts, rankOf, suitOf } from '@/helpers/hiLowEvaluator'
import { evaluateStartingHand } from '@/helpers/evaluateStartingHand'

export const FEATURE_NAMES = [
  'street',
  'players_remaining',
  'position',
  'pot_bb',
  'stack_bb',
  'spr',
  'to_call_bb',
  'pot_odds',
  'preflop_score',
  'high_strength',
  'low_strength',
  'nut_high',
  'nut_low',
  'high_outs',
  'low_outs',
  'clean_high_outs',
  'clean_low_outs',
  'paired_board',
  'flush_possible',
  'straight_possible',
  'low_possible',
  'board_low_cards',
  'board_high_cards',
  'actor_has_acted'
]

const LOW_WORST = 87654
const LOW_BEST = 54321
const cap = (value, max) => Math.min(value, max)

export function extractFeatures(context, featureSet = 'base') {
  const bb = context.bigBlind || 20
  const playerCount = context.players.length
  const toCall = context.currentBet - (context.actor.currentBet || 0)
  const pot = context.pot
  const hole = context.actor.cards.map(appCardToCode)
  const board = context.board.map(appCardToCode)
  const street = ['preflop', 'flop', 'turn', 'river'].indexOf(context.street)

  let preflopScore = 0
  try {
    preflopScore = evaluateStartingHand(context.actor.cards).overall / 100
  } catch (error) {
    preflopScore = 0
  }

  let highStrength = 0
  let lowStrength = 0
  let nutHigh = 0
  let nutLow = 0
  let highOuts = 0
  let lowOuts = 0
  let cleanHighOuts = 0
  let cleanLowOuts = 0
  let pairedBoard = 0
  let flushPossible = 0
  let straightPossible = 0
  let lowPossible = 0
  let boardLowCards = 0
  let boardHighCards = 0
  let rawOuts = null

  if (board.length >= 3) {
    const rankCounts = new Array(13).fill(0)
    const suitCounts = new Array(4).fill(0)
    const distinctLowRanks = new Set()

    for (const code of board) {
      const rank = rankOf(code)
      rankCounts[rank]++
      suitCounts[suitOf(code)]++
      if (rank + 2 <= 8) {
        distinctLowRanks.add(rank)
        boardLowCards++
      }
      if (rank + 2 >= 10) {
        boardHighCards++
      }
    }

    pairedBoard = rankCounts.some(count => count >= 2) ? 1 : 0
    flushPossible = Math.max(...suitCounts) >= 3 ? 1 : 0

    let consecutive = 0
    for (let r = 0; r < 13; r++) {
      consecutive = rankCounts[r] > 0 ? consecutive + 1 : 0
      if (consecutive >= 3) {
        break
      }
    }
    straightPossible = consecutive >= 3 ? 1 : 0
    lowPossible = distinctLowRanks.size >= 3 ? 1 : 0

    const current = evaluateOmaha(hole, board)
    const nuts = getAbsoluteNuts(board, hole)

    highStrength = nuts.high > 0 ? Math.min(1, current.high / nuts.high) : 0
    lowStrength = current.low > 0 ? (LOW_WORST - current.low) / (LOW_WORST - LOW_BEST) : 0
    nutHigh = current.high >= nuts.high ? 1 : 0
    nutLow = current.low !== 0 && (nuts.low === 0 || current.low <= nuts.low) ? 1 : 0

    if (board.length <= 4) {
      const outs = getNutOuts(hole, board, hole)
      rawOuts = { counts: outs.counts, unseen: 52 - hole.length - board.length }
      highOuts = outs.counts.nutHigh
      lowOuts = outs.counts.nutLow
      cleanHighOuts = outs.counts.keepHigh
      cleanLowOuts = outs.counts.keepLow
    }
  }

  const vector = [
    street < 0 ? 0 : street,
    context.players.filter(p => !p.hasFolded).length,
    ((context.actorIndex - context.dealerIndex + playerCount) % playerCount) / playerCount,
    cap(pot / bb, 200),
    cap(context.actor.chips / bb, 300),
    pot > 0 ? cap(context.actor.chips / pot, 20) : 20,
    cap(toCall / bb, 100),
    toCall > 0 ? toCall / (pot + toCall) : 0,
    preflopScore,
    highStrength,
    lowStrength,
    nutHigh,
    nutLow,
    cap(highOuts, 21) / 21,
    cap(lowOuts, 21) / 21,
    cap(cleanHighOuts, 21) / 21,
    cap(cleanLowOuts, 21) / 21,
    pairedBoard,
    flushPossible,
    straightPossible,
    lowPossible,
    boardLowCards / 5,
    boardHighCards / 5,
    context.players[context.actorIndex] && context.players[context.actorIndex].hasActed ? 1 : 0
  ]

  if (featureSet === 'base') {
    return vector
  }
  if (featureSet === 'ratioOuts') {
    const ratios = rawOuts
      ? [
          rawOuts.counts.nutHigh / rawOuts.unseen,
          rawOuts.counts.nutLow / rawOuts.unseen,
          rawOuts.counts.keepHigh / rawOuts.unseen,
          rawOuts.counts.keepLow / rawOuts.unseen
        ]
      : [0, 0, 0, 0]
    return vector.slice(0, 13).concat(ratios, vector.slice(17))
  }
  throw new Error(`Unsupported feature set: ${featureSet}`)
}
