import { createTable, playHand } from './core/runner'
import { loadNeuralPolicy } from './core/neuralPolicy'
import { getBotDecision } from '../../src/helpers/gameLogic'
import { appCardToCode, evaluateOmaha, getAbsoluteNuts } from '../../src/helpers/hiLowEvaluator'
import fs from 'node:fs'
import path from 'node:path'
import * as tf from '@tensorflow/tfjs'
import { loadFastModel } from './features/fastForward'

function randomDecide(context) {
  return getBotDecision({ currentBet: context.actor.currentBet || 0 }, context.currentBet)
}

function holdsNuts(context) {
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

function riverStrength(context) {
  try {
    const hole = context.actor.cards.map(appCardToCode)
    const board = context.board.map(appCardToCode)
    if (board.length !== 5) {
      return 1
    }
    const current = evaluateOmaha(hole, board)
    const nuts = getAbsoluteNuts(board, hole)
    return nuts.high > 0 ? current.high / nuts.high : 1
  } catch (error) {
    return 1
  }
}

function isClosingAction(context) {
  const others = context.players.filter(p => !p.hasFolded && p.index !== context.actorIndex)
  return others.every(p => p.hasActed)
}

async function validateFastAgainstTf(modelsDir) {
  const meta = JSON.parse(fs.readFileSync(path.join(modelsDir, 'trainingMeta.json'), 'utf8'))
  const dim = meta.featureNames.length
  const loadTfModel = dir => {
    const modelJson = JSON.parse(fs.readFileSync(path.join(dir, 'model.json'), 'utf8'))
    const weightBuffer = fs.readFileSync(path.join(dir, modelJson.weightsManifest[0].paths[0]))
    const weightData = weightBuffer.buffer.slice(
      weightBuffer.byteOffset,
      weightBuffer.byteOffset + weightBuffer.byteLength
    )
    return tf.loadLayersModel(tf.io.fromMemory({
      modelTopology: modelJson.modelTopology,
      weightSpecs: modelJson.weightsManifest[0].weights,
      weightData
    }))
  }
  const equityTf = await loadTfModel(path.join(modelsDir, 'equity'))
  const evTf = await loadTfModel(path.join(modelsDir, 'ev'))
  const equityFast = loadFastModel(path.join(modelsDir, 'equity'), fs, path)
  const evFast = loadFastModel(path.join(modelsDir, 'ev'), fs, path)
  let maxDiff = 0
  for (let t = 0; t < 10; t++) {
    const x = Array.from({ length: dim }, () => Math.random())
    const eqTf = Array.from(equityTf.predict(tf.tensor2d([x])).dataSync())
    const eqFast = Array.from(equityFast(x))
    const evTfOut = Array.from(evTf.predict(tf.tensor2d([x.concat(eqTf)])).dataSync())
    const evFastOut = Array.from(evFast(x.concat(eqTf)))
    for (let i = 0; i < 6; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(eqTf[i] - eqFast[i]))
    }
    for (let i = 0; i < 3; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(evTfOut[i] - evFastOut[i]))
    }
  }
  if (maxDiff > 1e-4) {
    throw new Error(`fastForward diverges from tfjs: maxDiff=${maxDiff}`)
  }
  return maxDiff
}

async function main() {
  const verbose = process.env.POKER_ML_VERBOSE === '1'
  const originalConsoleLog = console.log
  if (!verbose) {
    console.log = () => {}
  }

  const args = process.argv.slice(2)
  const opts = {}
  for (const arg of args) {
    const match = /^--([a-zA-Z]+)=?(.*)$/.exec(arg)
    if (match) {
      opts[match[1]] = match[2] === '' ? true : match[2]
    }
  }

  const hands = parseInt(opts.hands ?? '2000', 10)
  const playerCount = parseInt(opts.players ?? '8', 10)
  const startChips = parseInt(opts.chips ?? '1000', 10)
  const cardCount = parseInt(opts.cards ?? '4', 10)
  const lowRules = opts.low !== '0'
  const modelsDir = path.resolve(process.cwd(), opts.models ?? 'models')
  const modelsDirB = opts.modelsB ? path.resolve(process.cwd(), opts.modelsB) : null
  const decisionEv = opts.decisionEv === 'trained' ? 'trained' : opts.decisionEv === 'analytic' ? 'analytic' : null
  const margin = parseFloat(opts.margin ?? (decisionEv === 'trained' ? '0.05' : '1'))
  const allowRaise = opts.allowRaise === '1'
  const neuralSeats = parseInt(opts.neuralSeats ?? String(Math.floor(playerCount / 2)), 10)

  const maxDiff = await validateFastAgainstTf(modelsDir)
  const neuralDecide = loadNeuralPolicy(modelsDir, { margin, allowRaise, getRaiseState: () => table.store.state, decisionEv })
  const challengerDecide = modelsDirB
    ? loadNeuralPolicy(modelsDirB, { margin, allowRaise, getRaiseState: () => table.store.state, decisionEv })
    : null
  if (modelsDirB) {
    await validateFastAgainstTf(modelsDirB)
  }
  const table = createTable({ playerCount, cardCount, lowRules })

  const decide = context => {
    if (context.actorIndex < neuralSeats) {
      return neuralDecide(context)
    }
    if (challengerDecide) {
      return challengerDecide(context)
    }
    return randomDecide(context)
  }

  const failures = []
  const sanity = {
    nutSpots: 0,
    nutPassiveChecks: 0,
    nutFolds: 0,
    nutSpotsByStreet: { flop: 0, turn: 0, river: 0 },
    nutPassiveByStreet: { flop: 0, turn: 0, river: 0 },
    riverRaiseSpots: 0,
    weakRiverRaises: 0,
    firstHandBusts: 0,
    firstHandBustDetail: [],
    neuralBusts: 0,
    postflopRaiseThenFoldHands: 0,
    raiseThenFoldHands: 0
  }
  const onDecision = (context, action) => {
    if (context.actorIndex >= neuralSeats) {
      return
    }
    const toCall = context.currentBet - (context.actor.currentBet || 0)
    if (context.board.length >= 3 && toCall === 0 && context.currentBet === 0 && isClosingAction(context)) {
      if (holdsNuts(context)) {
        sanity.nutSpots++
        sanity.nutSpotsByStreet[context.street]++
        if (action !== 'raise') {
          sanity.nutPassiveChecks++
          sanity.nutPassiveByStreet[context.street]++
        }
      }
    }
    if (action === 'fold' && holdsNuts(context)) {
      sanity.nutFolds++
    }
    if (action === 'raise' && context.board.length === 5) {
      sanity.riverRaiseSpots++
      if (!holdsNuts(context) && riverStrength(context) < 0.6) {
        sanity.weakRiverRaises++
      }
    }
  }
  let violations = 0
  let handCount = 0
  const neuralNets = []
  const randomNets = []
  const neuralActions = { fold: 0, call: 0, raise: 0 }
  const randomActions = { fold: 0, call: 0, raise: 0 }
  const startedAt = Date.now()
  let prevChips = new Array(playerCount).fill(startChips)

  for (let handIndex = 0; handIndex < hands; handIndex++) {
    try {
      const record = playHand(table, {
        startChips,
        dealerIndex: handIndex % playerCount,
        decisionFn: decide,
        onDecision
      })
      handCount++
      let neuralNet = 0
      let randomNet = 0
      for (const action of record.actions) {
        const target = action.seat < neuralSeats ? neuralActions : randomActions
        target[action.action]++
      }
      record.players.forEach((player, seat) => {
        if (seat < neuralSeats) {
          neuralNet += player.net
        } else {
          randomNet += player.net
        }
      })
      neuralNets.push(neuralNet)
      randomNets.push(randomNet)
      for (let seat = 0; seat < neuralSeats; seat++) {
        if (record.chipsAfter[seat] === 0 && prevChips[seat] > 0) {
          sanity.neuralBusts++
          const seatActions = record.actions
            .filter(a => a.seat === seat)
            .map(a => `${a.street}:${a.action}`)
          if (handIndex === 0) {
            sanity.firstHandBusts++
            sanity.firstHandBustDetail.push({ seat, pot: record.potTotal, actions: seatActions })
          }
        }
      }
      for (let seat = 0; seat < neuralSeats; seat++) {
        const idx = record.actions.reduce((acc, a, i) => {
          if (a.seat !== seat) return acc
          if (a.action === 'raise') acc.raises.push({ i, street: a.street })
          if (a.action === 'fold') acc.fold = i
          return acc
        }, { raises: [], fold: -1 })
        if (idx.fold >= 0 && idx.raises.some(r => r.i < idx.fold)) {
          sanity.raiseThenFoldHands++
          if (idx.raises.some(r => r.i < idx.fold && r.street !== 'preflop')) {
            sanity.postflopRaiseThenFoldHands++
          }
        }
      }
      prevChips = record.chipsAfter
      const chipSum = record.chipsAfter.reduce((sum, c) => sum + c, 0)
      if (record.endStep !== 'end' || chipSum !== startChips * playerCount) {
        violations++
      }
    } catch (error) {
      failures.push({ handIndex, error: String(error && error.message ? error.message : error) })
    }
  }

  const avg = list => list.reduce((sum, v) => sum + v, 0) / Math.max(1, list.length)
  const stddev = list => {
    const m = avg(list)
    return Math.sqrt(list.reduce((sum, v) => sum + (v - m) ** 2, 0) / Math.max(1, list.length))
  }
  const diffPerHand = neuralNets.map((v, i) => v - randomNets[i])
  const bb = 20
  const diffMean = avg(diffPerHand)
  const diffStd = stddev(diffPerHand)
  const se = diffStd / Math.sqrt(Math.max(1, diffPerHand.length))

  console.log = originalConsoleLog
  process.stdout.write(JSON.stringify({
    mode: modelsDirB ? 'head-to-head' : 'vs-random',
    models: modelsDir,
    modelsB: modelsDirB,
    hands: handCount,
    playerCount,
    neuralSeats,
    allowRaise,
    margin,
    decisionEv,
    fastForwardMaxDiff: maxDiff,
    neuralNetPerHandBB: avg(neuralNets) / bb,
    randomNetPerHandBB: avg(randomNets) / bb,
    edgePerHandBB: diffMean / bb,
    edgeStdBB: diffStd / bb,
    edgeStdErrorBB: se / bb,
    neuralActions,
    randomActions,
    sanity,
    invariantViolations: violations,
    failureCount: failures.length,
    failures: failures.slice(0, 3),
    elapsedMs: Date.now() - startedAt
  }, null, 2) + '\n')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
