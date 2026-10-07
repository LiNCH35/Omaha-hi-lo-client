import fs from 'node:fs'
import path from 'node:path'
import { extractFeatures } from '@/helpers/neuralFeatures'
import { pickActionFromEv } from '@/helpers/neuralBot'
import { appCardToCode, evaluateOmaha, getAbsoluteNuts } from '@/helpers/hiLowEvaluator'
import { loadFastModel } from '../features/fastForward'
import { buildVector } from '../features/variants'

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

export function loadNeuralPolicy(modelsDir, { margin = null, allowRaise = false, getRaiseState = null, decisionEv = null } = {}) {
  const meta = JSON.parse(fs.readFileSync(path.join(modelsDir, 'trainingMeta.json'), 'utf8'))
  const mean = meta.norm.mean
  const std = meta.norm.std
  const set = meta.featureSet ?? 'base'
  const decisionEvMode = decisionEv ?? meta.decisionEv ?? 'analytic'
  const effMargin = margin ?? (decisionEvMode === 'trained' ? 0.05 : 1)
  const equityForward = loadFastModel(path.join(modelsDir, 'equity'), fs, path)
  const evForward = loadFastModel(path.join(modelsDir, 'ev'), fs, path)

  return function decide(context) {
    const f24 = extractFeatures(context)
    const features = set === 'base'
      ? f24
      : buildVector(set, {
          f: f24,
          hole: context.actor.cards.map(c => c.rank + c.suit),
          board: context.board.map(c => c.rank + c.suit)
        })
    const normalized = features.slice(0, mean.length).map((v, i) => (v - mean[i]) / std[i])
    const equityOut = equityForward(normalized)
    const evOut = evForward(normalized.concat(Array.from(equityOut)))
    const toCall = context.currentBet - (context.actor.currentBet || 0)
    if (holdsNutsHand(context) && toCall > 0 && context.actor.chips <= toCall) {
      if (process.env.POKER_ML_DEBUG === '1') {
        console.error('[dbg] nuts call-all-in')
      }
      return 'call'
    }
    const raiseAdd = Math.max(0, Math.min(context.pot + toCall, context.actor.chips - toCall))
    let decEv
    if (decisionEvMode === 'trained') {
      decEv = Array.from(evOut).map(v => Math.max(-8, Math.min(8, v)))
      if (holdsNutsHand(context) && raiseAdd > 0 && context.actor.chips > toCall) {
        decEv[2] = Math.max(decEv[2], decEv[1] + 1)
      }
    } else {
      decEv = computeAnalyticEv(context, equityOut)
    }
    const action = pickActionFromEv(decEv, toCall, context.actor.chips, effMargin, allowRaise)
    if (process.env.POKER_ML_DEBUG === '1' && context.board.length >= 3) {
      const hole = context.actor.cards.map(c => c.rank + c.suit).join('')
      const boardStr = context.board.map(c => c.rank + c.suit).join('')
      const nutSpot = toCall === 0 && context.currentBet === 0 && context.board.length === 5
      if (nutSpot) {
        const opp = context.players.filter(p => !p.hasFolded && p.index !== context.actorIndex).length
        console.error(`[NUTSPOT] ${context.street} pot=${context.pot.toFixed(0)} share=${equityOut[5].toFixed(2)} opp=${opp} stack=${context.actor.chips} evA=[${decEv.map(v => v.toFixed(2)).join(', ')}] hole=${hole} board=${boardStr} -> ${action}`)
      }
    }
    if (action === 'raise' && getRaiseState) {
      const maxTo = (context.actor.currentBet || 0) + context.actor.chips
      const raiseTo = Math.min(context.currentBet + context.pot, maxTo)
      if (raiseTo > context.currentBet) {
        const allIn = raiseTo >= maxTo - 1
        const canJam = context.board.length < 3 || holdsNutsHand(context) || equityOut[5] >= 0.5
        if (process.env.POKER_ML_DEBUG === '1' && context.board.length >= 3 && allIn) {
          console.error(`[ALLIN] ${context.street} pot=${context.pot.toFixed(0)} toCall=${toCall} curBet=${context.currentBet} stack=${context.actor.chips} share=${equityOut[5].toFixed(2)} evA=[${decEv.map(v => v.toFixed(2)).join(', ')}] nut=${holdsNutsHand(context)} jam=${canJam ? 'yes' : 'no'} hole=${context.actor.cards.map(c => c.rank + c.suit).join('')}`)
        }
        if (allIn && !canJam) {
          return pickActionFromEv(decEv, toCall, context.actor.chips, effMargin, false)
        }
        getRaiseState().raiseAmount = Math.round(raiseTo)
      } else {
        return 'call'
      }
    }
    return action
  }
}
