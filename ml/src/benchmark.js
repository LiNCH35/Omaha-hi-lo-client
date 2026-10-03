import { createTable, playHand } from './core/runner'
import { loadNeuralPolicy } from './core/neuralPolicy'
import { getBotDecision } from '../../src/helpers/gameLogic'
import fs from 'node:fs'
import path from 'node:path'
import * as tf from '@tensorflow/tfjs'
import { loadFastModel } from './features/fastForward'

function randomDecide(context) {
  return getBotDecision({ currentBet: context.actor.currentBet || 0 }, context.currentBet)
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
  const margin = parseFloat(opts.margin ?? '1')
  const allowRaise = opts.allowRaise === '1'
  const neuralSeats = parseInt(opts.neuralSeats ?? String(Math.floor(playerCount / 2)), 10)

  const maxDiff = await validateFastAgainstTf(modelsDir)
  const neuralDecide = loadNeuralPolicy(modelsDir, { margin, allowRaise })
  const challengerDecide = modelsDirB
    ? loadNeuralPolicy(modelsDirB, { margin, allowRaise })
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
  let violations = 0
  let handCount = 0
  const neuralNets = []
  const randomNets = []
  const neuralActions = { fold: 0, call: 0, raise: 0 }
  const randomActions = { fold: 0, call: 0, raise: 0 }
  const startedAt = Date.now()

  for (let handIndex = 0; handIndex < hands; handIndex++) {
    try {
      const record = playHand(table, {
        startChips,
        dealerIndex: handIndex % playerCount,
        decisionFn: decide
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
    fastForwardMaxDiff: maxDiff,
    neuralNetPerHandBB: avg(neuralNets) / bb,
    randomNetPerHandBB: avg(randomNets) / bb,
    edgePerHandBB: diffMean / bb,
    edgeStdBB: diffStd / bb,
    edgeStdErrorBB: se / bb,
    neuralActions,
    randomActions,
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
