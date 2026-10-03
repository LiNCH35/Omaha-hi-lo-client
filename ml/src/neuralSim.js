import fs from 'node:fs'
import path from 'node:path'
import * as tf from '@tensorflow/tfjs'
import { extractFeatures } from '@/helpers/neuralFeatures'
import { pickActionFromEv } from '@/helpers/neuralBot'
import { createTable, playHand } from './core/runner'

async function loadLocalModel(dir) {
  const modelJson = JSON.parse(fs.readFileSync(path.join(dir, 'model.json'), 'utf8'))
  const weightsPath = path.join(dir, modelJson.weightsManifest[0].paths[0])
  const weightBuffer = fs.readFileSync(weightsPath)
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

  const hands = parseInt(opts.hands ?? '100', 10)
  const playerCount = parseInt(opts.players ?? '8', 10)
  const startChips = parseInt(opts.chips ?? '1000', 10)
  const cardCount = parseInt(opts.cards ?? '4', 10)
  const lowRules = opts.low !== '0'
  const modelsDir = path.resolve(process.cwd(), opts.models ?? 'models')
  const raiseMargin = parseFloat(opts.margin ?? '1')
  const allowRaise = opts.allowRaise === '1'

  const meta = JSON.parse(fs.readFileSync(path.join(modelsDir, 'trainingMeta.json'), 'utf8'))
  const mean = meta.norm.mean
  const std = meta.norm.std
  const equityModel = await loadLocalModel(path.join(modelsDir, 'equity'))
  const evModel = await loadLocalModel(path.join(modelsDir, 'ev'))

  const decisionCounts = { fold: 0, call: 0, raise: 0 }
  let neuralDecisions = 0

  const decide = context => {
    const features = extractFeatures(context)
    const normalized = features.map((v, i) => (v - mean[i]) / std[i])
    const input = tf.tensor2d([normalized])
    const equityValues = Array.from(equityModel.predict(input).dataSync())
    const evInput = tf.tensor2d([normalized.concat(equityValues)])
    const evOut = Array.from(evModel.predict(evInput).dataSync())
    input.dispose()
    evInput.dispose()
    neuralDecisions++
    const toCall = context.currentBet - (context.actor.currentBet || 0)
    const action = pickActionFromEv(evOut, toCall, context.actor.chips, raiseMargin, allowRaise)
    decisionCounts[action]++
    return action
  }

  const table = createTable({ playerCount, cardCount, lowRules })
  const failures = []
  let violations = 0
  let totalActions = 0
  const startedAt = Date.now()

  for (let handIndex = 0; handIndex < hands; handIndex++) {
    try {
      const record = playHand(table, {
        startChips,
        dealerIndex: handIndex % playerCount,
        decisionFn: decide
      })
      totalActions += record.actions.length
      const chipSum = record.chipsAfter.reduce((sum, c) => sum + c, 0)
      if (record.endStep !== 'end' || chipSum !== startChips * playerCount) {
        violations++
      }
    } catch (error) {
      failures.push({ handIndex, error: String(error && error.message ? error.message : error) })
    }
  }

  const elapsedMs = Date.now() - startedAt

  console.log = originalConsoleLog
  process.stdout.write(JSON.stringify({
    hands,
    playerCount,
    lowRules,
    raiseMargin,
    allowRaise,
    neuralDecisions,
    decisionCounts,
    totalActions,
    invariantViolations: violations,
    failureCount: failures.length,
    failures: failures.slice(0, 3),
    elapsedMs
  }, null, 2) + '\n')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
