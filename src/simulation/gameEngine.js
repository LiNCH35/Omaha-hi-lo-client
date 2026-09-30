import { SMALL_BLIND, BIG_BLIND, HUMAN_PLAYER_INDEX, getBotDecision } from '@/helpers/gameLogic'
import { determineWinner, translateHandDescription } from '@/helpers/pokerEvaluator'
import { evaluateStartingHand } from '@/helpers/evaluateStartingHand'
import { debugLog, infoLog, successLog, warningLog, errorLog } from '@/helpers/debugLogger'
import { buildPots, distributePots } from '@/helpers/sidePots'

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
        this.store.resetPlayerState(player, currentChips)
        
        // Only give cards if player has chips
        if (currentChips > 0) {
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
          // Player is bankrupt, mark as folded
          player.hasFolded = true
        }
      } else {
        this.store.resetPlayerState(player, 0)
        player.hasFolded = true
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
    
    // Check if there are enough active players (not folded)
    const activePlayers = players.filter(p => !p.hasFolded)
    if (activePlayers.length < 2) {
      warningLog('Недостаточно активных игроков для продолжения игры')
      if (activePlayers.length === 1) {
        this.endGameByFold(activePlayers[0])
      } else {
        // No active players at all - this means everyone is bankrupt
        // Don't end the game here, let the user decide to start a new game
        this.store.setStep('end')
        warningLog('Все игроки обанкротились! Нажмите "Новая игра" для начала новой раздачи.')
      }
      return
    }
    
    // Check if all active players are all-in (no chips left)
    const playersWithChips = activePlayers.filter(p => p.chips > 0)
    if (playersWithChips.length === 0) {
      infoLog('Все игроки all-in! Переходим к вскрытию.')
      // All players are all-in, skip betting and go to next street
      this.nextStreet()
      return
    }
    
    players.forEach(player => {
      player.currentBet = 0
      player.hasActed = false
    })
    
    this.store.setCurrentBet(0)
    this.store.setPlayersActedCount(0)
    
    if (step === 'preflop') {
      // Blinds go to the next active players after the dealer (folded/bankrupt are not counted)
      const findNextActive = startIndex => {
        for (let offset = 1; offset <= playerCount; offset++) {
          const index = (startIndex + offset) % playerCount
          if (!players[index].hasFolded && players[index].chips > 0) {
            return index
          }
        }
        return -1
      }

      const smallBlindIndex = findNextActive(dealerIndex)
      const bigBlindIndex = smallBlindIndex !== -1 ? findNextActive(smallBlindIndex) : -1
      if (bigBlindIndex === -1) {
        warningLog('Недостаточно активных игроков для блайндов')
        return
      }

      // Small blind
      const smallBlindPlayer = players[smallBlindIndex]
      if (smallBlindPlayer.chips >= SMALL_BLIND) {
        smallBlindPlayer.chips -= SMALL_BLIND
        smallBlindPlayer.currentBet = SMALL_BLIND
        smallBlindPlayer.totalBet += SMALL_BLIND
        smallBlindPlayer.hasActed = true
        this.store.addToPot(SMALL_BLIND)
        this.store.incrementPlayersActedCount()
        infoLog(`${smallBlindPlayer.name} ставит малый блайнд $${SMALL_BLIND}`)
      } else {
        // Player doesn't have enough for small blind, goes all-in
        const allInAmount = smallBlindPlayer.chips
        smallBlindPlayer.chips = 0
        smallBlindPlayer.currentBet = allInAmount
        smallBlindPlayer.totalBet += allInAmount
        smallBlindPlayer.hasActed = true
        this.store.addToPot(allInAmount)
        this.store.incrementPlayersActedCount()
        infoLog(`${smallBlindPlayer.name} ставит все фишки $${allInAmount} (all-in)`)
      }

      // Big blind (hasActed stays false - BB gets the option to check or raise)
      const bigBlindPlayer = players[bigBlindIndex]
      if (bigBlindPlayer.chips >= BIG_BLIND) {
        bigBlindPlayer.chips -= BIG_BLIND
        bigBlindPlayer.currentBet = BIG_BLIND
        bigBlindPlayer.totalBet += BIG_BLIND
        this.store.addToPot(BIG_BLIND)
        this.store.setCurrentBet(BIG_BLIND)
        this.store.incrementPlayersActedCount()
        infoLog(`${bigBlindPlayer.name} ставит большой блайнд $${BIG_BLIND}`)
      } else {
        // Player doesn't have enough for big blind, goes all-in
        const allInAmount = bigBlindPlayer.chips
        bigBlindPlayer.chips = 0
        bigBlindPlayer.currentBet = allInAmount
        bigBlindPlayer.totalBet += allInAmount
        this.store.addToPot(allInAmount)
        this.store.setCurrentBet(Math.max(this.store.getCurrentBet(), allInAmount))
        this.store.incrementPlayersActedCount()
        infoLog(`${bigBlindPlayer.name} ставит все фишки $${allInAmount} (all-in)`)
      }

      // First player to act - next active player after the big blind
      const firstToActIndex = findNextActive(bigBlindIndex)
      this.store.setCurrentPlayerIndex(firstToActIndex)
      successLog(`Банк после блайндов: $${this.store.getPot()}`)
    } else {
      // On later streets, first player is next active after dealer
      const findNextActive = startIndex => {
        for (let offset = 1; offset <= playerCount; offset++) {
          const index = (startIndex + offset) % playerCount
          if (!players[index].hasFolded && players[index].chips > 0) {
            return index
          }
        }
        return -1
      }
      const firstToActIndex = findNextActive(dealerIndex)
      if (firstToActIndex !== -1) {
        this.store.setCurrentPlayerIndex(firstToActIndex)
      }
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
        
        // Allow normal call to match currentBet (which may be higher than all-in opponent)
        if (player.chips >= callAmount) {
          player.chips -= callAmount
          player.currentBet = currentBet
          player.totalBet += callAmount
          player.hasActed = true
          this.store.incrementPlayersActedCount()
          this.store.addToPot(callAmount)
          infoLog(`${player.name} коллирует $${callAmount}`)
        } else {
          // Not enough chips, go all-in
          const allInAmount = player.chips
          player.chips = 0
          player.currentBet += allInAmount
          player.totalBet += allInAmount
          player.hasActed = true
          this.store.incrementPlayersActedCount()
          this.store.addToPot(allInAmount)
          this.store.setCurrentBet(Math.max(this.store.getCurrentBet(), player.currentBet))
          infoLog(`${player.name} идёт all-in $${allInAmount} (всего в банке: $${player.currentBet})`)
        }
        break
      }
      case 'raise': {
        const raiseTotal = raiseAmount
        const additionalBet = raiseTotal - player.currentBet
        const pot = this.store.getPot()

        // Invalid raise (not above the current bet) or bigger than call + pot - fall back to check or call
        if (additionalBet <= 0 || additionalBet > callAmount + pot) {
          infoLog(`${player.name} хочет рейзить до $${raiseTotal}. Обрабатываем как чек или колл.`)
          // Treat as call to currentBet - don't reset hasActed for other players
          const callAmount = currentBet - player.currentBet
          if (callAmount > 0 && player.chips >= callAmount) {
            player.chips -= callAmount
            player.currentBet = currentBet
            player.totalBet += callAmount
            player.hasActed = true
            this.store.incrementPlayersActedCount()
            this.store.addToPot(callAmount)
            infoLog(`${player.name} коллирует $${callAmount} (рейз выше банка)`)
          } else if (callAmount === 0) {
            player.hasActed = true
            this.store.incrementPlayersActedCount()
            infoLog(`${player.name} чекает (рейз выше банка)`)
          } else {
            // Not enough chips, go all-in
            const allInAmount = player.chips
            player.chips = 0
            player.currentBet += allInAmount
            player.totalBet += allInAmount
            player.hasActed = true
            this.store.incrementPlayersActedCount()
            this.store.addToPot(allInAmount)
            this.store.setCurrentBet(Math.max(this.store.getCurrentBet(), player.currentBet))
            infoLog(`${player.name} идёт all-in $${allInAmount} (рейз выше банка)`)
          }
          return true
        }

        // Check if player has enough chips for the raise
        if (player.chips >= additionalBet) {
          player.chips -= additionalBet
          player.currentBet = raiseTotal
          player.totalBet += additionalBet
          player.hasActed = true
          this.store.incrementPlayersActedCount()
          // Reset hasActed for players who haven't matched this raise
          players.forEach((p, idx) => {
            if (idx !== playerIndex && !p.hasFolded && p.chips > 0 && p.currentBet < raiseTotal) {
              p.hasActed = false
            }
          })
          this.store.addToPot(additionalBet)
          this.store.setCurrentBet(raiseTotal)
          infoLog(`${player.name} рейзит до $${raiseTotal}`)
        } else {
          // Not enough chips, go all-in with whatever they have
          const allInAmount = player.chips
          const actualRaiseTotal = player.currentBet + allInAmount

          player.chips = 0
          player.currentBet = actualRaiseTotal
          player.totalBet += allInAmount
          player.hasActed = true
          this.store.incrementPlayersActedCount()

          // All-in raise still demands a response: players with chips must call or fold
          players.forEach((p, idx) => {
            if (idx !== playerIndex && !p.hasFolded && p.chips > 0 && p.currentBet < actualRaiseTotal) {
              p.hasActed = false
            }
          })

          this.store.addToPot(allInAmount)
          this.store.setCurrentBet(Math.max(this.store.getCurrentBet(), actualRaiseTotal))
          infoLog(`${player.name} идёт all-in $${allInAmount} (всего в банке: $${actualRaiseTotal})`)
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
    
    // If player has no chips, they're all-in, skip action
    if (player.chips <= 0) {
      debugLog('action:bot:skip-all-in', { player: player.name })
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
    
    // Check if all active players are all-in
    const playersWithChips = activePlayers.filter(p => p.chips > 0)
    if (playersWithChips.length === 0) {
      infoLog('Все активные игроки all-in! Переходим к следующей улице.')
      this.nextStreet()
      return
    }
    
    this.store.setCurrentPlayerIndex((this.store.getCurrentPlayerIndex() + 1) % playerCount)
    
    let iterations = 0
    const maxIterations = playerCount + 1
    while (players[this.store.getCurrentPlayerIndex()].hasFolded && iterations < maxIterations) {
      this.store.setCurrentPlayerIndex((this.store.getCurrentPlayerIndex() + 1) % playerCount)
      iterations++
    }
    
    // Round ends only when everyone has acted AND matched the current bet
    // (players without chips are all-in and exempt)
    const streetCurrentBet = this.store.getCurrentBet()
    const allActed = !players.find(p => !p.hasFolded && p.chips > 0 && (!p.hasActed || p.currentBet < streetCurrentBet))
    console.log({allActed, l: this.store.getPlayersActedCount(), a: activePlayers.length, activePlayers})
    
    if (allActed) {
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
      players[winnerIndex].winnings = (players[winnerIndex].winnings || 0) + this.store.getPot()
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
      
      // Build pots from total contributions (handles side pots and uncalled bets)
      const potTotal = this.store.getPot()
      const invested = players.reduce((sum, player) => sum + (player.totalBet || 0), 0)
      if (invested !== potTotal) {
        warningLog(`Банк $${potTotal} не совпадает с суммой ставок игроков $${invested}`)
      }

      const { pots, refund, mismatch } = buildPots(players)
      if (mismatch !== 0) {
        warningLog(`Расхождение при формировании потов: $${mismatch}`)
      }

      if (refund && refund.amount > 0) {
        const refundPlayer = players[refund.playerIndex]
        if (refundPlayer) {
          refundPlayer.chips += refund.amount
          successLog(`${refundPlayer.name} получает возврат незаершённой ставки $${refund.amount}`)
        }
      }

      const { distributions, breakdown, undistributed, potResults } = distributePots(pots, players, lowRules)
      if (undistributed > 0) {
        warningLog(`Не распределено $${undistributed}`)
      }

      if (potResults.length > 1) {
        infoLog(`Сформировано ${potResults.length} потов`)
      }
      potResults.forEach((pot, index) => {
        const potName = potResults.length > 1 ? `Пот ${index + 1}` : 'Пот'
        let summary = `${potName} ($${pot.amount}): хи $${pot.hiAmount} → ${pot.hiWinners.join(', ')}`
        if (pot.lowAmount > 0) {
          summary += `; ло $${pot.lowAmount} → ${pot.lowWinners.join(', ')}`
        }
        infoLog(summary)
      })

      // Distribute winnings
      distributions.forEach((amount, playerName) => {
        const winnerIndex = players.findIndex(p => p.name === playerName)
        if (winnerIndex !== -1) {
          players[winnerIndex].chips += amount
          players[winnerIndex].winnings = (players[winnerIndex].winnings || 0) + amount
          successLog(`${playerName} получает $${amount}`)
        }
      })

      // Update player states
      let totalHiPaid = 0
      let totalLowPaid = 0
      breakdown.forEach(share => {
        totalHiPaid += share.hi
        totalLowPaid += share.low
      })

      players.forEach(player => {
        player.combinations = { hi: null, lo: null }
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

          const shares = breakdown.get(player.name) || { hi: 0, low: 0 }
          if (totalHiPaid > 0) {
            player.winPercentage = Math.round((shares.hi / totalHiPaid) * 100)
          }
          if (totalLowPaid > 0) {
            player.lowWinPercentage = Math.round((shares.low / totalLowPaid) * 100)
          }
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
