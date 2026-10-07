import cardDeckConfig from '../../../src/config/cardDeck'
import shuffle from '../../../src/helpers/shuffle'
import { resetPlayerState } from '../../../src/helpers/gameLogic'

const defaultPlayers = (length) => {
  const result = []
  for (let i = 0; i < length; i++) {
    result.push({
      name: `Computer ${i + 1}`,
      cards: [],
      winPercentage: 0,
      lowWinPercentage: 0,
      chips: 1000,
      totalBet: 0
    })
  }
  return result
}

export function createMockStore(config = {}) {
  const state = {
    players: defaultPlayers(config.playerCount ?? 8),
    cardDeck: [...cardDeckConfig],
    boardCards: [],
    step: '',
    pot: 0,
    currentBet: 0,
    currentPlayerIndex: 0,
    gamePhase: 'betting',
    playersActedCount: 0,
    raiseAmount: config.raiseAmount ?? 20,
    dealerIndex: 0,
    smallBlind: config.smallBlind ?? 10,
    bigBlind: config.bigBlind ?? 20,
    lowRules: config.lowRules ?? false,
    potLimit: config.potLimit ?? true,
    simulationMode: true,
    showCardsAtEnd: true,
    showHiCards: false,
    showLoCards: false,
    cardCount: config.cardCount ?? 4
  }

  return {
    state,
    snapshot: () => ({
      step: state.step,
      cardCount: state.cardCount,
      playerCount: state.players.length,
      lowRules: state.lowRules,
      pot: state.pot,
      currentBet: state.currentBet,
      currentPlayerIndex: state.currentPlayerIndex,
      playersActedCount: state.playersActedCount,
      dealerIndex: state.dealerIndex
    }),
    getPlayers: () => state.players,
    getCardDeck: () => state.cardDeck,
    getBoardCards: () => state.boardCards,
    getCardCount: () => state.cardCount,
    getPlayerCount: () => state.players.length,
    getStep: () => state.step,
    getPot: () => state.pot,
    getCurrentBet: () => state.currentBet,
    getCurrentPlayerIndex: () => state.currentPlayerIndex,
    getDealerIndex: () => state.dealerIndex,
    getPlayersActedCount: () => state.playersActedCount,
    getRaiseAmount: () => state.raiseAmount,
    getSimulationMode: () => state.simulationMode,
    getLowRules: () => state.lowRules,
    getShowCardsAtEnd: () => state.showCardsAtEnd,
    getShowHiCards: () => state.showHiCards,
    getShowLoCards: () => state.showLoCards,
    getPotLimit: () => state.potLimit,
    getSmallBlind: () => state.smallBlind,
    getBigBlind: () => state.bigBlind,
    setStep: value => { state.step = value },
    setPot: value => { state.pot = value },
    setCurrentBet: value => { state.currentBet = value },
    setCurrentPlayerIndex: value => { state.currentPlayerIndex = value },
    setDealerIndex: value => { state.dealerIndex = value },
    setPlayersActedCount: value => { state.playersActedCount = value },
    setRaiseAmount: value => { state.raiseAmount = value },
    setSmallBlind: value => { state.smallBlind = value },
    setBigBlind: value => { state.bigBlind = value },
    setGamePhase: value => { state.gamePhase = value },
    setShowHiCards: value => { state.showHiCards = value },
    setShowLoCards: value => { state.showLoCards = value },
    addToPot: amount => { state.pot += amount },
    incrementPlayersActedCount: () => { state.playersActedCount++ },
    shuffleDeck: () => { state.cardDeck = shuffle(state.cardDeck) },
    resetPlayerState: (player, chips) => resetPlayerState(player, chips)
  }
}
