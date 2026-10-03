export function loadFastModel(modelDir, fsModule, pathModule) {
  const modelJson = JSON.parse(fsModule.readFileSync(pathModule.join(modelDir, 'model.json'), 'utf8'))
  const weightPath = pathModule.join(modelDir, modelJson.weightsManifest[0].paths[0])
  const weightBuffer = fsModule.readFileSync(weightPath)
  const all = new Float32Array(
    weightBuffer.buffer.slice(weightBuffer.byteOffset, weightBuffer.byteOffset + weightBuffer.byteLength)
  )

  const specs = []
  let offset = 0
  for (const group of modelJson.weightsManifest) {
    for (const spec of group.weights) {
      const length = spec.shape.reduce((a, b) => a * b, 1)
      specs.push({ name: spec.name, shape: spec.shape, offset, length })
      offset += length
    }
  }

  const topology = modelJson.modelTopology
  const layerList = topology.layers || (topology.config && topology.config.layers) || []
  const denseConfigs = layerList
    .map(layer => layer.config || layer)
    .filter(config => config.units !== undefined)

  const layers = denseConfigs.map(config => ({
    units: config.units,
    activation: config.activation || 'linear',
    kernel: null,
    bias: null
  }))

  let specIndex = 0
  for (const layer of layers) {
    const kernelSpec = specs[specIndex]
    const biasSpec = specs[specIndex + 1]
    specIndex += 2
    layer.kernel = all.subarray(kernelSpec.offset, kernelSpec.offset + kernelSpec.length)
    layer.bias = all.subarray(biasSpec.offset, biasSpec.offset + biasSpec.length)
  }

  const forward = input => {
    let v = input instanceof Float32Array ? input : Float32Array.from(input)
    for (const layer of layers) {
      const units = layer.units
      const inDim = v.length
      const out = new Float32Array(units)
      const kernel = layer.kernel
      const bias = layer.bias
      for (let i = 0; i < inDim; i++) {
        const x = v[i]
        if (x === 0) {
          continue
        }
        const base = i * units
        for (let o = 0; o < units; o++) {
          out[o] += x * kernel[base + o]
        }
      }
      for (let o = 0; o < units; o++) {
        let y = out[o] + bias[o]
        if (layer.activation === 'relu') {
          y = y > 0 ? y : 0
        } else if (layer.activation === 'sigmoid') {
          y = 1 / (1 + Math.exp(-y))
        } else if (layer.activation === 'tanh') {
          y = Math.tanh(y)
        } else if (layer.activation === 'softmax') {
          y = Math.exp(y)
        }
        out[o] = y
      }
      if (layer.activation === 'softmax') {
        let sum = 0
        for (let o = 0; o < units; o++) {
          sum += out[o]
        }
        for (let o = 0; o < units; o++) {
          out[o] /= sum
        }
      }
      v = out
    }
    return v
  }

  forward.layers = layers
  return forward
}
