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
    const start = Date.now()
    startBuild()
      .then(() => {
        console.log(`Build succeeded in ${Date.now() - start} ms`)
      })
      .catch(err => {
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
  const builds = []
  for (const [name, entrypoint] of entrypoints.entries()) {
    console.log(`- Starting build for ${name}`)
    builds.push(buildMicroService(name, entrypoint))
  }
  return Promise.all(builds)
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
  const start = Date.now()
  const root = path.resolve(destination, name)
  const js = path.resolve(root, 'js')
  await fs.promises.mkdir(root)
  await fs.promises.mkdir(js)
  const { requiredFiles, requiredModules } = discoverRequirements(entrypoint)
  await writeRequiredFiles(js, requiredFiles, entrypoint)
  await writePackageJson(name, root, requiredModules)
  console.log(`-- Build for ${name} succesful (${Date.now() - start} ms)`)
}

async function writePackageJson (name, root, modules) {
  const dependencies = {}
  modules.forEach(dependency => {
    dependencies[dependency] = packageDependencies && packageDependencies[dependency]
      ? packageDependencies[dependency]
      : 'latest'
  })
  await fs.promises.writeFile(path.resolve(root, 'package.json'), JSON.stringify({
    name,
    main: 'js/index.js',
    private: true,
    dependencies
  }, null, 2))
}

/**
 * Writes given files to a given location
 * @param {String} location - location to write requiredFiles to
 * @param {Set<String>} requiredFiles - set of paths to files to write
 * @param {String} entrypoint - the entrypoint of this microservice
 * @returns {Promise} promise that resolves after all files have been written
 */
function writeRequiredFiles (location, requiredFiles, entrypoint) {
  const mainPath = path.resolve(location, 'index.js')
  const fileLocations = new Map().set(entrypoint, mainPath) // oldPath => newPath
  const writtenPaths = new Set([mainPath]) // {newPaths}

  // Allocate new file locations
  requiredFiles.forEach(file => {
    let newLocation = fileLocations.get(file) || path.resolve(location, path.basename(file))
    // Make sure the path has not been used yet
    let i = 0
    while (writtenPaths.has(newLocation)) {
      const ext = path.extname(file)
      newLocation = path.resolve(location, `${path.basename(file, ext)}.${i++}${ext}`)
    }
    writtenPaths.add(newLocation)
    fileLocations.set(file, newLocation)
  })

  const tasks = []
  for (const [oldPath, newPath] of fileLocations.entries()) {
    tasks.push(
      fs.promises.readFile(oldPath, { encoding: 'utf8' })
        .then(code => {
          const imps = dependencyImports.get(oldPath)
          if (imps) {
            for (const [imp, impPath] of imps.entries()) {
              const newImpPath = fileLocations.get(impPath)
              const newImpName = `./${path.basename(newImpPath)}`
              code = code.replace(new RegExp(imp, 'gi'), newImpName)
            }
          }
          return fs.promises.writeFile(newPath, code)
        })
    )
  }
  return Promise.all(tasks)
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