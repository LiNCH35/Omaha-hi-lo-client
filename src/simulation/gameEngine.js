import { SMALL_BLIND, BIG_BLIND, HUMAN_PLAYER_INDEX, getBotDecision, calculatePotDistribution } from '@/helpers/gameLogic'
import { determineWinner, translateHandDescription } from '@/helpers/pokerEvaluator'
import { evaluateStartingHand } from '@/helpers/evaluateStartingHand'
import { debugLog, infoLog, successLog, warningLog, errorLog } from '@/helpers/debugLogger'

const BOT_ACTION_DELAY = 300
const STREET_DELAY = 300

/**
 * Game simulation engine
 * Handles game flow, betting rounds, and bot actions
 */
export class GameEngine {
  constructor(store) {
    this.store = store
    this.timers = []
  }

  /**
   * Schedule a tracked timer
   */
  scheduleTracked(fn, delay, source) {
    const timerId = setTimeout(() => {
      this.timers = this.timers.filter(id => id !== timerId)
      debugLog('timer:fire', { source })
      fn()
    }, delay)
    this.timers.push(timerId)
    debugLog('timer:scheduled', { source, delay, timerId })
    return timerId
  }

  /**
   * Clear all pending timers
   */
  clearPendingTimers(source) {
    if (this.timers.length > 0) {
      debugLog('timer:cleared', { source, timerIds: [...this.timers] })
    }
    this.timers.forEach(id => clearTimeout(id))
    this.timers = []
  }

  /**
   * Start a new hand
   */
  startHand() {
    debugLog('game:start')
    this.clearPendingTimers('start')
    
    this.store.shuffleDeck()
    this.store.setShowHiCards(false)
    this.store.setShowLoCards(false)
    this.store.setPot(0)
    this.store.setCurrentBet(0)
    this.store.setCurrentPlayerIndex(0)
    this.store.setGamePhase('betting')
    
    const players = this.store.getPlayers()
    const cardCount = this.store.getCardCount()
    const cardDeck = this.store.getCardDeck()
    
    players.forEach((player, index) => {
      if (index < this.store.getPlayerCount()) {
        const currentChips = player.chips
        this.store.resetPlayerState(player, undefined)
        
        if (currentChips !== undefined) {
          player.chips = currentChips
        } else {
          player.chips = 1000
        }
        
        for (let i = 0; i < cardCount; i++) {
          player.cards.push(cardDeck.pop())
        }
        
        if (cardCount >= 4) {
          try {
            const handEvaluation = evaluateStartingHand(player.cards)
            player.startingHandEvaluation = handEvaluation.overall
          } catch (error) {
            debugLog('game:start:evaluate-error', { player: player.name, error: String(error) })
            player.startingHandEvaluation = null
          }
        }
      } else {
        this.store.resetPlayerState(player, 1000)
      }
    })
    
    this.store.setStep('preflop')
    this.startBettingRound()
    debugLog('game:start:done', { after: this.store.snapshot() })
  }

  /**
   * Start betting round with blinds
   */
  startBettingRound() {
    debugLog('betting:round-start')
    
    const players = this.store.getPlayers()
    const playerCount = this.store.getPlayerCount()
    const step = this.store.getStep()
    const dealerIndex = this.store.getDealerIndex()
    
    players.forEach(player => {
      player.currentBet = 0
      player.hasActed = false
    })
    
    this.store.setCurrentBet(0)
    this.store.setPlayersActedCount(0)
    
    if (step === 'preflop') {
      // Small blind
      const smallBlindIndex = (dealerIndex + 1) % playerCount
      const smallBlindPlayer = players[smallBlindIndex]
      if (smallBlindPlayer) {
        if (smallBlindPlayer.chips === undefined) {
          smallBlindPlayer.chips = 1000
        }
        if (smallBlindPlayer.chips >= SMALL_BLIND) {
          smallBlindPlayer.chips -= SMALL_BLIND
          smallBlindPlayer.currentBet = SMALL_BLIND
          smallBlindPlayer.hasActed = true
          this.store.addToPot(SMALL_BLIND)
          this.store.incrementPlayersActedCount()
          infoLog(`${smallBlindPlayer.name} ставит малый блайнд $${SMALL_BLIND}`)
        }
      }
      
      // Big blind
      const bigBlindIndex = (dealerIndex + 2) % playerCount
      const bigBlindPlayer = players[bigBlindIndex]
      if (bigBlindPlayer) {
        if (bigBlindPlayer.chips === undefined) {
          bigBlindPlayer.chips = 1000
        }
        if (bigBlindPlayer.chips >= BIG_BLIND) {
          bigBlindPlayer.chips -= BIG_BLIND
          bigBlindPlayer.currentBet = BIG_BLIND
          bigBlindPlayer.hasActed = true
          this.store.addToPot(BIG_BLIND)
          this.store.setCurrentBet(BIG_BLIND)
          this.store.incrementPlayersActedCount()
          infoLog(`${bigBlindPlayer.name} ставит большой блайнд $${BIG_BLIND}`)
        }
      }
      
      // First player to act - third after dealer
      this.store.setCurrentPlayerIndex((dealerIndex + 3) % playerCount)
      successLog(`Банк после блайндов: $${this.store.getPot()}`)
    } else {
      // On later streets, first player is next after dealer
      this.store.setCurrentPlayerIndex((dealerIndex + 1) % playerCount)
    }
    
    debugLog('betting:round-start:done', { after: this.store.snapshot() })
    
    if (this.store.getCurrentPlayerIndex() === HUMAN_PLAYER_INDEX) {
      debugLog('betting:waiting-for-human', { via: 'startBettingRound' })
      return
    }
    
    if (this.store.getSimulationMode()) {
      this.scheduleTracked(() => this.botAction(), BOT_ACTION_DELAY, 'botAction:startBettingRound')
    }
  }

  /**
   * Apply player action
   */
  applyAction(playerIndex, action) {
    const players = this.store.getPlayers()
    const player = players[playerIndex]
    const currentBet = this.store.getCurrentBet()
    const raiseAmount = this.store.getRaiseAmount()
    const callAmount = currentBet - player.currentBet

    switch (action) {
      case 'fold':
        player.hasFolded = true
        player.hasActed = true
        this.store.incrementPlayersActedCount()
        infoLog(`${player.name} фолдит`)
        break
      case 'check':
        infoLog(`${player.name} чекает`)
        if (callAmount === 0) {
          player.hasActed = true
          this.store.incrementPlayersActedCount()
        } else {
          warningLog('Нельзя чекить когда есть ставка')
          return false
        }
        break
      case 'call': {
        if (callAmount < 0) {
          errorLog('Ошибка: отрицательная сумма колла')
          return false
        }
        if (player.chips >= callAmount) {
          player.chips -= callAmount
          player.currentBet = currentBet
          player.hasActed = true
          this.store.incrementPlayersActedCount()
          this.store.addToPot(callAmount)
          infoLog(`${player.name} коллирует $${callAmount}`)
        } else {
          warningLog('Недостаточно фишек для колла')
          return false
        }
        break
      }
      case 'raise': {
        const raiseTotal = raiseAmount
        const totalBet = raiseTotal - player.currentBet
        const pot = this.store.getPot()
        
        if (totalBet > pot) {
          warningLog('Превышен пот лимит')
          return false
        }
        if (player.chips >= totalBet) {
          player.chips -= totalBet
          player.currentBet = raiseTotal
          player.hasActed = true
          this.store.incrementPlayersActedCount()
          players.forEach((p, idx) => {
            if (idx !== playerIndex && !p.hasFolded && p.currentBet < raiseTotal) {
              p.hasActed = false
            }
          })
          this.store.addToPot(totalBet)
          this.store.setCurrentBet(raiseTotal)
          infoLog(`${player.name} рейзит до $${raiseTotal}`)
        } else {
          warningLog('Недостаточно фишек для рейза')
          return false
        }
        break
      }
    }
    return true
  }

  /**
   * Handle bot action
   */
  botAction() {
    debugLog('action:bot')
    
    if (this.store.getCurrentPlayerIndex() === HUMAN_PLAYER_INDEX) {
      debugLog('action:bot:BLOCKED', { reason: 'Попытка автодействия за Player 1', ...this.store.snapshot() })
      console.warn('[POKER-DEBUG] Автодействие бота за Player 1 заблокировано')
      return
    }
    
    const players = this.store.getPlayers()
    const currentPlayerIndex = this.store.getCurrentPlayerIndex()
    const player = players[currentPlayerIndex]
    
    if (!player || player.hasFolded) {
      this.nextPlayer()
      return
    }
    
    const action = getBotDecision(player, this.store.getCurrentBet())
    debugLog('action:bot:decision', { player: player.name, action })
    this.applyAction(currentPlayerIndex, action)
    this.nextPlayer()
  }

  /**
   * Move to next player
   */
  nextPlayer() {
    debugLog('betting:next-player')
    
    const players = this.store.getPlayers()
    const playerCount = this.store.getPlayerCount()
    const activePlayers = players.filter(p => !p.hasFolded)
    
    if (activePlayers.length === 1) {
      this.endGameByFold(activePlayers[0])
      return
    }
    
    this.store.setCurrentPlayerIndex((this.store.getCurrentPlayerIndex() + 1) % playerCount)
    
    let iterations = 0
    const maxIterations = playerCount + 1
    while (players[this.store.getCurrentPlayerIndex()].hasFolded && iterations < maxIterations) {
      this.store.setCurrentPlayerIndex((this.store.getCurrentPlayerIndex() + 1) % playerCount)
      iterations++
    }
    
    const allActed = this.store.getPlayersActedCount() >= activePlayers.length
    const allBetsEqual = activePlayers.every(p => p.currentBet === this.store.getCurrentBet())
    
    if (allActed && allBetsEqual) {
      this.nextStreet()
      return
    }
    
    if (this.store.getCurrentPlayerIndex() === HUMAN_PLAYER_INDEX) {
      debugLog('betting:waiting-for-human', { via: 'nextPlayer' })
      return
    }
    
    if (this.store.getSimulationMode()) {
      this.scheduleTracked(() => this.botAction(), BOT_ACTION_DELAY, 'botAction:nextPlayer')
    }
  }

  /**
   * Move to next street
   */
  nextStreet() {
    debugLog('street:advance', { from: this.store.getStep() })
    const step = this.store.getStep()
    
    if (step === 'preflop') {
      this.openFlop()
    } else if (step === 'flop') {
      this.openTurn()
    } else if (step === 'turn') {
      this.openRiver()
    } else if (step === 'river') {
      this.calculateWinner()
      this.store.setStep('end')
      return
    }
    
    if (this.store.getStep() !== 'end' && this.store.getSimulationMode()) {
      this.scheduleTracked(() => this.startBettingRound(), STREET_DELAY, 'startBettingRound:nextStreet')
    }
  }

  /**
   * Open flop (3 cards)
   */
  openFlop() {
    const cardDeck = this.store.getCardDeck()
    const boardCards = this.store.getBoardCards()
    
    for (let i = 0; i < 3; i++) {
      boardCards.push(cardDeck.pop())
    }
    this.store.setStep('flop')
    debugLog('street:opened', { street: 'flop', boardCards: boardCards.length })
  }

  /**
   * Open turn (1 card)
   */
  openTurn() {
    const cardDeck = this.store.getCardDeck()
    const boardCards = this.store.getBoardCards()
    
    boardCards.push(cardDeck.pop())
    this.store.setStep('turn')
    debugLog('street:opened', { street: 'turn', boardCards: boardCards.length })
  }

  /**
   * Open river (1 card)
   */
  openRiver() {
    const cardDeck = this.store.getCardDeck()
    const boardCards = this.store.getBoardCards()
    
    boardCards.push(cardDeck.pop())
    this.store.setStep('river')
    debugLog('street:opened', { street: 'river', boardCards: boardCards.length })
  }

  /**
   * End game by fold (only one player left)
   */
  endGameByFold(winner) {
    this.store.setStep('end')
    const players = this.store.getPlayers()
    const winnerIndex = players.findIndex(p => p.name === winner.name)
    
    if (winnerIndex !== -1) {
      players[winnerIndex].chips += this.store.getPot()
      players[winnerIndex].isWinner = true
      players[winnerIndex].showCards = true
    }
    
    successLog(`${winner.name} выигрывает банк $${this.store.getPot()} по фолду`)
    debugLog('game:end-by-fold', { winner: winner.name, potWon: this.store.getPot() })
    this.store.setPot(0)
  }

  /**
   * Calculate winner and distribute pot
   */
  calculateWinner() {
    const players = this.store.getPlayers()
    const boardCards = this.store.getBoardCards()
    const lowRules = this.store.getLowRules()
    
    if (!Array.isArray(players) || boardCards.length < 5) {
      warningLog('Недостаточно карт на столе для определения победителя')
      return
    }
    
    debugLog('calc:start', { lowRules, boardCards: boardCards.length })
    const result = determineWinner(players, boardCards, lowRules)
    
    if (result.winners.length > 0) {
      successLog('=== РЕЗУЛЬТАТЫ РАЗДАЧИ ===')
      if (result.isSplit) {
        infoLog(`Сплит пот! ${result.winners.length} победителей:`)
      } else {
        infoLog('Победитель:')
      }
      
      result.winners.forEach(winner => {
        const translatedDesc = translateHandDescription(winner.handDescription)
        infoLog(`${winner.name}: ${translatedDesc} (score: ${winner.handScore}, rank: ${winner.handRank})`)
        infoLog(`Лучшая комбинация: ${winner.bestHand.join(', ')}`)
      })
      
      if (lowRules && result.lowWinners.length > 0) {
        successLog('=== LOW ПОБЕДИТЕЛИ ===')
        if (result.lowIsSplit) {
          infoLog(`Сплит low пот! ${result.lowWinners.length} победителей:`)
        } else {
          infoLog('Low победитель:')
        }
        result.lowWinners.forEach(winner => {
          infoLog(`${winner.name}: ${winner.lowDescription} (score: ${winner.lowScore})`)
          infoLog(`Low комбинация: ${winner.lowHand.join(', ')}`)
        })
      }
      
      const distribution = calculatePotDistribution(
        this.store.getPot(),
        lowRules,
        result.winners.length,
        lowRules ? result.lowWinners.length : 0
      )
      
      // Distribute hi pot
      result.winners.forEach(winner => {
        const winnerIndex = players.findIndex(p => p.name === winner.name)
        if (winnerIndex !== -1) {
          players[winnerIndex].chips += distribution.hiSharePerWinner
          players[winnerIndex].winnings = (players[winnerIndex].winnings || 0) + distribution.hiSharePerWinner
          successLog(`${winner.name} получает $${distribution.hiSharePerWinner} от hi пота`)
        }
      })
      
      // Distribute low pot
      if (lowRules && result.lowWinners.length > 0) {
        result.lowWinners.forEach(winner => {
          const winnerIndex = players.findIndex(p => p.name === winner.name)
          if (winnerIndex !== -1) {
            players[winnerIndex].chips += distribution.lowSharePerWinner
            players[winnerIndex].winnings = (players[winnerIndex].winnings || 0) + distribution.lowSharePerWinner
            successLog(`${winner.name} получает $${distribution.lowSharePerWinner} от low пота`)
          }
        })
      }
      
      // Update player states
      const hiPotShare = lowRules ? 50 : 100
      const lowPotShare = result.winners.length > 0 ? 50 : 100
      
      players.forEach(player => {
        player.combinations = { hi: null, lo: null }
        player.bestHand = []
        player.isWinner = false
        player.isLowWinner = false
        player.winPercentage = 0
        player.lowWinPercentage = 0
        
        if (player.handDescription) {
          player.combinations = {
            hi: translateHandDescription(player.handDescription),
            lo: player.lowDescription || null
          }
          player.bestHand = player.bestHand || []
          player.isWinner = result.winners.some(winner => winner.name === player.name)
          player.isLowWinner = lowRules && result.lowWinners.some(winner => winner.name === player.name)
          player.winPercentage = player.isWinner ? Math.round(hiPotShare / result.winners.length) : 0
          player.lowWinPercentage = player.isLowWinner ? Math.round(lowPotShare / result.lowWinners.length) : 0
        }
      })
      
      // Show cards based on settings
      const showCardsAtEnd = this.store.getShowCardsAtEnd()
      if (showCardsAtEnd) {
        players.forEach(player => {
          player.showCards = true
        })
      } else {
        const activePlayers = players.filter(p => !p.hasFolded)
        const hasSingleWinner = result.winners.length === 1 && (!lowRules || result.lowWinners.length === 0)
        
        players.forEach(player => {
          if (!player.hasFolded && (hasSingleWinner || player.isWinner || player.isLowWinner)) {
            player.showCards = true
          } else {
            player.showCards = false
          }
        })
      }
      
      debugLog('calc:done', {
        winners: result.winners.map(w => w.name),
        lowWinners: result.lowWinners.map(w => w.name),
        potDistributed: this.store.getPot()
      })
    } else {
      errorLog('Не удалось определить победителя')
    }
  }
}
