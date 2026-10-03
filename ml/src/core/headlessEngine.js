import { GameEngine } from '@/simulation/gameEngine'
import { getBotDecision } from '../../../src/helpers/gameLogic'

export function buildDecisionContext(store, actorIndex) {
  const players = store.getPlayers()
  const actor = players[actorIndex]
  const fullPot = store.getPot() + players.reduce((sum, p) => sum + (p.currentBet || 0), 0)

  return {
    street: store.getStep(),
    actorIndex,
    dealerIndex: store.getDealerIndex(),
    smallBlind: store.getSmallBlind(),
    bigBlind: store.getBigBlind(),
    board: store.getBoardCards().map(card => ({ rank: card.rank, suit: card.suit })),
    pot: fullPot,
    currentBet: store.getCurrentBet(),
    actor: {
      name: actor.name,
      cards: actor.cards.map(card => ({ rank: card.rank, suit: card.suit })),
      chips: actor.chips,
      currentBet: actor.currentBet || 0,
      totalBet: actor.totalBet || 0
    },
    players: players.map((p, i) => ({
      index: i,
      name: p.name,
      chips: p.chips,
      currentBet: p.currentBet || 0,
      totalBet: p.totalBet || 0,
      hasFolded: p.hasFolded,
      hasActed: p.hasActed
    }))
  }
}

export class HeadlessEngine extends GameEngine {
  constructor(store) {
    super(store)
    this.queue = []
    this.decisionFn = null
    this.onDecision = null
  }

  scheduleTracked(fn) {
    this.queue.push(fn)
    return this.queue.length - 1
  }

  clearPendingTimers() {
    this.queue = []
  }

  botAction() {
    const players = this.store.getPlayers()
    const playerIndex = this.store.getCurrentPlayerIndex()
    const player = players[playerIndex]

    if (!player || player.hasFolded) {
      this.nextPlayer()
      return
    }
    if (player.chips <= 0) {
      this.nextPlayer()
      return
    }

    const context = buildDecisionContext(this.store, playerIndex)
    const action = this.decisionFn
      ? this.decisionFn(context)
      : getBotDecision(player, this.store.getCurrentBet())

    if (this.onDecision) {
      this.onDecision(context, action)
    }

    this.applyAction(playerIndex, action)
    this.nextPlayer()
  }

  drain(maxSteps = 100000) {
    let steps = 0
    while (this.queue.length > 0) {
      if (++steps > maxSteps) {
        throw new Error('Headless drain exceeded max steps (possible infinite loop)')
      }
      const fn = this.queue.shift()
      fn()
    }
  }
}
