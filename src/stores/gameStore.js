import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import cardDeckConfig from '@/config/cardDeck'
import shuffle from '@/helpers/shuffle'
import { createDefaultPlayers } from '@/helpers/players'
import { determineWinner, translateHandDescription } from '@/helpers/pokerEvaluator'
import { evaluateStartingHand } from '@/helpers/evaluateStartingHand'
import { debugLog } from '@/helpers/debugLogger'

export const SETTINGS_STORAGE_KEY = 'pokerGameSettings'

const HUMAN_PLAYER_INDEX = 0
const BOT_ACTION_DELAY = 300
const STREET_DELAY = 300
const SMALL_BLIND = 10
const BIG_BLIND = 20
const DEFAULT_CHIPS = 1000

export const useGameStore = defineStore('game', () => {
  const cardDeck = ref([...cardDeckConfig])
  const boardCards = ref([])
  const step = ref('')
  const hoveredPlayer = ref(null)
  const cardCount = ref(4)
  const playerCount = ref(8)
  const lowRules = ref(false)
  const simulationMode = ref(false)
  const showHiCards = ref(false)
  const showLoCards = ref(false)
  const showCardsAtEnd = ref(true)
  const pot = ref(0)
  const currentBet = ref(0)
  const currentPlayerIndex = ref(0)
  const gamePhase = ref('betting')
  const playersActedCount = ref(0)
  const raiseAmount = ref(20)
  const isProcessingAction = ref(false)
  const initialized = ref(false)
  const pendingTimers = ref([])
  const dealerIndex = ref(0)

  const maxPlayers = computed(() => Math.min(Math.floor((52 - 5) / cardCount.value), 8))
  const players = ref(createDefaultPlayers({ hasPlayer: true, length: maxPlayers.value }))

  const availablePlayerCounts = computed(() => {
    const counts = []
    for (let i = 2; i <= maxPlayers.value; i++) {
      counts.push(i)
    }
    return counts
  })

  const boardText = computed(() => {
    const texts = {
      '': 'Нажмите "next" для начала',
      preflop: 'Префлоп',
      flop: 'Флоп',
      turn: 'Терн',
      river: 'Ривер',
      end: 'Игра завершена'
    }
    return texts[step.value] || 'Стол'
  })

  function snapshot() {
    return {
      step: step.value,
      cardCount: cardCount.value,
      playerCount: playerCount.value,
      lowRules: lowRules.value,
      simulationMode: simulationMode.value,
      showCardsAtEnd: showCardsAtEnd.value,
      pot: pot.value,
      currentBet: currentBet.value,
      currentPlayerIndex: currentPlayerIndex.value,
      playersActedCount: playersActedCount.value,
      dealerIndex: dealerIndex.value
    }
  }

  function scheduleTracked(fn, delay, source) {
    const timerId = setTimeout(() => {
      pendingTimers.value = pendingTimers.value.filter(id => id !== timerId)
      debugLog('timer:fire', { source })
      fn()
    }, delay)
    pendingTimers.value.push(timerId)
    debugLog('timer:scheduled', { source, delay, timerId })
    return timerId
  }

  function clearPendingTimers(source) {
    if (pendingTimers.value.length > 0) {
      debugLog('timer:cleared', { source, timerIds: [...pendingTimers.value] })
    }
    pendingTimers.value.forEach(id => clearTimeout(id))
    pendingTimers.value = []
  }

  function saveSettingsToStorage(source = 'save') {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
        cardCount: cardCount.value,
        playerCount: playerCount.value,
        lowRules: lowRules.value,
        simulationMode: simulationMode.value,
        showCardsAtEnd: showCardsAtEnd.value
      }))
    } catch (error) {
      debugLog('settings:save-error', { source, error: String(error) })
    }
  }

  function applySettings(patch, { source = 'user', reset = true } = {}) {
    debugLog('settings:apply', { source, reset, patch, initialized: initialized.value, before: snapshot() })
    if (patch.cardCount !== undefined && patch.cardCount !== cardCount.value) {
      cardCount.value = patch.cardCount
    }
    if (playerCount.value > maxPlayers.value) {
      playerCount.value = maxPlayers.value
    }
    if (patch.playerCount !== undefined && patch.playerCount !== playerCount.value) {
      playerCount.value = patch.playerCount
    }
    if (patch.lowRules !== undefined && patch.lowRules !== lowRules.value) {
      lowRules.value = patch.lowRules
    }
    if (patch.simulationMode !== undefined && patch.simulationMode !== simulationMode.value) {
      simulationMode.value = patch.simulationMode
    }
    if (patch.showCardsAtEnd !== undefined && patch.showCardsAtEnd !== showCardsAtEnd.value) {
      showCardsAtEnd.value = patch.showCardsAtEnd
    }
    saveSettingsToStorage(source)
    if (reset && initialized.value) {
      debugLog('settings:apply-reset', { source, after: snapshot() })
      resetGame(false)
    } else {
      debugLog('settings:apply-no-reset', { source, after: snapshot() })
    }
  }

  function loadSettings(source = 'initial') {
    if (initialized.value) {
      debugLog('settings:load-skipped', { source, reason: 'already initialized' })
      return
    }
    debugLog('settings:load-start', { source })
    let settings = null
    try {
      const saved = localStorage.getItem(SETTINGS_STORAGE_KEY)
      if (saved) {
        settings = JSON.parse(saved)
      }
    } catch (error) {
      debugLog('settings:load-parse-error', { source, error: String(error) })
    }
    applySettings(settings || {}, { source, reset: false })
    players.value = createDefaultPlayers({ hasPlayer: true, length: playerCount.value })
    initialized.value = true
    debugLog('settings:load-done', { source, settings, after: snapshot() })
  }

  function resetPlayerState(player, chips) {
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
    player.hasFolded = false
    player.hasActed = false
    player.showCards = false
    player.winnings = 0
    if (chips !== undefined) {
      player.chips = chips
    }
  }

  function shuffleDeck() {
    cardDeck.value = shuffle(cardDeck.value)
  }

  function resetGame(autoStart = false) {
    debugLog('game:resetGame', { autoStart, before: snapshot() })
    clearPendingTimers('resetGame')
    const savedChips = players.value.map(p => p.chips)
    step.value = ''
    boardCards.value = []
    hoveredPlayer.value = null
    showHiCards.value = false
    showLoCards.value = false
    pot.value = 0
    currentBet.value = 0
    currentPlayerIndex.value = 0
    gamePhase.value = 'betting'
    playersActedCount.value = 0
    raiseAmount.value = 20
    isProcessingAction.value = false
    cardDeck.value = [...cardDeckConfig]
    players.value.forEach((player, index) => {
      const chips = player.chips !== undefined ? (savedChips[index] || DEFAULT_CHIPS) : undefined
      resetPlayerState(player, chips)
    })
    if (autoStart) {
      start()
    } else {
      debugLog('game:resetGame:manual-start-required', { after: snapshot() })
    }
  }

  function newHand() {
    debugLog('game:newHand', { before: snapshot() })
    // Перемещаем фишку дилера к следующему игроку только если это не первая раздача
    if (step.value !== '') {
      dealerIndex.value = (dealerIndex.value + 1) % playerCount.value
    }
    resetGame(true)
  }

  function resetFullGame() {
    debugLog('game:resetFullGame', { before: snapshot() })
    resetGame(false)
    players.value.forEach(player => {
      player.chips = DEFAULT_CHIPS
      player.currentBet = 0
      player.hasFolded = false
      player.hasActed = false
    })
  }

  function start() {
    debugLog('game:start', { before: snapshot() })
    clearPendingTimers('start')
    shuffleDeck()
    showHiCards.value = false
    showLoCards.value = false
    pot.value = 0 // Обнуляем банк в начале новой раздачи
    currentBet.value = 0
    currentPlayerIndex.value = 0
    gamePhase.value = 'betting'
    players.value.forEach((player, index) => {
      if (index < playerCount.value) {
        // Сохраняем текущие фишки игрока, не сбрасываем их
        const currentChips = player.chips
        resetPlayerState(player, undefined) // undefined означает не менять фишки
        // Восстанавливаем фишки, если они были, иначе даем дефолтные
        if (currentChips !== undefined) {
          player.chips = currentChips
        } else {
          player.chips = DEFAULT_CHIPS
        }
        for (let i = 0; i < cardCount.value; i++) {
          player.cards.push(cardDeck.value.pop())
        }
        if (cardCount.value >= 4) {
          try {
            const handEvaluation = evaluateStartingHand(player.cards)
            player.startingHandEvaluation = handEvaluation.overall
          } catch (error) {
            debugLog('game:start:evaluate-error', { player: player.name, error: String(error) })
            player.startingHandEvaluation = null
          }
        }
      } else {
        resetPlayerState(player, DEFAULT_CHIPS)
      }
    })
    step.value = 'preflop'
    // Запускаем раунд ставок с блайндами
    startBettingRound()
    debugLog('game:start:done', { after: snapshot() })
  }

  function next() {
    debugLog('game:next', { step: step.value })
    if (step.value === 'preflop') {
      return openFlop()
    }
    if (step.value === 'flop') {
      return openTurn()
    }
    if (step.value === 'turn') {
      return openRiver()
    }
    if (step.value === 'river') {
      return endGame()
    }
  }

  function openFlop() {
    for (let i = 0; i < 3; i++) {
      boardCards.value.push(cardDeck.value.pop())
    }
    step.value = 'flop'
    debugLog('street:opened', { street: 'flop', boardCards: boardCards.value.length })
  }

  function openTurn() {
    boardCards.value.push(cardDeck.value.pop())
    step.value = 'turn'
    debugLog('street:opened', { street: 'turn', boardCards: boardCards.value.length })
  }

  function openRiver() {
    boardCards.value.push(cardDeck.value.pop())
    step.value = 'river'
    debugLog('street:opened', { street: 'river', boardCards: boardCards.value.length })
  }

  function endGame() {
    step.value = 'end'
    // Не сбрасываем isWinner, чтобы подсветка победителя сохранялась
    players.value.forEach(player => {
      player.combinations = { hi: null, lo: null }
      player.bestHand = []
    })
    debugLog('game:endGame', { after: snapshot() })
  }

  function startBettingRound() {
    debugLog('betting:round-start', { before: snapshot() })
    players.value.forEach(player => {
      player.currentBet = 0
      player.hasActed = false
    })
    currentBet.value = 0
    playersActedCount.value = 0
    if (step.value === 'preflop') {
      // Малый блайнд - следующий игрок после дилера
      const smallBlindIndex = (dealerIndex.value + 1) % playerCount.value
      const smallBlindPlayer = players.value[smallBlindIndex]
      if (smallBlindPlayer) {
        // Убеждаемся что у игрока есть фишки
        if (smallBlindPlayer.chips === undefined) {
          smallBlindPlayer.chips = DEFAULT_CHIPS
        }
        if (smallBlindPlayer.chips >= SMALL_BLIND) {
          smallBlindPlayer.chips -= SMALL_BLIND
          smallBlindPlayer.currentBet = SMALL_BLIND
          smallBlindPlayer.hasActed = true
          pot.value += SMALL_BLIND
          playersActedCount.value++
          console.log(`${smallBlindPlayer.name} ставит малый блайнд $${SMALL_BLIND}`)
        }
      }
      // Большой блайнд - второй игрок после дилера
      const bigBlindIndex = (dealerIndex.value + 2) % playerCount.value
      const bigBlindPlayer = players.value[bigBlindIndex]
      if (bigBlindPlayer) {
        // Убеждаемся что у игрока есть фишки
        if (bigBlindPlayer.chips === undefined) {
          bigBlindPlayer.chips = DEFAULT_CHIPS
        }
        if (bigBlindPlayer.chips >= BIG_BLIND) {
          bigBlindPlayer.chips -= BIG_BLIND
          bigBlindPlayer.currentBet = BIG_BLIND
          bigBlindPlayer.hasActed = true
          pot.value += BIG_BLIND
          currentBet.value = BIG_BLIND
          playersActedCount.value++
          console.log(`${bigBlindPlayer.name} ставит большой блайнд $${BIG_BLIND}`)
        }
      }
      // Первый игрок для действий - третий игрок после дилера
      currentPlayerIndex.value = (dealerIndex.value + 3) % playerCount.value
      console.log(`Банк после блайндов: $${pot.value}`)
    } else {
      // На последующих улицах первый игрок - следующий после дилера
      currentPlayerIndex.value = (dealerIndex.value + 1) % playerCount.value
    }
    debugLog('betting:round-start:done', { after: snapshot() })
    if (currentPlayerIndex.value === HUMAN_PLAYER_INDEX) {
      debugLog('betting:waiting-for-human', { via: 'startBettingRound' })
      return
    }
    if (simulationMode.value) {
      scheduleTracked(() => botAction(), BOT_ACTION_DELAY, 'botAction:startBettingRound')
    }
  }

  function getBotDecision(player) {
    const random = Math.random()
    const callAmount = currentBet.value - player.currentBet
    console.log({callAmount}, currentBet.value, player.currentBet)
    if (callAmount === 0) {
      return 'check'
    } else if (random > 0.3) {
      return 'call'
    }
    return 'fold'
  }

  function applyAction(playerIndex, action) {
    const player = players.value[playerIndex]
    const callAmount = currentBet.value - player.currentBet

    switch (action) {
      case 'fold':
        player.hasFolded = true
        player.hasActed = true
        playersActedCount.value++
        console.log(`${player.name} фолдит`)
        break
      case 'check':
        console.log(`${player.name} чекает`)
        if (callAmount === 0) {
          player.hasActed = true
          playersActedCount.value++
        } else {
          console.log('Нельзя чекить когда есть ставка')
          return false
        }
        break
      case 'call': {
        const callAmount = currentBet.value - player.currentBet
        if (callAmount < 0) {
          console.log('Ошибка: отрицательная сумма колла')
          return false
        }
        if (player.chips >= callAmount) {
          player.chips -= callAmount
          player.currentBet = currentBet.value
          player.hasActed = true
          playersActedCount.value++
          pot.value += callAmount
          console.log(`${player.name} коллирует $${callAmount}`)
        } else {
          console.log('Недостаточно фишек для колла')
          return false
        }
        break
      }
      case 'raise': {
        const raiseTotal = currentBet.value + raiseAmount.value
        const totalBet = raiseTotal - player.currentBet
        if (totalBet > pot.value) {
          console.log('Превышен пот лимит')
          return false
        }
        if (player.chips >= totalBet) {
          player.chips -= totalBet
          player.currentBet = raiseTotal
          player.hasActed = true
          playersActedCount.value++
          players.value.forEach((p, idx) => {
            if (idx !== playerIndex && !p.hasFolded && p.currentBet < raiseTotal) {
              p.hasActed = false
            }
          })
          pot.value += totalBet
          currentBet.value = raiseTotal
          console.log(`${player.name} рейзит до $${raiseTotal}`)
        } else {
          console.log('Недостаточно фишек для рейза')
          return false
        }
        break
      }
    }
    return true
  }

  function playerAction(action) {
    debugLog('action:player', { action, before: snapshot() })
    if (isProcessingAction.value) {
      debugLog('action:player:skipped', { action, reason: 'isProcessingAction' })
      return
    }
    isProcessingAction.value = true
    const player = players.value[currentPlayerIndex.value]
    if (!player || player.hasFolded) {
      isProcessingAction.value = false
      nextPlayer()
      return
    }
    if (player.hasActed && player.currentBet === currentBet.value) {
      isProcessingAction.value = false
      return
    }
    const ok = applyAction(currentPlayerIndex.value, action)
    isProcessingAction.value = false
    if (ok) {
      nextPlayer()
    }
  }

  function botAction() {
    debugLog('action:bot', { before: snapshot() })
    if (currentPlayerIndex.value === HUMAN_PLAYER_INDEX) {
      debugLog('action:bot:BLOCKED', { reason: 'Попытка автодействия за Player 1', ...snapshot() })
      console.warn('[POKER-DEBUG] Автодействие бота за Player 1 заблокировано')
      return
    }
    const player = players.value[currentPlayerIndex.value]
    if (!player || player.hasFolded) {
      nextPlayer()
      return
    }
    const action = getBotDecision(player)
    debugLog('action:bot:decision', { player: player.name, action })
    applyAction(currentPlayerIndex.value, action)
    nextPlayer()
  }

  function nextPlayer() {
    debugLog('betting:next-player', { before: snapshot() })
    const activePlayers = players.value.filter(p => !p.hasFolded)
    if (activePlayers.length === 1) {
      endGameByFold(activePlayers[0])
      return
    }
    currentPlayerIndex.value = (currentPlayerIndex.value + 1) % playerCount.value
    let iterations = 0
    const maxIterations = playerCount.value + 1
    while (players.value[currentPlayerIndex.value].hasFolded && iterations < maxIterations) {
      currentPlayerIndex.value = (currentPlayerIndex.value + 1) % playerCount.value
      iterations++
    }
    const allActed = playersActedCount.value >= activePlayers.length
    const allBetsEqual = activePlayers.every(p => p.currentBet === currentBet.value)
    console.log({ allActed, allBetsEqual }, activePlayers.find(p => p.currentBet !== currentBet.value))
    if (allActed && allBetsEqual) {
      nextStreet()
      return
    }
    if (currentPlayerIndex.value === HUMAN_PLAYER_INDEX) {
      debugLog('betting:waiting-for-human', { via: 'nextPlayer' })
      return
    }
    if (simulationMode.value) {
      scheduleTracked(() => botAction(), BOT_ACTION_DELAY, 'botAction:nextPlayer')
    }
  }

  function nextStreet() {
    debugLog('street:advance', { from: step.value })
    if (step.value === 'preflop') {
      openFlop()
    } else if (step.value === 'flop') {
      openTurn()
    } else if (step.value === 'turn') {
      openRiver()
    } else if (step.value === 'river') {
      calc()
      endGame()
      return
    }
    if (step.value !== 'end' && simulationMode.value) {
      scheduleTracked(() => startBettingRound(), STREET_DELAY, 'startBettingRound:nextStreet')
    }
  }

  function endGameByFold(winner) {
    step.value = 'end'
    const winnerIndex = players.value.findIndex(p => p.name === winner.name)
    if (winnerIndex !== -1) {
      players.value[winnerIndex].chips += pot.value
      players.value[winnerIndex].isWinner = true
      players.value[winnerIndex].showCards = true
    }
    console.log(`${winner.name} выигрывает банк $${pot.value} по фолду`)
    debugLog('game:end-by-fold', { winner: winner.name, potWon: pot.value })
    pot.value = 0
  }

  function calc() {
    if (!Array.isArray(players.value) || boardCards.value.length < 5) {
      console.log('Недостаточно карт на столе для определения победителя')
      return
    }
    debugLog('calc:start', { lowRules: lowRules.value, boardCards: boardCards.value.length })
    const result = determineWinner(players.value, boardCards.value, lowRules.value)
    if (result.winners.length > 0) {
      console.log('=== РЕЗУЛЬТАТЫ РАЗДАЧИ ===')
      if (result.isSplit) {
        console.log(`Сплит пот! ${result.winners.length} победителей:`)
      } else {
        console.log('Победитель:')
      }
      result.winners.forEach(winner => {
        const translatedDesc = translateHandDescription(winner.handDescription)
        console.log(`${winner.name}: ${translatedDesc} (score: ${winner.handScore}, rank: ${winner.handRank})`)
        console.log(`Лучшая комбинация: ${winner.bestHand.join(', ')}`)
      })
      if (lowRules.value && result.lowWinners.length > 0) {
        console.log('=== LOW ПОБЕДИТЕЛИ ===')
        if (result.lowIsSplit) {
          console.log(`Сплит low пот! ${result.lowWinners.length} победителей:`)
        } else {
          console.log('Low победитель:')
        }
        result.lowWinners.forEach(winner => {
          console.log(`${winner.name}: ${winner.lowDescription} (score: ${winner.lowScore})`)
          console.log(`Low комбинация: ${winner.lowHand.join(', ')}`)
        })
      }
      const hiWinnersCount = result.winners.length
      const lowWinnersCount = lowRules.value ? result.lowWinners.length : 0
      const hiPotShare = lowWinnersCount > 0 ? 50 : 100
      const lowPotShare = hiWinnersCount > 0 ? 50 : 100
      
      // Распределяем банк между победителями
      let hiPot = pot.value
      let lowPot = 0
      
      if (lowRules.value && lowWinnersCount > 0) {
        // В режиме hi-lo делим банк поровну
        hiPot = Math.floor(pot.value / 2)
        lowPot = pot.value - hiPot
      }
      
      // Делим hi пот между hi победителями
      const hiSharePerWinner = Math.floor(hiPot / hiWinnersCount)
      result.winners.forEach(winner => {
        const winnerIndex = players.value.findIndex(p => p.name === winner.name)
        if (winnerIndex !== -1) {
          players.value[winnerIndex].chips += hiSharePerWinner
          players.value[winnerIndex].winnings = (players.value[winnerIndex].winnings || 0) + hiSharePerWinner
          console.log(`${winner.name} получает $${hiSharePerWinner} от hi пота`)
        }
      })

      // Делим low пот между low победителями
      if (lowRules.value && lowWinnersCount > 0) {
        const lowSharePerWinner = Math.floor(lowPot / lowWinnersCount)
        result.lowWinners.forEach(winner => {
          const winnerIndex = players.value.findIndex(p => p.name === winner.name)
          if (winnerIndex !== -1) {
            players.value[winnerIndex].chips += lowSharePerWinner
            players.value[winnerIndex].winnings = (players.value[winnerIndex].winnings || 0) + lowSharePerWinner
            console.log(`${winner.name} получает $${lowSharePerWinner} от low пота`)
          }
        })
      }
      
      players.value.forEach(player => {
        // Сбрасываем предыдущие результаты перед новой оценкой
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
          player.isLowWinner = lowRules.value && result.lowWinners.some(winner => winner.name === player.name)
          player.winPercentage = player.isWinner ? Math.round(hiPotShare / hiWinnersCount) : 0
          player.lowWinPercentage = player.isLowWinner ? Math.round(lowPotShare / lowWinnersCount) : 0
        }
      })
      // Логика открытия карт по настройке
      if (showCardsAtEnd.value) {
        // Если настройка активна - открываем все карты (как сейчас)
        players.value.forEach(player => {
          player.showCards = true
        })
      } else {
        // Иначе открываем только карты тех, кто не сфолдил и кто победитель
        const activePlayers = players.value.filter(p => !p.hasFolded)
        const hasSingleWinner = result.winners.length === 1 && (!lowRules.value || result.lowWinners.length === 0)
        
        players.value.forEach(player => {
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
        potDistributed: pot.value
      })
      // Не обнуляем банк - он остается видимым до следующей раздачи
    } else {
      console.log('Не удалось определить победителя')
    }
  }

  function validateRaiseAmount() {
    if (raiseAmount.value > pot.value) {
      raiseAmount.value = pot.value
    }
    if (raiseAmount.value < 20) {
      raiseAmount.value = 20
    }
  }

  function onPlayerHover(player) {
    hoveredPlayer.value = player
  }

  function onPlayerLeave() {
    hoveredPlayer.value = null
  }

  function onHiHover(player) {
    hoveredPlayer.value = player
    showHiCards.value = true
  }

  function onHiLeave() {
    showHiCards.value = false
    if (!showLoCards.value) {
      hoveredPlayer.value = null
    }
  }

  function onLoHover(player) {
    hoveredPlayer.value = player
    showLoCards.value = true
  }

  function onLoLeave() {
    showLoCards.value = false
    if (!showHiCards.value) {
      hoveredPlayer.value = null
    }
  }

  function isBoardCardInBestHand(card) {
    if (!hoveredPlayer.value || !hoveredPlayer.value.bestHand) {
      return false
    }
    if (!showHiCards.value) {
      return false
    }
    return hoveredPlayer.value.bestHand.some(c =>
      (typeof c === 'object' && c.rank === card.rank && c.suit === card.suit) ||
      (typeof c === 'string' && c === `${card.rank}${card.suit}`)
    )
  }

  function isBoardCardInLowHand(card) {
    if (!hoveredPlayer.value || !hoveredPlayer.value.lowHand) {
      return false
    }
    if (!showLoCards.value) {
      return false
    }
    return hoveredPlayer.value.lowHand.some(c =>
      (typeof c === 'object' && c.rank === card.rank && c.suit === card.suit) ||
      (typeof c === 'string' && c === `${card.rank}${card.suit}`)
    )
  }

  function isBoardCardInBothHands(card) {
    return isBoardCardInBestHand(card) && isBoardCardInLowHand(card)
  }

  function bestCombo(cards) {
    const values = cards.map(c => c[0])
    const _suits = cards.map(c => c[1])
    const valuesSet = new Set(values)
    const _suitsSet = new Set(_suits)
    const isStreet = valuesSet.size === 5 && values[4] - values[0] === 4
    const isFlush = _suitsSet.size === 1

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
        console.log({ pairs })
        return `2 pairs, ${pairs[0]}_${pairs[1]}`
      }
      if (pairs.length === 1) {
        return `pair, ${pairs[0]}`
      }
    }

    return `height card ${cards[4]}`
  }

  function getAIBotDecision(_player, _gameContext) {
    return {
      fold: 0.1,
      check: 0.3,
      call: 0.4,
      raise: 0.2
    }
  }

  return {
    players,
    cardDeck,
    boardCards,
    step,
    hoveredPlayer,
    cardCount,
    playerCount,
    lowRules,
    simulationMode,
    showHiCards,
    showLoCards,
    showCardsAtEnd,
    pot,
    currentBet,
    currentPlayerIndex,
    gamePhase,
    playersActedCount,
    raiseAmount,
    isProcessingAction,
    initialized,
    maxPlayers,
    availablePlayerCounts,
    boardText,
    dealerIndex,
    loadSettings,
    applySettings,
    saveSettingsToStorage,
    start,
    newHand,
    resetGame,
    resetFullGame,
    next,
    calc,
    startBettingRound,
    playerAction,
    botAction,
    nextPlayer,
    nextStreet,
    endGameByFold,
    getBotDecision,
    validateRaiseAmount,
    onPlayerHover,
    onPlayerLeave,
    onHiHover,
    onHiLeave,
    onLoHover,
    onLoLeave,
    isBoardCardInBestHand,
    isBoardCardInLowHand,
    isBoardCardInBothHands,
    clearPendingTimers,
    bestCombo,
    getAIBotDecision
  }
})
