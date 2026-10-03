import { extractFeatures } from '@/helpers/neuralFeatures'

const EV_ACTIONS = ['fold', 'call', 'raise']

let tf = null
let equityModel = null
let evModel = null
let norm = null
let featureSet = 'base'

export async function loadNeuralModels(baseUrl = 'models') {
  if (equityModel && evModel) {
    return true
  }
  tf = await import('@tensorflow/tfjs')
  const metaResponse = await fetch(`${baseUrl}/trainingMeta.json`)
  if (!metaResponse.ok) {
    throw new Error(`Не удалось загрузить trainingMeta.json: ${metaResponse.status}`)
  }
  const meta = await metaResponse.json()
  const [equity, ev] = await Promise.all([
    tf.loadLayersModel(`${baseUrl}/equity/model.json`),
    tf.loadLayersModel(`${baseUrl}/ev/model.json`)
  ])
  equityModel = equity
  evModel = ev
  norm = { mean: meta.norm.mean, std: meta.norm.std }
  featureSet = meta.featureSet ?? 'base'
  return true
}

export function neuralModelsReady() {
  return Boolean(equityModel && evModel && norm)
}

export function pickActionFromEv(evOut, toCall, chips, raiseMargin = 1, allowRaise = false) {
  let best = 0
  for (let i = 1; i < evOut.length; i++) {
    if (evOut[i] > evOut[best]) {
      best = i
    }
  }
  const action = EV_ACTIONS[best]
  if (action === 'fold' && toCall <= 0) {
    return 'call'
  }
  if (action === 'raise') {
    if (!allowRaise || chips <= toCall || evOut[2] < evOut[1] + raiseMargin) {
      return 'call'
    }
  }
  return action
}

export function neuralDecision(store, playerIndex) {
  if (!neuralModelsReady()) {
    return null
  }
  const players = store.getPlayers()
  const actor = players[playerIndex]
  const fullPot = store.getPot() + players.reduce((sum, p) => sum + (p.currentBet || 0), 0)
  const context = {
    street: store.getStep(),
    actorIndex: playerIndex,
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

  const features = extractFeatures(context, featureSet)
  const normalized = features.map((v, i) => (v - norm.mean[i]) / norm.std[i])
  const input = tf.tensor2d([normalized])
  const equityOut = equityModel.predict(input)
  const equityValues = Array.from(equityOut.dataSync())
  const evInput = tf.tensor2d([normalized.concat(equityValues)])
  const evOut = Array.from(evModel.predict(evInput).dataSync())
  input.dispose()
  equityOut.dispose()
  evInput.dispose()

  const toCall = context.currentBet - (context.actor.currentBet || 0)
  return pickActionFromEv(evOut, toCall, context.actor.chips)
}
