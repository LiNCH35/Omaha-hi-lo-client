import fs from 'node:fs'
import path from 'node:path'
import { FEATURE_SETS, buildVector, buildOuts } from './features/variants'
import { EQ_NAMES, EV_NAMES } from './features/mcEquity'
import { trainEquityEv } from './core/trainCore'

const args = process.argv.slice(2)
const opts = {}
for (const arg of args) {
  const match = /^--([a-zA-Z]+)=?(.*)$/.exec(arg)
  if (match) {
    opts[match[1]] = match[2] === '' ? true : match[2]
  }
}

const dataPath = path.resolve(process.cwd(), opts.data ?? 'data/omaha4_8p_lo_v3_labeled.jsonl')
const rawPath = path.resolve(process.cwd(), opts.raw ?? dataPath.replace('_labeled', ''))
const outPath = path.resolve(process.cwd(), opts.out ?? 'data/experiments.json')
const modelsRoot = path.resolve(process.cwd(), opts.models ?? 'models_exp')
const epochs = parseInt(opts.epochs ?? '20', 10)
const batchSize = parseInt(opts.batch ?? '256', 10)
const valFraction = parseFloat(opts.val ?? '0.1')
const runs = Math.max(1, parseInt(opts.runs ?? '1', 10))
const limit = opts.limit ? parseInt(opts.limit, 10) : 0
const sets = (opts.sets ?? 'base,noPreflop,ratioOuts,nutScoop').split(',').map(s => s.trim()).filter(Boolean)
for (const set of sets) {
  if (!FEATURE_SETS[set]) {
    throw new Error(`Unknown feature set: ${set} (available: ${Object.keys(FEATURE_SETS).join(', ')})`)
  }
}

const rawLines = fs.readFileSync(rawPath, 'utf8').split('\n').filter(Boolean)
const labelLines = fs.readFileSync(dataPath, 'utf8').split('\n').filter(Boolean)
JSON.parse(rawLines[0])
JSON.parse(labelLines[0])
let rawRecs = rawLines.slice(1).map(l => JSON.parse(l)).filter(r => r.t === 'd')
let labels = labelLines.slice(1).map(l => JSON.parse(l))
if (limit > 0) {
  rawRecs = rawRecs.slice(0, limit)
  labels = labels.slice(0, limit)
}
if (rawRecs.length !== labels.length) {
  throw new Error(`Dataset mismatch: raw=${rawRecs.length} labeled=${labels.length}`)
}
for (let i = 0; i < rawRecs.length; i++) {
  if (rawRecs[i].f.length !== labels[i].f.length || rawRecs[i].f.some((v, j) => v !== labels[i].f[j])) {
    throw new Error(`Feature mismatch at record ${i}: raw dataset and labeled dataset are out of alignment`)
  }
}

const n = labels.length
const outsCache = new Array(n).fill(undefined)
const needOuts = sets.some(s => ['ratioOuts', 'nutScoop'].includes(s))
function getOuts(i) {
  if (outsCache[i] === undefined) {
    outsCache[i] = buildOuts(rawRecs[i])
  }
  return outsCache[i]
}
function buildRecord(set, i) {
  const x = buildVector(set, labels[i], needOuts ? getOuts(i) : undefined)
  return { x, eq: labels[i].eq, ev: labels[i].ev }
}

const results = {}
for (const set of sets) {
  results[set] = { dim: FEATURE_SETS[set].length, runs: [] }
}
const mean = list => list.reduce((sum, v) => sum + v, 0) / list.length

function saveProgress(startedAt) {
  for (const set of sets) {
    const done = results[set].runs
    if (done.length > 0) {
      results[set].equityMean = EQ_NAMES.map((_, i) => mean(done.map(r => r.equityValMae[i])))
      results[set].evMean = EV_NAMES.map((_, i) => mean(done.map(r => r.evValMae[i])))
    }
  }
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify({
    data: dataPath,
    raw: rawPath,
    records: n,
    epochs,
    batchSize,
    runs,
    runsDone: Math.max(...sets.map(s => results[s].runs.length)),
    elapsedMs: Date.now() - startedAt,
    results
  }, null, 2))
}

async function main() {
  const startedAt = Date.now()
  const idx = Array.from({ length: n }, (_, i) => i)

  for (let run = 0; run < runs; run++) {
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      const tmp = idx[i]
      idx[i] = idx[j]
      idx[j] = tmp
    }
    const nVal = Math.max(1, Math.floor(n * valFraction))
    const trainIdx = idx.slice(0, n - nVal)
    const valIdx = idx.slice(n - nVal)

    for (const set of sets) {
      const t0 = Date.now()
      process.stdout.write(`[exp] run=${run + 1}/${runs} set=${set} dim=${FEATURE_SETS[set].length} training...\n`)
      const train = trainIdx.map(i => buildRecord(set, i))
      const val = valIdx.map(i => buildRecord(set, i))
      const metrics = await trainEquityEv({
        train,
        val,
        featureNames: FEATURE_SETS[set],
        featureSet: set,
        eqNames: EQ_NAMES,
        evNames: EV_NAMES,
        epochs,
        batchSize,
        modelsDir: path.join(modelsRoot, set),
        source: dataPath
      })
      results[set].runs.push({
        equityValMae: metrics.equity.valMae,
        evValMae: metrics.ev.valMae,
        ms: Date.now() - t0
      })
      saveProgress(startedAt)
      process.stdout.write(`[exp] run=${run + 1}/${runs} set=${set} done in ${Math.round((Date.now() - t0) / 1000)}s\n`)
    }
  }

  saveProgress(startedAt)
  process.stdout.write(JSON.stringify({ outPath, runs, elapsedMs: Date.now() - startedAt }, null, 2) + '\n')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
