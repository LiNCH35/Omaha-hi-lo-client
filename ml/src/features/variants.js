import { appCardToCode, getNutOuts } from '../../../src/helpers/hiLowEvaluator'
import { FEATURE_NAMES } from '../../../src/helpers/neuralFeatures'

export const CARD_DEPENDENT = ['ratioOuts', 'nutScoop']

const OUTS_NAMES = ['high_outs', 'low_outs', 'clean_high_outs', 'clean_low_outs']
const RATIO_NAMES = ['nut_high_ratio', 'nut_low_ratio', 'keep_high_ratio', 'keep_low_ratio']

export const FEATURE_SETS = {
  base: [...FEATURE_NAMES],
  noPreflop: FEATURE_NAMES.filter(name => name !== 'preflop_score'),
  ratioOuts: FEATURE_NAMES.map(name => {
    const i = OUTS_NAMES.indexOf(name)
    return i >= 0 ? RATIO_NAMES[i] : name
  }),
  nutScoop: [...FEATURE_NAMES, 'scoop_outs_ratio', ...RATIO_NAMES]
}

const toCodes = cards => cards.map(s => appCardToCode({ rank: s[0], suit: s[1] }))

export function buildOuts(record) {
  const board = toCodes(record.board)
  if (board.length < 3 || board.length > 4) {
    return null
  }
  const hole = toCodes(record.hole)
  const { counts } = getNutOuts(hole, board, hole)
  return { counts, unseen: 52 - hole.length - board.length }
}

export function buildVector(setName, record, precomputedOuts) {
  const f = record.f
  switch (setName) {
    case 'base':
      return f.slice()
    case 'noPreflop':
      return f.slice(0, 8).concat(f.slice(9))
    case 'ratioOuts':
    case 'nutScoop': {
      const outs = precomputedOuts !== undefined ? precomputedOuts : buildOuts(record)
      const ratios = outs
        ? [
            outs.counts.nutHigh / outs.unseen,
            outs.counts.nutLow / outs.unseen,
            outs.counts.keepHigh / outs.unseen,
            outs.counts.keepLow / outs.unseen
          ]
        : [0, 0, 0, 0]
      if (setName === 'ratioOuts') {
        return f.slice(0, 13).concat(ratios, f.slice(17))
      }
      const scoopRatio = outs ? outs.counts.scoop / outs.unseen : 0
      return f.concat([scoopRatio], ratios)
    }
    default:
      throw new Error(`Unknown feature set: ${setName}`)
  }
}
