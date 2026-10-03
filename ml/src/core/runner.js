import { createMockStore } from './mockStore'
import { HeadlessEngine } from './headlessEngine'
import { resetPlayerState } from '../../../src/helpers/gameLogic'
import cardDeckConfig from '../../../src/config/cardDeck'

export function createTable(config = {}) {
  const store = createMockStore(config)
  const engine = new HeadlessEngine(store)
  return { store, engine, config }
}

export function playHand(table, { decisionFn, onDecision, startChips = 1000, dealerIndex = 0 } = {}) {
  const { store, engine } = table
  const players = store.getPlayers()
  const actions = []

  const wrappedOnDecision = (context, action) => {
    actions.push({
      street: context.street,
      seat: context.actorIndex,
      action,
      pot: context.pot,
      currentBet: context.currentBet,
      toCall: context.currentBet - (context.actor.currentBet || 0),
      actorChips: context.actor.chips
    })
    if (onDecision) {
      onDecision(context, action)
    }
  }

  store.state.boardCards.length = 0
  store.state.cardDeck = [...cardDeckConfig]
  store.setPot(0)
  store.setCurrentBet(0)
  store.setCurrentPlayerIndex(0)
  store.setPlayersActedCount(0)
  store.setDealerIndex(dealerIndex)
  players.forEach(p => resetPlayerState(p, startChips))

  engine.queue.length = 0
  engine.decisionFn = decisionFn || null
  engine.onDecision = wrappedOnDecision

  engine.startHand()
  engine.drain()

  const potTotal = players.reduce((sum, p) => sum + (p.totalBet || 0), 0)

  return {
    endStep: store.getStep(),
    potLeft: store.getPot(),
    lowRules: store.getLowRules(),
    board: store.state.boardCards.map(card => ({ rank: card.rank, suit: card.suit })),
    actions,
    potTotal,
    chipsAfter: players.map(p => p.chips),
    players: players.map(p => ({
      name: p.name,
      chips: p.chips,
      totalBet: p.totalBet || 0,
      net: p.chips - startChips,
      wentToShowdown: Boolean(p.handDescription),
      handDescription: p.handDescription || null,
      lowDescription: p.lowDescription || null,
      isWinner: Boolean(p.isWinner),
      isLowWinner: Boolean(p.isLowWinner)
    }))
  }
}

export function runSimulation(config = {}, { onDecision } = {}) {
  const hands = config.hands ?? 100
  const playerCount = config.playerCount ?? 8
  const startChips = config.startChips ?? 1000
  const table = createTable(config)
  const records = []
  const failures = []
  const stats = {
    hands: 0,
    foldEnds: 0,
    showdowns: 0,
    splitPots: 0,
    actions: 0,
    maxActionsPerHand: 0,
    invariantViolations: [],
    invariantViolationCount: 0
  }

  for (let i = 0; i < hands; i++) {
    try {
      const record = playHand(table, {
        startChips,
        dealerIndex: i % playerCount,
        onDecision
      })
      record.handIndex = i
      records.push(record)
      stats.hands++
      stats.actions += record.actions.length
      if (record.actions.length > stats.maxActionsPerHand) {
        stats.maxActionsPerHand = record.actions.length
      }
      const showdown = record.players.some(p => p.wentToShowdown)
      if (showdown) {
        stats.showdowns++
      } else {
        stats.foldEnds++
      }
      const chipSum = record.chipsAfter.reduce((sum, c) => sum + c, 0)
      const problems = []
      if (record.endStep !== 'end') {
        problems.push(`endStep=${record.endStep}`)
      }
      if (chipSum !== startChips * playerCount) {
        problems.push(`chips=${chipSum} potLeft=${record.potLeft} expected=${startChips * playerCount}`)
      }
      if (!record.chipsAfter.every(c => Number.isFinite(c) && c >= 0)) {
        problems.push(`bad chips: ${record.chipsAfter.join(',')}`)
      }
      if (stats.invariantViolations.length < 5 && problems.length > 0) {
        stats.invariantViolations.push({ handIndex: i, problems })
      }
      if (problems.length > 0) {
        stats.invariantViolationCount = (stats.invariantViolationCount || 0) + 1
      }
      const hiWinners = record.players.filter(p => p.isWinner).length
      if (hiWinners > 1) {
        stats.splitPots++
      }
      if (problems.length > 0) {
        stats.invariantViolations.push({ handIndex: i, problems })
      }
    } catch (error) {
      failures.push({
        handIndex: i,
        error: String(error && error.stack ? error.stack : error)
      })
    }
  }

  return { records, stats, failures }
}
