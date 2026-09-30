/**
 * Side pot management for all-in scenarios
 */

export class SidePot {
  constructor(amount, eligiblePlayers) {
    this.amount = amount
    this.eligiblePlayers = eligiblePlayers // Array of player indices who can win this pot
  }
}

/**
 * Calculate side pots when a player goes all-in
 */
export function calculateSidePots(players, currentBet, allInPlayerIndex, allInAmount) {
  const sidePots = []
  const mainPotAmount = allInAmount
  const sidePotAmount = currentBet - allInAmount
  
  // Main pot: all players are eligible
  const mainPotEligible = players
    .map((p, i) => i)
    .filter(i => !players[i].hasFolded)
  
  sidePots.push(new SidePot(mainPotAmount, mainPotEligible))
  
  // Side pot: only players who can cover the full bet are eligible
  if (sidePotAmount > 0) {
    const sidePotEligible = players
      .map((p, i) => i)
      .filter(i => !players[i].hasFolded && players[i].chips >= currentBet)
    
    if (sidePotEligible.length > 1) {
      sidePots.push(new SidePot(sidePotAmount, sidePotEligible))
    }
  }
  
  return sidePots
}

/**
 * Calculate all side pots for the current betting round
 */
export function calculateAllSidePots(players, currentBet) {
  const sidePots = []
  const activePlayers = players.filter(p => !p.hasFolded)
  
  if (activePlayers.length < 2) {
    return sidePots
  }
  
  // If all players have the same bet, no side pots needed
  const uniqueBets = new Set(activePlayers.map(p => p.currentBet))
  if (uniqueBets.size === 1) {
    return sidePots
  }
  
  // Find all unique bet amounts to create side pots
  const betAmounts = activePlayers
    .map(p => p.currentBet)
    .filter((bet, index, self) => self.indexOf(bet) === index)
    .sort((a, b) => a - b)
  
  // Create side pots for each bet level
  let previousBet = 0
  for (const bet of betAmounts) {
    const betDifference = bet - previousBet
    if (betDifference > 0) {
      const eligiblePlayers = activePlayers
        .map((p, i) => players.indexOf(p))
        .filter(i => players[i].currentBet >= bet)
      
      sidePots.push(new SidePot(
        betDifference * eligiblePlayers.length,
        eligiblePlayers
      ))
    }
    previousBet = bet
  }
  
  return sidePots
}

/**
 * Distribute pot among winners considering side pots
 */
export function distributePotWithSidePots(pot, winners, sidePots, lowWinners = [], lowRules = false, players = []) {
  const distributions = new Map()
  
  // Initialize distributions for all players
  winners.forEach(winner => {
    distributions.set(winner.name, 0)
  })
  lowWinners.forEach(winner => {
    if (!distributions.has(winner.name)) {
      distributions.set(winner.name, 0)
    }
  })
  
  // If no side pots or all players are all-in, use simple distribution
  if (sidePots.length === 0) {
    let hiPot = pot
    let lowPot = 0
    
    if (lowRules && lowWinners.length > 0) {
      hiPot = Math.floor(pot / 2)
      lowPot = pot - hiPot
    }
    
    // Distribute hi pot
    const hiShare = hiPot > 0 ? Math.floor(hiPot / winners.length) : 0
    winners.forEach(winner => {
      distributions.set(winner.name, distributions.get(winner.name) + hiShare)
    })
    
    // Distribute low pot
    if (lowRules && lowWinners.length > 0) {
      const lowShare = lowPot > 0 ? Math.floor(lowPot / lowWinners.length) : 0
      lowWinners.forEach(winner => {
        distributions.set(winner.name, distributions.get(winner.name) + lowShare)
      })
    }
    
    return distributions
  }
  
  // Distribute each side pot
  for (const sidePot of sidePots) {
    const eligibleWinners = winners.filter(w => 
      sidePot.eligiblePlayers.includes(players.indexOf(w))
    )
    
    if (eligibleWinners.length === 0) continue
    
    const share = Math.floor(sidePot.amount / eligibleWinners.length)
    eligibleWinners.forEach(winner => {
      distributions.set(winner.name, distributions.get(winner.name) + share)
    })
  }
  
  // Handle low pot if applicable
  if (lowRules && lowWinners.length > 0) {
    const lowPotAmount = Math.floor(pot / 2)
    const hiPotAmount = pot - lowPotAmount
    
    // Distribute low pot among low winners
    const lowShare = Math.floor(lowPotAmount / lowWinners.length)
    lowWinners.forEach(winner => {
      distributions.set(winner.name, distributions.get(winner.name) + lowShare)
    })
  }
  
  return distributions
}