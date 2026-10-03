import fs from 'node:fs'
import path from 'node:path'
import { extractFeatures } from '@/helpers/neuralFeatures'
import { pickActionFromEv } from '@/helpers/neuralBot'
import { loadFastModel } from '../features/fastForward'
import { buildVector } from '../features/variants'

export function loadNeuralPolicy(modelsDir, { margin = 1, allowRaise = false } = {}) {
  const meta = JSON.parse(fs.readFileSync(path.join(modelsDir, 'trainingMeta.json'), 'utf8'))
  const mean = meta.norm.mean
  const std = meta.norm.std
  const set = meta.featureSet ?? 'base'
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
    const normalized = features.map((v, i) => (v - mean[i]) / std[i])
    const equityOut = equityForward(normalized)
    const evOut = evForward(normalized.concat(Array.from(equityOut)))
    const toCall = context.currentBet - (context.actor.currentBet || 0)
    return pickActionFromEv(evOut, toCall, context.actor.chips, margin, allowRaise)
  }
}
