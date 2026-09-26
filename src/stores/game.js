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
  HUMAN_PLAYER_INDEX
} from '@/helpers/gameLogic'
import { GameEngine } from '@/simulation'
import { debugLog } from '@/helpers/debugLogger'

export const SETTINGS_STORAGE_KEY = 'pokerGameSettings'

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
      getSimulationMode: () => simulationMode.value,
      getLowRules: () => lowRules.value,
      getShowCardsAtEnd: () => showCardsAtEnd.value,
      getShowHiCards: () => showHiCards.value,
      getShowLoCards: () => showLoCards.value,
      
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

  function resetGame(autoStart = false) {
    debugLog('game:resetGame', { autoStart, before: snapshot() })
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
    initGameEngine()
    gameEngine.startHand()
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
    initGameEngine()
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
    raiseAmount.value = validateRaiseAmountHelper(raiseAmount.value, pot.value)
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
    validateRaiseAmount: () => {
      raiseAmount.value = validateRaiseAmount(raiseAmount.value, pot.value)
    },
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
