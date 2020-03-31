#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const precinct = require('precinct')
const { program } = require('commander')

let source
let destination
let packageDependencies

program
  .command('build')
  .description('build your application as individual microservices')
  .option('-s, --source [source]', 'the source folder of your application', 'src')
  .option('-d, --destination [destination]', 'where to build to', 'build')
  .option('-p, --package [package file]', 'which package.json file to use to get dependency versions', 'package.json')
  .action(res => {
    source = res.source
    destination = res.destination
    packageDependencies = require(path.resolve(res.package)).dependencies
    startBuild().catch(err => {
      console.log(`Build failed: ${err.stack}`)
      process.exit(1)
    })
  })

program.parse(process.argv)

const entrypoints = new Map() // maps microservice names to entrypoint paths
// TODO: merge dependencies & dependencyImports
// Dependencies = fileName => new Set(fileName.import.values())
const dependencies = new Map() // fileName => {paths}
const dependencyImports = new Map() // fileName => (import => path)
const modules = new Map() // maps path to {node_modules}

/**
 * Start build
 */
async function startBuild () {
  await fs.promises.rmdir(path.resolve(destination), { recursive: true })
  await fs.promises.mkdir(path.resolve(destination))
  await scanDirectory(source)
  for (const [name, entrypoint] of entrypoints.entries()) {
    buildMicroService(name, entrypoint)
  }
}

/**
 * Scans directories recursively to find entrypoints
 * @param {String} directory - directory to scan
 */
async function scanDirectory (directory) {
  for await (const dirent of await fs.promises.opendir(directory)) {
    if (dirent.isDirectory()) await scanDirectory(path.resolve(directory, dirent.name))
    else if (dirent.isFile()) await scanFile(path.resolve(directory, dirent.name))
  }
}

/**
 * Maps a file's dependencies & whether its an entrypoint
 * @param {String} file - file to scan
 */
const scannedFiles = new Set() // only scan files once
async function scanFile (file) {
  if (scannedFiles.has(file)) return
  scannedFiles.add(file)
  const code = await fs.promises.readFile(file, { encoding: 'utf8' })
  const isEntrypoint = code.match(/^\/\*\s*ezrpc-([a-z-]*)\s*\*\//i)
  if (isEntrypoint) {
    const name = isEntrypoint[1]
    if (entrypoints.has(name)) throw new Error(`There are multiple microservices with the name '${name}'!`)
    entrypoints.set(name, file)
  }
  const fileDependencies = precinct(code)
  const directory = path.dirname(file)
  // Loop through this file's dependencies and map them in modules/dependencies
  fileDependencies.forEach(depName => {
    const isNodeModule = !depName.match(/[\\/.]/) && (require.resolve(depName) === depName || require.resolve(depName).includes('/node_modules/'))
    if (isNodeModule) {
      const knownModules = modules.get(file)
      if (knownModules) knownModules.add(depName)
      else modules.set(file, new Set([depName]))
    } else {
      // Set dependency of file
      const depPath = require.resolve(path.resolve(directory, depName))
      const knownDeps = dependencies.get(file)
      if (knownDeps) knownDeps.add(depPath)
      else dependencies.set(file, new Set([depPath]))

      // Set dependencyImports of a file
      const knownImports = dependencyImports.get(file)
      if (knownImports) knownImports.set(depName, depPath)
      else dependencyImports.set(file, new Map().set(depName, depPath))
    }
  })
}

/**
 * Build a microservice
 * @param {String} name - naem of this microservice
 * @param {String} entrypoint - path to the entrypoint of this microservice
 */
async function buildMicroService (name, entrypoint) {
  const root = path.resolve(destination, name)
  const js = path.resolve(root, 'js')
  await fs.promises.mkdir(root)
  await fs.promises.mkdir(js)
  const { requiredFiles, requiredModules } = discoverRequirements(entrypoint)
  const fileLocation = new Map() // oldPath => newPath
  const writtenPaths = new Set() // {newPaths}
  // TODO: write requiredFiles
  // TODO: write entrypoint
}

/**
 * Gathers a set of required files & a set of required modules for a file (recursively)
 * @param {String} file - file to gather requirements for
 * @param {Set} [handledFiles=new Set()] - files that have already been checked
 * @param {Set} [requiredFiles=new Set()] - files that are required
 * @param {Set} [requiredModules=new Set()] - modulse that are required
 * @returns {{ requiredFiles: Set, requiredModules: Set }} set of required files & set of required modules
 */
function discoverRequirements (file, handledFiles = new Set(), requiredFiles = new Set(), requiredModules = new Set()) {
  if (handledFiles.has(file)) return { requiredFiles, requiredModules }
  handledFiles.add(file)

  // Gather file requirements
  const reqs = dependencies.get(file)
  if (reqs) {
    reqs.forEach(req => {
      requiredFiles.add(req)
      // Recursively discover more requirements
      discoverRequirements(req, handledFiles, requiredFiles)
    })
  }

  // Gather required node modules
  const mods = modules.get(file)
  if (mods) mods.forEach(mod => requiredModules.add(mod))

  return { requiredFiles, requiredModules }
}
