import fs from 'node:fs'
import path from 'node:path'
import * as tf from '@tensorflow/tfjs'

export function makeSaveHandler(dir) {
  return tf.io.withSaveHandler(async artifacts => {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'model.json'), JSON.stringify({
      format: artifacts.format,
      generatedBy: artifacts.generatedBy,
      convertedBy: artifacts.convertedBy,
      modelTopology: artifacts.modelTopology,
      weightsManifest: [{ paths: ['weights.bin'], weights: artifacts.weightSpecs }]
    }))
    fs.writeFileSync(path.join(dir, 'weights.bin'), Buffer.from(artifacts.weightData))
    return { modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } }
  })
}

export function makeModel(inputDim, outputDim, outputActivation) {
  const model = tf.sequential()
  model.add(tf.layers.dense({ units: 64, activation: 'relu', inputShape: [inputDim] }))
  model.add(tf.layers.dense({ units: 64, activation: 'relu' }))
  model.add(tf.layers.dense({ units: outputDim, activation: outputActivation }))
  model.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError' })
  return model
}

async function loadSavedModel(dir, expectedInputDim) {
  const spec = JSON.parse(fs.readFileSync(path.join(dir, 'model.json'), 'utf8'))
  const weights = fs.readFileSync(path.join(dir, 'weights.bin'))
  const weightData = weights.buffer.slice(weights.byteOffset, weights.byteOffset + weights.byteLength)
  const model = await tf.loadLayersModel(tf.io.fromMemory({
    modelTopology: spec.modelTopology,
    weightSpecs: spec.weightsManifest[0].weights,
    weightData
  }))
  if (model.inputs[0].shape[1] !== expectedInputDim) {
    throw new Error(`Warm start shape mismatch in ${dir}: model=${model.inputs[0].shape[1]} expected=${expectedInputDim}`)
  }
  model.compile({ optimizer: tf.train.adam(0.001), loss: 'meanSquaredError' })
  return model
}

export async function trainModel(model, xs, ys, valXs, valYs, name, epochs, batchSize) {
  const xT = tf.tensor2d(xs)
  const yT = tf.tensor2d(ys)
  const vxT = tf.tensor2d(valXs)
  const vyT = tf.tensor2d(valYs)
  try {
    const history = await model.fit(xT, yT, {
      epochs,
      batchSize,
      validationData: [vxT, vyT],
      verbose: 0
    })
    const valMae = tf.tidy(() => {
      const pred = model.predict(vxT)
      return pred.sub(vyT).abs().mean(0).dataSync()
    })
    const finalLoss = history.history.loss[history.history.loss.length - 1]
    const finalValLoss = history.history.val_loss[history.history.val_loss.length - 1]
    return { finalLoss, finalValLoss, valMae: Array.from(valMae) }
  } finally {
    xT.dispose()
    yT.dispose()
    vxT.dispose()
    vyT.dispose()
  }
}

export async function trainEquityEv({ train, val, featureNames, featureSet, eqNames, evNames, epochs, batchSize, modelsDir, source, evUnits, decisionEv, warmStart }) {
  const dim = featureNames.length
  if (train[0].x.length !== dim || val[0].x.length !== dim) {
    throw new Error(`Feature dim mismatch: expected ${dim}, got ${train[0].x.length}/${val[0].x.length}`)
  }

  const mean = new Array(dim).fill(0)
  const std = new Array(dim).fill(0)
  const nTrain = train.length
  for (const r of train) {
    for (let i = 0; i < dim; i++) {
      mean[i] += r.x[i]
    }
  }
  for (let i = 0; i < dim; i++) {
    mean[i] /= nTrain
  }
  for (const r of train) {
    for (let i = 0; i < dim; i++) {
      std[i] += (r.x[i] - mean[i]) ** 2
    }
  }
  for (let i = 0; i < dim; i++) {
    std[i] = Math.sqrt(std[i] / nTrain) || 1
  }

  const normX = list => list.map(r => r.x.map((v, i) => (v - mean[i]) / std[i]))
  const trainX = normX(train)
  const valX = normX(val)
  const eqDim = eqNames.length
  const evDim = evNames.length

  const trainEq = train.map(r => r.eq)
  const valEq = val.map(r => r.eq)
  const trainEv = train.map(r => r.ev)
  const valEv = val.map(r => r.ev)
  const trainX2 = trainX.map((x, i) => x.concat(trainEq[i]))
  const valX2 = valX.map((x, i) => x.concat(valEq[i]))

  process.stdout.write(`[train] equity dim=${dim} train=${nTrain} val=${val.length}${warmStart ? ' warmStart=' + warmStart : ''}\n`)
  const equityModel = warmStart ? await loadSavedModel(path.join(warmStart, 'equity'), dim) : makeModel(dim, eqDim, 'sigmoid')
  const equityMetrics = await trainModel(equityModel, trainX, trainEq, valX, valEq, 'equity', epochs, batchSize)
  await equityModel.save(makeSaveHandler(path.join(modelsDir, 'equity')))
  equityModel.dispose()
  process.stdout.write(`[train] equity done: valMae=${equityMetrics.valMae.map(v => v.toFixed(4)).join(',')}\n`)

  process.stdout.write(`[train] ev dim=${dim + eqDim}\n`)
  const evModel = warmStart ? await loadSavedModel(path.join(warmStart, 'ev'), dim + eqDim) : makeModel(dim + eqDim, evDim, 'linear')
  const evMetrics = await trainModel(evModel, trainX2, trainEv, valX2, valEv, 'ev', epochs, batchSize)
  await evModel.save(makeSaveHandler(path.join(modelsDir, 'ev')))
  evModel.dispose()
  process.stdout.write(`[train] ev done: valMae=${evMetrics.valMae.map(v => v.toFixed(4)).join(',')}\n`)

  const trainingMeta = {
    data: source,
    records: nTrain + val.length,
    train: nTrain,
    val: val.length,
    epochs,
    batchSize,
    featureSet: featureSet ?? 'base',
    featureNames,
    eqNames,
    evNames,
    norm: { mean, std },
    ...(evUnits ? { evUnits } : {}),
    ...(decisionEv ? { decisionEv } : {}),
    metrics: { equity: equityMetrics, ev: evMetrics }
  }
  fs.mkdirSync(modelsDir, { recursive: true })
  fs.writeFileSync(path.join(modelsDir, 'trainingMeta.json'), JSON.stringify(trainingMeta, null, 2))

  return { dim, equity: equityMetrics, ev: evMetrics }
}
