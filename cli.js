#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const precinct = require('precinct')
const { Command } = require('commander')

const build = new Command()

let p

build
  .command('build')
  .description('build your application as individual microservices')
  .option('-s, --source [source]', 'the source folder of your application', 'src')
  .option('-d, --destination [destination]', 'where to build to', 'build')
  .option('-p, --package [package file]', 'which package.json file to use to get dependency versions', 'package.json')
  .action(({ source, destination, package: pkg }) => {
    p = require(path.resolve(pkg))
    startBuild(source, destination)
  })

build.parse(process.argv)

const dependencies = new Map() // index of local dependencies
const nodeDependencies = new Map() // list of node dependencies
const entrypoints = new Map() // files that constitute the entrypoint of a microservice

async function startBuild (source, destination) {
  await fs.promises.rmdir('build', { recursive: true })
  await fs.promises.mkdir('build')
  await scanDirectory(source) // map all dependencies & entrypoints
  const typecount = new Map()
  for (const [entrypoint, type] of entrypoints.entries()) {
    typecount.set(type, (typecount.get(type) || 0) + 1)
    // TODO: name it ${server}, check for collisions
    buildMicroService(`${type}-${typecount.get(type)}.${path.basename(entrypoint, '.js')}`, entrypoint)
  }
}

async function scanDirectory (directory) {
  for await (const dirent of await fs.promises.opendir(directory)) {
    if (dirent.isDirectory()) await scanDirectory(path.resolve(directory, dirent.name))
    else if (dirent.isFile()) await scanFile(path.resolve(directory, dirent.name))
  }
}

async function scanFile (file) {
  const code = await fs.promises.readFile(file, { encoding: 'utf8' })
  const endpoint = code.match(/^\/\*\s*ezrpc-([a-z-]*)\s*\*\//i)
  if (endpoint) entrypoints.set(file, endpoint[1])
  const deps = precinct(code)
  const dir = path.dirname(file)
  deps.forEach(dep => {
    const isNodeModule = !dep.match(/[\\/.]/) && (require.resolve(dep) === dep || require.resolve(dep).includes('/node_modules/'))
    if (isNodeModule) {
      const depSet = nodeDependencies.get(file)
      if (depSet) depSet.add(dep)
      else nodeDependencies.set(file, new Set([dep]))
    } else {
      const depPath = require.resolve(path.resolve(dir, dep))
      const depSet = dependencies.get(file)
      if (depSet) depSet.add(depPath)
      else dependencies.set(file, new Set([depPath]))
    }
  })
}

async function buildMicroService (name, entrypoint) {
  const root = path.resolve('build', name)
  await fs.promises.mkdir(root)
  await createPackageJson(name, root, entrypoint)
  await fs.promises.mkdir(path.resolve(root, 'js'))
  // TODO: createFiles(entryPoint)
}

async function createPackageJson (name, root, entrypoint) {
  const dependencies = getDependencies(entrypoint)
  const main = path.basename(entrypoint)
  await fs.promises.writeFile(path.resolve(root, 'package.json'), JSON.stringify({
    name,
    main,
    dependencies,
    devDependencies: {
      pm2: '^4.2.3'
    },
    scripts: {
      cluster: `npm run pm2 start ${main} -i max`
    }
  }, null, 2))
}

function getDependencies (file, res = {}, handledFiles = new Set()) {
  if (!file) return res
  if (handledFiles.has(file)) return res
  handledFiles.add(file)
  const nDeps = nodeDependencies.get(file)
  if (nDeps) {
    nDeps.forEach(dep => {
      if (p && p.dependencies) res[dep] = p.dependencies[dep]
      res[dep] = res[dep] || 'latest'
    })
  }
  const deps = dependencies.get(file)
  if (deps) {
    deps.forEach(file => getDependencies(file, res, handledFiles))
  }
  return res
}
