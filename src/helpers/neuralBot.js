import { extractFeatures } from '@/helpers/neuralFeatures'
import { appCardToCode, evaluateOmaha, getAbsoluteNuts } from '@/helpers/hiLowEvaluator'

const EV_ACTIONS = ['fold', 'call', 'raise']

let tf = null
let equityModel = null
let evModel = null
let norm = null
let featureSet = 'base'
let evMargin = 1
let decisionEvMode = 'analytic'

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
  evMargin = meta.evUnits === 'pot' ? 0.05 : 40
  decisionEvMode = meta.decisionEv ?? 'analytic'
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
    const bestAlternative = Math.max(evOut[0], evOut[1])
    if (!allowRaise || chips <= toCall || evOut[2] < bestAlternative + raiseMargin) {
      if (toCall > 0 && evOut[0] > evOut[1]) {
        return 'fold'
      }
      return 'call'
    }
  }
  return action
}

function holdsNutsHand(context) {
  try {
    const hole = context.actor.cards.map(appCardToCode)
    const board = context.board.map(appCardToCode)
    if (board.length < 3) {
      return false
    }
    const current = evaluateOmaha(hole, board)
    const nuts = getAbsoluteNuts(board, hole)
    if (current.high >= nuts.high) {
      return true
    }
    return current.low !== 0 && (nuts.low === 0 || current.low <= nuts.low)
  } catch (error) {
    return false
  }
}

export function computeAnalyticEv(context, equity) {
  const bb = context.bigBlind || 20
  const pot = context.pot
  const toCall = context.currentBet - (context.actor.currentBet || 0)
  const stack = context.actor.chips
  const opponents = Math.max(1, context.players.filter(p => !p.hasFolded && p.index !== context.actorIndex).length)
  const denom = Math.max(pot, bb)
  const s = Math.max(0, Math.min(1, equity[5]))
  const evCall = (s * (pot + toCall) - toCall) / denom
  let evRaise = evCall
  const raiseAdd = Math.max(0, Math.min(pot + toCall, stack - toCall))
  const callProb = 0.7
  if (raiseAdd > 0 && stack > toCall) {
    let binomProb = Math.pow(1 - callProb, opponents)
    let evRaiseChips = 0
    for (let k = 0; k <= opponents; k++) {
      const shareK = k === 0 ? 1 : 1 - Math.pow(1 - s, opponents / k)
      evRaiseChips += binomProb * (shareK * (pot + toCall + raiseAdd * (1 + k)) - (toCall + raiseAdd))
      binomProb = binomProb * (opponents - k) / (k + 1) * callProb / (1 - callProb)
    }
    evRaise = evRaiseChips / denom
  }
  const clamp = v => Math.max(-8, Math.min(8, v))
  const ev = [0, clamp(evCall), clamp(evRaise)]
  if (holdsNutsHand(context) && raiseAdd > 0 && stack > toCall) {
    ev[2] = Math.max(ev[2], ev[1] + 1)
  }
  return ev
}

export function neuralDecision(store, playerIndex, engine) {
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
  if (engine) {
    context.actions = engine.handActions.slice()
    context.oppHistory = engine.getOppHistory(playerIndex)
  }

  const features = extractFeatures(context, featureSet)
  const normalized = features.slice(0, norm.mean.length).map((v, i) => (v - norm.mean[i]) / norm.std[i])
  const input = tf.tensor2d([normalized])
  const equityOut = equityModel.predict(input)
  const equityValues = Array.from(equityOut.dataSync())
  const evInput = tf.tensor2d([normalized.concat(equityValues)])
  const evOut = Array.from(evModel.predict(evInput).dataSync())
  input.dispose()
  equityOut.dispose()
  evInput.dispose()

  const toCall = context.currentBet - (context.actor.currentBet || 0)
  if (holdsNutsHand(context) && toCall > 0 && context.actor.chips <= toCall) {
    return 'call'
  }
  const raiseAdd = Math.max(0, Math.min(context.pot + toCall, context.actor.chips - toCall))
  let decEv
  if (decisionEvMode === 'trained') {
    decEv = evOut.map(v => Math.max(-8, Math.min(8, v)))
    if (holdsNutsHand(context) && raiseAdd > 0 && context.actor.chips > toCall) {
      decEv[2] = Math.max(decEv[2], decEv[1] + 1)
    }
  } else {
    decEv = computeAnalyticEv(context, equityValues)
  }
  const action = pickActionFromEv(decEv, toCall, context.actor.chips, evMargin, true)
  if (action === 'raise') {
    const maxTo = context.actor.currentBet + context.actor.chips
    const raiseTo = Math.min(context.currentBet + fullPot, maxTo)
    if (raiseTo > context.currentBet) {
      const allIn = raiseTo >= maxTo - 1
      const canJam = context.street === 'preflop' || holdsNutsHand(context) || equityValues[5] >= 0.5
      if (allIn && !canJam) {
        return pickActionFromEv(decEv, toCall, context.actor.chips, evMargin, false)
      }
      store.setRaiseAmount(Math.round(raiseTo))
    } else {
      return 'call'
    }
  }
  return action
}
