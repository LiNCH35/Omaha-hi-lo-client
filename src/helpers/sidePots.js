/**
 * Side pot management for all-in scenarios
 */

export class SidePot {
  constructor(amount, eligiblePlayers) {
    this.amount = amount
    this.eligiblePlayers = eligiblePlayers
  }
}

export function buildPots(players) {
  const pots = []
  const totalInvested = players.reduce((sum, player) => sum + (player.totalBet || 0), 0)
  const contributions = players.map(player => player.totalBet || 0)

  let refund = null
  let maxIndex = -1
  let maxAmount = 0
  contributions.forEach((amount, index) => {
    if (amount > maxAmount) {
      maxAmount = amount
      maxIndex = index
    }
  })

  if (maxIndex !== -1 && maxAmount > 0 && !players[maxIndex].hasFolded) {
    const isTied = contributions.some((amount, index) => index !== maxIndex && amount === maxAmount)
    if (!isTied) {
      let secondMax = 0
      contributions.forEach((amount, index) => {
        if (index !== maxIndex && amount > secondMax) {
          secondMax = amount
        }
      })
      if (maxAmount > secondMax) {
        refund = { playerIndex: maxIndex, amount: maxAmount - secondMax }
        contributions[maxIndex] = secondMax
      }
    }
  }

  const levels = [...new Set(contributions)].filter(level => level > 0).sort((a, b) => a - b)
  let previousLevel = 0
  let pendingDead = 0
  for (const level of levels) {
    const amount = contributions.reduce(
      (sum, contribution) => sum + Math.max(0, Math.min(contribution, level) - previousLevel),
      0
    )
    previousLevel = level
    if (amount <= 0) {
      continue
    }
    const eligiblePlayers = players
      .map((player, index) => index)
      .filter(index => !players[index].hasFolded && contributions[index] >= level)
    if (eligiblePlayers.length === 0) {
      pendingDead += amount
      continue
    }
    pots.push(new SidePot(amount + pendingDead, eligiblePlayers))
    pendingDead = 0
  }

  if (pendingDead > 0 && pots.length > 0) {
    pots[pots.length - 1].amount += pendingDead
    pendingDead = 0
  }

  const potsTotal = pots.reduce((sum, pot) => sum + pot.amount, 0)
  const mismatch = potsTotal + (refund ? refund.amount : 0) - totalInvested

  return { pots, refund, mismatch }
}

export function distributePots(pots, players, lowRules = false) {
  const distributions = new Map()
  const breakdown = new Map()
  let undistributed = 0

  const ensureEntry = name => {
    if (!distributions.has(name)) {
      distributions.set(name, 0)
      breakdown.set(name, { hi: 0, low: 0 })
    }
  }

  const pickMinBy = (list, getScore) => {
    let best = Infinity
    let winners = []
    for (const player of list) {
      const score = getScore(player)
      if (score === null || score === undefined) {
        continue
      }
      if (score < best) {
        best = score
        winners = [player]
      } else if (score === best) {
        winners.push(player)
      }
    }
    return winners
  }

  const payShare = (winners, amount, kind) => {
    if (winners.length === 0 || amount <= 0) {
      return amount
    }
    const base = Math.floor(amount / winners.length)
    let remainder = amount - base * winners.length
    for (const winner of winners) {
      let share = base
      if (remainder > 0) {
        share += 1
        remainder -= 1
      }
      ensureEntry(winner.name)
      distributions.set(winner.name, distributions.get(winner.name) + share)
      breakdown.get(winner.name)[kind] += share
    }
    return remainder
  }

  const potResults = []

  for (const pot of pots) {
    const eligible = pot.eligiblePlayers.map(index => players[index]).filter(Boolean)
    if (eligible.length === 0) {
      undistributed += pot.amount
      continue
    }

    const hiWinners = pickMinBy(eligible, player => player.handScore)
    let lowWinners = []
    if (lowRules) {
      lowWinners = pickMinBy(eligible, player => player.lowScore)
    }

    let hiAmount = pot.amount
    let lowAmount = 0
    if (lowRules && lowWinners.length > 0) {
      lowAmount = Math.floor(pot.amount / 2)
      hiAmount = pot.amount - lowAmount
    }

    if (hiWinners.length > 0) {
      undistributed += payShare(hiWinners, hiAmount, 'hi')
    } else {
      undistributed += hiAmount
    }

    if (lowAmount > 0) {
      if (lowWinners.length > 0) {
        undistributed += payShare(lowWinners, lowAmount, 'low')
      } else {
        undistributed += lowAmount
      }
    }

    potResults.push({
      amount: pot.amount,
      hiAmount,
      lowAmount,
      hiWinners: hiWinners.map(player => player.name),
      lowWinners: lowWinners.map(player => player.name),
      eligible: eligible.map(player => player.name)
    })
  }

  return { distributions, breakdown, undistributed, potResults }
}
