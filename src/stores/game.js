import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import cardDeckConfig from '@/config/cardDeck'
import shuffle from '@/helpers/shuffle'
import { createDefaultPlayers } from '@/helpers/players'
import {
  calculateMaxPlayers,
  generateAvailablePlayerCounts,
  getBoardText,
  validateRaiseAmount as validateRaiseAmountHelper,
  getBotDecision,
  getAIBotDecision,
  bestCombo,
  isBoardCardInHand,
  isBoardCardInBothHands as isBoardCardInBothHandsHelper,
  resetPlayerState,
  DEFAULT_CHIPS,
  SMALL_BLIND,
  BIG_BLIND
} from '@/helpers/gameLogic'
import { GameEngine } from '@/simulation'
import { debugLog, infoLog, errorLog } from '@/helpers/debugLogger'

export const SETTINGS_STORAGE_KEY = 'pokerGameSettings'

export const BLIND_PRESETS = {
  deepstack: { label: '🐢 Медленный / Deepstack (20–35 раздач)', hands: 25 },
  regular: { label: '🟢 Обычный (10–20 раздач)', hands: 15 },
  turbo: { label: '🟡 Turbo (5–10 раздач)', hands: 8 },
  hyper: { label: '🔴 Hyper-Turbo (1–4 раздачи)', hands: 3 },
  ultra: { label: '⚡ Super/Ultra Hyper (0–2 раздачи)', hands: 1 }
}

const BLIND_LADDER = [
  2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 40, 50, 60, 80, 100,
  150, 200, 300, 400, 500, 600, 800, 1000, 1500, 2000, 3000,
  4000, 5000, 6000, 8000, 10000, 15000, 20000, 30000, 50000
]

export const useGameStore = defineStore('game', () => {
  // State
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
  const dealerIndex = ref(0)
  const potLimit = ref(true)
  const bigBlindBase = ref(BIG_BLIND)
  const smallBlind = ref(SMALL_BLIND)
  const bigBlind = ref(BIG_BLIND)
  const blindPreset = ref('regular')
  const handsPerLevel = ref(15)
  const handsPlayed = ref(0)
  const neuralBot = ref(false)
  const neuralBotStatus = ref('')

  // Simulation engine
  let gameEngine = null

  // Computed
  const maxPlayers = computed(() => calculateMaxPlayers(cardCount.value))
  const players = ref(createDefaultPlayers({ hasPlayer: true, length: maxPlayers.value }))
  const availablePlayerCounts = computed(() => generateAvailablePlayerCounts(maxPlayers.value))
  const boardText = computed(() => getBoardText(step.value))

  // Initialize game engine
  function initGameEngine() {
    if (!gameEngine) {
      gameEngine = new GameEngine(createStoreInterface())
    }
  }

  // Create store interface for simulation engine
  function createStoreInterface() {
    return {
      snapshot: () => snapshot(),
      getPlayers: () => players.value,
      getCardDeck: () => cardDeck.value,
      getBoardCards: () => boardCards.value,
      getCardCount: () => cardCount.value,
      getPlayerCount: () => playerCount.value,
      getStep: () => step.value,
      getPot: () => pot.value,
      getCurrentBet: () => currentBet.value,
      getCurrentPlayerIndex: () => currentPlayerIndex.value,
      getDealerIndex: () => dealerIndex.value,
      getPlayersActedCount: () => playersActedCount.value,
      getRaiseAmount: () => raiseAmount.value,
      setRaiseAmount: (value) => { raiseAmount.value = value },
      getSimulationMode: () => simulationMode.value,
      getLowRules: () => lowRules.value,
      getShowCardsAtEnd: () => showCardsAtEnd.value,
      getShowHiCards: () => showHiCards.value,
      getShowLoCards: () => showLoCards.value,
      getPotLimit: () => potLimit.value,
      getSmallBlind: () => smallBlind.value,
      getBigBlind: () => bigBlind.value,
      
      setStep: (value) => { step.value = value },
      setPot: (value) => { pot.value = value },
      setCurrentBet: (value) => { currentBet.value = value },
      setCurrentPlayerIndex: (value) => { currentPlayerIndex.value = value },
      setDealerIndex: (value) => { dealerIndex.value = value },
      setPlayersActedCount: (value) => { playersActedCount.value = value },
      setGamePhase: (value) => { gamePhase.value = value },
      setShowHiCards: (value) => { showHiCards.value = value },
      setShowLoCards: (value) => { showLoCards.value = value },
      addToPot: (amount) => { pot.value += amount },
      incrementPlayersActedCount: () => { playersActedCount.value++ },
      shuffleDeck: () => { cardDeck.value = shuffle(cardDeck.value) },
      resetPlayerState: (player, chips) => resetPlayerState(player, chips)
    }
  }

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

  function saveSettingsToStorage(source = 'save') {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
        cardCount: cardCount.value,
        playerCount: playerCount.value,
        lowRules: lowRules.value,
        simulationMode: simulationMode.value,
        showCardsAtEnd: showCardsAtEnd.value,
        potLimit: potLimit.value,
        bigBlindBase: bigBlindBase.value,
        blindPreset: blindPreset.value,
        handsPerLevel: handsPerLevel.value,
        neuralBot: neuralBot.value
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
    if (patch.potLimit !== undefined && patch.potLimit !== potLimit.value) {
      potLimit.value = patch.potLimit
    }
    if (patch.bigBlindBase !== undefined && patch.bigBlindBase !== bigBlindBase.value) {
      const base = Math.max(2, parseInt(patch.bigBlindBase, 10) || BIG_BLIND)
      bigBlindBase.value = base
      bigBlind.value = base
      smallBlind.value = Math.max(1, Math.floor(base / 2))
      handsPlayed.value = 0
    }
    if (patch.blindPreset !== undefined && patch.blindPreset !== blindPreset.value) {
      blindPreset.value = patch.blindPreset
      const presetHands = BLIND_PRESETS[patch.blindPreset]?.hands
      if (presetHands !== undefined) {
        handsPerLevel.value = presetHands
      }
    }
    if (patch.handsPerLevel !== undefined && patch.handsPerLevel !== handsPerLevel.value) {
      handsPerLevel.value = Math.max(0, parseInt(patch.handsPerLevel, 10) || 0)
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
    if (settings?.neuralBot) {
      enableNeuralBot()
    }
    debugLog('settings:load-done')
  }

  function resetGame(autoStart = false) {
    debugLog('game:resetGame')
    if (gameEngine) {
      gameEngine.clearPendingTimers('resetGame')
    }
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
    raiseAmount.value = smallBlind.value
    isProcessingAction.value = false
    cardDeck.value = [...cardDeckConfig]
    players.value.forEach((player, index) => {
      // Keep player's current chips (including 0 for bankrupt players)
      // Only give default chips if chips is undefined (initial state)
      const chips = savedChips[index] !== undefined ? savedChips[index] : DEFAULT_CHIPS
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
    if (step.value !== '') {
      // Move dealer button to next player (skip only bankrupt players, folded ones return next hand)
      let newDealerIndex = (dealerIndex.value + 1) % playerCount.value
      let iterations = 0
      const maxIterations = playerCount.value
      while (players.value[newDealerIndex].chips === 0 && iterations < maxIterations) {
        newDealerIndex = (newDealerIndex + 1) % playerCount.value
        iterations++
      }
      dealerIndex.value = newDealerIndex
      debugLog('game:newHand:dealer-moved', { from: dealerIndex.value, to: newDealerIndex })
      handsPlayed.value++
      if (handsPerLevel.value > 0 && handsPlayed.value % handsPerLevel.value === 0) {
        const nextIdx = BLIND_LADDER.findIndex(value => value > bigBlind.value)
        bigBlind.value = nextIdx === -1 ? bigBlind.value * 2 : BLIND_LADDER[nextIdx]
        smallBlind.value = Math.max(1, Math.floor(bigBlind.value / 2))
        infoLog(`Уровень блайндов повышен: SB $${smallBlind.value} / BB $${bigBlind.value}`)
      }
    }
    resetGame(true)
  }

  function resetFullGame() {
    debugLog('game:resetFullGame', { before: snapshot() })
    resetGame(false)
    players.value.forEach(player => {
      player.chips = DEFAULT_CHIPS
      player.currentBet = 0
      player.totalBet = 0
      player.hasFolded = false
      player.hasActed = false
      player.isWinner = false
      player.isLowWinner = false
      player.showCards = false
      player.winnings = 0
    })
    bigBlind.value = bigBlindBase.value
    smallBlind.value = Math.max(1, Math.floor(bigBlind.value / 2))
    handsPlayed.value = 0
    step.value = ''
    debugLog('game:resetFullGame:done', { after: snapshot() })
  }

  function start() {
    initGameEngine()
    gameEngine.startHand()
  }

  async function enableNeuralBot() {
    if (neuralBot.value) {
      return
    }
    neuralBotStatus.value = 'Загрузка нейро-моделей...'
    try {
      const neuralBotModule = await import('@/helpers/neuralBot')
      await neuralBotModule.loadNeuralModels('models')
      initGameEngine()
      gameEngine.decisionProvider = neuralBotModule.neuralDecision
      neuralBot.value = true
      neuralBotStatus.value = 'Нейро-боты активны'
      saveSettingsToStorage('neuralBot')
      infoLog('Нейро-боты включены')
    } catch (error) {
      neuralBot.value = false
      neuralBotStatus.value = `Ошибка загрузки: ${error}`
      errorLog('Не удалось включить нейро-ботов', { error: String(error) })
    }
  }

  function disableNeuralBot() {
    if (gameEngine) {
      gameEngine.decisionProvider = null
    }
    neuralBot.value = false
    neuralBotStatus.value = ''
    saveSettingsToStorage('neuralBot')
    infoLog('Нейро-боты выключены')
  }

  function next() {
    debugLog('game:next', { step: step.value })
    if (step.value === 'preflop') {
      return gameEngine.openFlop()
    }
    if (step.value === 'flop') {
      return gameEngine.openTurn()
    }
    if (step.value === 'turn') {
      return gameEngine.openRiver()
    }
    if (step.value === 'river') {
      step.value = 'end'
      return gameEngine.calculateWinner()
    }
  }

  function startBettingRound() {
    initGameEngine()
    gameEngine.startBettingRound()
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
    // If player has no chips, they're all-in, skip action
    if (player.chips <= 0) {
      debugLog('action:player:skip-all-in', { player: player.name })
      isProcessingAction.value = false
      nextPlayer()
      return
    }
    initGameEngine()
    if (action === 'raise') {
      validateRaiseAmount()
    }
    const ok = gameEngine.applyAction(currentPlayerIndex.value, action)
    isProcessingAction.value = false
    if (ok) {
      nextPlayer()
    }
  }

  function botAction() {
    initGameEngine()
    gameEngine.botAction()
  }

  function nextPlayer() {
    initGameEngine()
    gameEngine.nextPlayer()
  }

  function nextStreet() {
    initGameEngine()
    gameEngine.nextStreet()
  }

  function endGameByFold(winner) {
    initGameEngine()
    gameEngine.endGameByFold(winner)
  }

  function calc() {
    initGameEngine()
    gameEngine.calculateWinner()
  }

  function endGame() {
    step.value = 'end'
    players.value.forEach(player => {
      player.combinations = { hi: null, lo: null }
      player.bestHand = []
    })
    debugLog('game:endGame', { after: snapshot() })
  }

  function clearPendingTimers(source) {
    if (gameEngine) {
      gameEngine.clearPendingTimers(source)
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
    return isBoardCardInHand(card, hoveredPlayer.value.bestHand)
  }

  function isBoardCardInLowHand(card) {
    if (!hoveredPlayer.value || !hoveredPlayer.value.lowHand) {
      return false
    }
    if (!showLoCards.value) {
      return false
    }
    return isBoardCardInHand(card, hoveredPlayer.value.lowHand)
  }

  function isBoardCardInBothHands(card) {
    return isBoardCardInBothHandsHelper(card, hoveredPlayer.value?.bestHand, hoveredPlayer.value?.lowHand)
  }

  function validateRaiseAmount() {
    const player = players.value[currentPlayerIndex.value]
    const maxOwn = player ? player.currentBet + player.chips : 0
    const fullPot = pot.value + players.value.reduce((sum, p) => sum + (p.currentBet || 0), 0)
    const maxRaise = potLimit.value ? Math.min(currentBet.value + fullPot, maxOwn) : maxOwn
    raiseAmount.value = validateRaiseAmountHelper(raiseAmount.value, maxRaise, currentBet.value + smallBlind.value)
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
    potLimit,
    smallBlind,
    bigBlind,
    bigBlindBase,
    blindPreset,
    handsPerLevel,
    handsPlayed,
    neuralBot,
    neuralBotStatus,
    enableNeuralBot,
    disableNeuralBot,
    BLIND_PRESETS,
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
