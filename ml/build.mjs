import path from 'node:path'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'

const mlRoot = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(mlRoot, '..')

const shimAliases = {
  '@/helpers/gameLogic': path.join(mlRoot, 'src', 'shims', 'gameLogicShim.js'),
  '@/helpers/debugLogger': path.join(mlRoot, 'src', 'shims', 'debugLoggerShim.js')
}

const atAliasPlugin = {
  name: 'at-alias',
  setup(build) {
    build.onResolve({ filter: /^@\/|^@$/ }, args => {
      const shim = shimAliases[args.path]
      if (shim) {
        return { path: shim }
      }
      const resolved = path.join(projectRoot, 'src', args.path.slice(1))
      return { path: path.extname(resolved) ? resolved : resolved + '.js' }
    })
  }
}

await esbuild.build({
  entryPoints: [
    path.join(mlRoot, 'src', 'simHeadless.js'),
    path.join(mlRoot, 'src', 'genDataset.js'),
    path.join(mlRoot, 'src', 'labelDataset.js'),
    path.join(mlRoot, 'src', 'train.js'),
    path.join(mlRoot, 'src', 'neuralSim.js'),
    path.join(mlRoot, 'src', 'benchmark.js'),
    path.join(mlRoot, 'src', 'experiments.js'),
    path.join(mlRoot, 'src', 'tournamentCheck.js'),
    path.join(mlRoot, 'src', 'tournamentReview.js'),
    path.join(mlRoot, 'src', 'scenarioCheck.js')
  ],
  bundle: true,
  platform: 'node',
  target: ['node16'],
  format: 'cjs',
  outdir: path.join(mlRoot, 'dist'),
  outExtension: { '.js': '.cjs' },
  sourcemap: false,
  logLevel: 'info',
  plugins: [atAliasPlugin]
})
