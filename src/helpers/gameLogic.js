// Game constants
export const SMALL_BLIND = 10
export const BIG_BLIND = 20
export const DEFAULT_CHIPS = 1000
export const HUMAN_PLAYER_INDEX = 0

/**
 * Calculate maximum number of players based on card count
 */
export function calculateMaxPlayers(cardCount) {
  return Math.min(Math.floor((52 - 5) / cardCount), 8)
}

/**
 * Generate available player counts
 */
export function generateAvailablePlayerCounts(maxPlayers) {
  const counts = []
  for (let i = 2; i <= maxPlayers; i++) {
    counts.push(i)
  }
  return counts
}

/**
 * Get board text for current step
 */
export function getBoardText(step) {
  const texts = {
    '': 'Нажмите "next" для начала',
    preflop: 'Префлоп',
    flop: 'Флоп',
    turn: 'Терн',
    river: 'Ривер',
    end: 'Игра завершена'
  }
  return texts[step] || 'Стол'
}

/**
 * Validate raise amount against maximum and minimum
 */
export function validateRaiseAmount(raiseAmount, max, min = 10) {
  let validated = raiseAmount
  if (validated > max) {
    validated = max
  }
  if (validated < min) {
    validated = min
  }
  return validated
}

/**
 * Get bot decision based on current game state
 */
export function getBotDecision(player, currentBet) {
  const random = Math.random()
  const callAmount = currentBet - player.currentBet
  
  if (callAmount === 0) {
    return 'check'
  } else if (random > 0.3) {
    return 'call'
  }
  return 'fold'
}

/**
 * Simple AI bot decision with probabilities
 */
export function getAIBotDecision(player, gameContext) {
  return {
    fold: 0.1,
    check: 0.3,
    call: 0.4,
    raise: 0.2
  }
}

/**
 * Calculate best combination from cards
 */
export function bestCombo(cards) {
  const values = cards.map(c => c[0])
  const suits = cards.map(c => c[1])
  const valuesSet = new Set(values)
  const suitsSet = new Set(suits)
  const isStreet = valuesSet.size === 5 && values[4] - values[0] === 4
  const isFlush = suitsSet.size === 1

  if (isStreet && isFlush) {
    return `street flush, ${values[4]}`
  }
  if (isFlush) {
    return `flush, ${values.join('_')}`
  }
  if (isStreet) {
    return `street ${values[4]}`
  }

  if (valuesSet.size !== 5) {
    let maxRepeats = 0
    let currentRepeats = 1
    const repeatsValues = []

    for (let i = 1; i < 6; i++) {
      if (values[i] === values[i - 1]) {
        currentRepeats++
      } else {
        if (currentRepeats > 1) {
          repeatsValues[values[i - 1]] = currentRepeats
          if (currentRepeats > maxRepeats) {
            maxRepeats = currentRepeats
          }
        }
        currentRepeats = 1
      }
    }

    const kare = Object.keys(repeatsValues).find(key => repeatsValues[key] === 4)
    const set = Object.keys(repeatsValues).find(key => repeatsValues[key] === 3)
    let pairs = Object.keys(repeatsValues).filter(key => repeatsValues[key] === 2)

    if (kare) {
      return `kare, ${kare}`
    }
    if (set && pairs.length) {
      return `full house, ${set}_${pairs[0]}`
    }
    if (set) {
      return `set, ${set}`
    }
    if (pairs.length === 2) {
      pairs = pairs.sort((a, b) => b - a)
      return `2 pairs, ${pairs[0]}_${pairs[1]}`
    }
    if (pairs.length === 1) {
      return `pair, ${pairs[0]}`
    }
  }

  return `height card ${cards[4]}`
}

/**
 * Check if board card is in player's best hand
 */
export function isBoardCardInHand(card, handCards) {
  if (!handCards || !Array.isArray(handCards)) {
    return false
  }
  return handCards.some(c =>
    (typeof c === 'object' && c.rank === card.rank && c.suit === card.suit) ||
    (typeof c === 'string' && c === `${card.rank}${card.suit}`)
  )
}

/**
 * Check if board card is in both hi and low hands
 */
export function isBoardCardInBothHands(card, bestHand, lowHand) {
  return isBoardCardInHand(card, bestHand) && isBoardCardInHand(card, lowHand)
}

/**
 * Reset player state for new hand
 */
export function resetPlayerState(player, chips) {
  player.cards = []
  player.combinations = { hi: null, lo: null }
  player.bestHand = []
  player.isWinner = false
  player.isLowWinner = false
  player.lowHand = null
  player.lowDescription = null
  player.lowScore = null
  player.startingHandEvaluation = null
  player.currentBet = 0
  player.totalBet = 0
  player.hasFolded = false
  player.hasActed = false
  player.showCards = false
  player.winnings = 0
  if (chips !== undefined) {
    player.chips = chips
  }
}
