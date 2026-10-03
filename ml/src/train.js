import fs from 'node:fs'
import path from 'node:path'
import { FEATURE_SETS, CARD_DEPENDENT, buildVector } from './features/variants'
import { trainEquityEv } from './core/trainCore'

const args = process.argv.slice(2)
const opts = {}
for (const arg of args) {
  const match = /^--([a-zA-Z]+)=?(.*)$/.exec(arg)
  if (match) {
    opts[match[1]] = match[2] === '' ? true : match[2]
  }
}

const dataPath = path.resolve(process.cwd(), opts.data ?? 'data/omaha4_8p_labeled.jsonl')
const modelsDir = path.resolve(process.cwd(), opts.models ?? 'models')
const epochs = parseInt(opts.epochs ?? '20', 10)
const batchSize = parseInt(opts.batch ?? '256', 10)
const valFraction = parseFloat(opts.val ?? '0.1')
const set = opts.set ?? 'base'
const featureNames = FEATURE_SETS[set]
if (!featureNames) {
  throw new Error(`Unknown feature set: ${set} (available: ${Object.keys(FEATURE_SETS).join(', ')})`)
}
if (CARD_DEPENDENT.includes(set)) {
  throw new Error(`Set "${set}" needs hole/board cards from the raw dataset; use the experiments runner`)
}

const raw = fs.readFileSync(dataPath, 'utf8').split('\n').filter(Boolean)
const meta = JSON.parse(raw[0])
const records = raw.slice(1).map(line => JSON.parse(line))
const nTotal = records.length
if (nTotal < 500) {
  throw new Error(`Too few labeled records: ${nTotal}`)
}

for (let i = records.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1))
  const tmp = records[i]
  records[i] = records[j]
  records[j] = tmp
}

const nVal = Math.max(1, Math.floor(nTotal * valFraction))
const nTrain = nTotal - nVal
const train = records.slice(0, nTrain).map(r => ({ x: buildVector(set, r), eq: r.eq, ev: r.ev }))
const val = records.slice(nTrain).map(r => ({ x: buildVector(set, r), eq: r.eq, ev: r.ev }))

async function main() {
  const metrics = await trainEquityEv({
    train,
    val,
    featureNames,
    featureSet: set,
    eqNames: meta.eqNames,
    evNames: meta.evNames,
    epochs,
    batchSize,
    modelsDir,
    source: dataPath
  })

  process.stdout.write(JSON.stringify({
    set,
    modelsDir,
    records: nTotal,
    epochs,
    equityValMae: metrics.equity.valMae,
    evValMae: metrics.ev.valMae
  }, null, 2) + '\n')
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
