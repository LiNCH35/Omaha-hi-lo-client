import { evaluateOmaha } from '../../../src/helpers/hiLowEvaluator'

export const EQ_NAMES = ['hi', 'lo', 'scoop', 'split', 'lose', 'share']
export const EV_NAMES = ['ev_fold', 'ev_call', 'ev_raise']

export function monteCarloEquity({ hole, board, opponents, lowRules = true, sims = 1200 }) {
  const oppCount = Math.max(1, opponents | 0)
  const used = new Uint8Array(52)
  for (const c of hole) {
    used[c] = 1
  }
  for (const c of board) {
    used[c] = 1
  }
  const pool = []
  for (let c = 0; c < 52; c++) {
    if (!used[c]) {
      pool.push(c)
    }
  }

  const needsBoard = 5 - board.length
  const cardsPerHand = hole.length
  const nDeal = needsBoard + oppCount * cardsPerHand
  if (pool.length < nDeal) {
    throw new Error(`Not enough unseen cards: pool=${pool.length} need=${nDeal}`)
  }

  let hiSum = 0
  let loSum = 0
  let shareSum = 0
  let scoopCount = 0
  let splitCount = 0
  let loseCount = 0

  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < nDeal; i++) {
      const j = i + Math.floor(Math.random() * (pool.length - i))
      const tmp = pool[i]
      pool[i] = pool[j]
      pool[j] = tmp
    }

    const fullBoard = needsBoard > 0 ? board.concat(pool.slice(0, needsBoard)) : board
    const hero = evaluateOmaha(hole, fullBoard)

    let bestHigh = hero.high
    let bestLow = hero.low > 0 ? hero.low : Infinity
    let anyLow = hero.low > 0

    const results = new Array(oppCount)
    for (let o = 0; o < oppCount; o++) {
      const base = needsBoard + o * cardsPerHand
      const oppHole = pool.slice(base, base + cardsPerHand)
      const result = evaluateOmaha(oppHole, fullBoard)
      results[o] = result
      if (result.high > bestHigh) {
        bestHigh = result.high
      }
      if (result.low > 0) {
        anyLow = true
        if (result.low < bestLow) {
          bestLow = result.low
        }
      }
    }

    let hiTies = 0
    let loTies = 0
    for (const r of results) {
      if (r.high === bestHigh) {
        hiTies++
      }
      if (bestLow !== Infinity && r.low > 0 && r.low === bestLow) {
        loTies++
      }
    }

    const hiShare = hero.high === bestHigh ? 1 / (1 + hiTies) : 0
    const loShare = lowRules && hero.low > 0 && bestLow !== Infinity && hero.low === bestLow ? 1 / (1 + loTies) : 0
    const totalShare = anyLow ? (hiShare + loShare) / 2 : hiShare

    hiSum += hiShare
    loSum += loShare
    shareSum += totalShare
    if (totalShare >= 0.999) {
      scoopCount++
    } else if (totalShare > 0.001) {
      splitCount++
    } else {
      loseCount++
    }
  }

  return [
    hiSum / sims,
    loSum / sims,
    scoopCount / sims,
    splitCount / sims,
    loseCount / sims,
    shareSum / sims
  ]
}

export function mcEquityCurve({ hole, board, opponents, lowRules = true, sims = 800, oppFilter = null, maxFilterTries = 24 }) {
  const oppCount = Math.max(1, opponents | 0)
  const used = new Uint8Array(52)
  for (const c of hole) {
    used[c] = 1
  }
  for (const c of board) {
    used[c] = 1
  }
  const pool = []
  for (let c = 0; c < 52; c++) {
    if (!used[c]) {
      pool.push(c)
    }
  }

  const needsBoard = 5 - board.length
  const cardsPerHand = hole.length
  const nDeal = needsBoard + oppCount * cardsPerHand
  if (pool.length < nDeal) {
    throw new Error(`Not enough unseen cards: pool=${pool.length} need=${nDeal}`)
  }

  const hiSums = new Float64Array(oppCount)
  const loSums = new Float64Array(oppCount)
  const shareSums = new Float64Array(oppCount)
  let scoopCount = 0
  let splitCount = 0
  let loseCount = 0

  const oppResults = new Array(oppCount)
  const oppHole = new Array(cardsPerHand)

  for (let s = 0; s < sims; s++) {
    for (let i = 0; i < nDeal; i++) {
      const j = i + Math.floor(Math.random() * (pool.length - i))
      const tmp = pool[i]
      pool[i] = pool[j]
      pool[j] = tmp
    }

    if (oppFilter) {
      for (let o = 0; o < oppCount; o++) {
        const base = needsBoard + o * cardsPerHand
        for (let t = 0; t < maxFilterTries; t++) {
          if (oppFilter(pool.slice(base, base + cardsPerHand))) {
            break
          }
          for (let j = 0; j < cardsPerHand; j++) {
            const k = nDeal + Math.floor(Math.random() * (pool.length - nDeal))
            const tmp = pool[base + j]
            pool[base + j] = pool[k]
            pool[k] = tmp
          }
        }
      }
    }

    const fullBoard = needsBoard > 0 ? board.concat(pool.slice(0, needsBoard)) : board
    const hero = evaluateOmaha(hole, fullBoard)

    for (let o = 0; o < oppCount; o++) {
      const base = needsBoard + o * cardsPerHand
      for (let c = 0; c < cardsPerHand; c++) {
        oppHole[c] = pool[base + c]
      }
      oppResults[o] = evaluateOmaha(oppHole, fullBoard)
    }

    for (let k = 1; k <= oppCount; k++) {
      let bestHigh = hero.high
      let bestLow = hero.low > 0 ? hero.low : Infinity
      let anyLow = hero.low > 0
      for (let o = 0; o < k; o++) {
        const r = oppResults[o]
        if (r.high > bestHigh) {
          bestHigh = r.high
        }
        if (r.low > 0) {
          anyLow = true
          if (r.low < bestLow) {
            bestLow = r.low
          }
        }
      }
      let hiTies = 0
      let loTies = 0
      for (let o = 0; o < k; o++) {
        const r = oppResults[o]
        if (r.high === bestHigh) {
          hiTies++
        }
        if (bestLow !== Infinity && r.low > 0 && r.low === bestLow) {
          loTies++
        }
      }
      const hiShare = hero.high === bestHigh ? 1 / (1 + hiTies) : 0
      const loShare = lowRules && hero.low > 0 && bestLow !== Infinity && hero.low === bestLow ? 1 / (1 + loTies) : 0
      const totalShare = anyLow ? (hiShare + loShare) / 2 : hiShare
      hiSums[k - 1] += hiShare
      loSums[k - 1] += loShare
      shareSums[k - 1] += totalShare

      if (k === oppCount) {
        if (totalShare >= 0.999) {
          scoopCount++
        } else if (totalShare > 0.001) {
          splitCount++
        } else {
          loseCount++
        }
      }
    }
  }

  const k = oppCount
  const eq = [
    hiSums[k - 1] / sims,
    loSums[k - 1] / sims,
    scoopCount / sims,
    splitCount / sims,
    loseCount / sims,
    shareSums[k - 1] / sims
  ]
  const shares = new Array(oppCount)
  for (let i = 0; i < oppCount; i++) {
    shares[i] = shareSums[i] / sims
  }

  return { eq, shares }
}
