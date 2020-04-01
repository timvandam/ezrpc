#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { program } = require('commander')

const getDependencies = code => Array.from(code.matchAll(/(?:require|import(?:.+from.+)?) *\(*(?:'|")([.\\@a-zA-Z-_0-9/]+)(?:'|")\)*/g)).map(group => group[1])
const getEnvironmentVariables = code => Array.from(code.matchAll(/process\.env\.([A-Za-z0-9_]+)/g)).map(group => group[1])

let source
let destination
let packageDependencies
let nodeModules
let env

program
  .command('build')
  .description('build your application as individual microservices')
  .option('-s, --source [source]', 'the source folder of your application', 'src')
  .option('-d, --destination [destination]', 'where to build to', 'build')
  .option('-p, --package [package file]', 'which package.json file to use to get dependency versions', 'package.json')
  .option('-m, --modules [node_modules]', 'where to look for node_modules', 'node_modules')
  .option('-e, --env', 'when used will generate a .env with all encountered environment variables')
  .action(res => {
    source = res.source
    destination = res.destination
    nodeModules = res.modules
    env = res.env
    const start = Date.now();
    (async () => {
      packageDependencies = require(path.resolve(res.package)).dependencies || {}
    })()
      .then(() => startBuild())
      .then(() => {
        console.log(`\nBuild succeeded in ${Date.now() - start} ms`)
        process.exit(0)
      })
      .catch(error => {
        if (error.code === 'MODULE_NOT_FOUND') console.log('The provided package.json could not be found')
        else console.log(`Build failed: ${error.message}`)
        process.exit(1)
      })
  })

program.parse(process.argv)

const entrypoints = new Map() // microserviceName => entrypointPath
const dependencies = new Map() // fileName => (importName => path)
const modules = new Map() // path => { ...node_modules }
const environmentVariables = new Map() // fileName => { ...environment variables }

/**
 * Start build
 * @returns {Promise} promise that resolves after all builds have completed
 */
function startBuild () {
  const start = Date.now()
  return fs.promises.rmdir(path.resolve(destination), { recursive: true })
    .then(() => fs.promises.mkdir(path.resolve(destination)))
    .then(() => scanDirectory(source))
    .then(() => console.log(`- Indexed file dependencies (${Date.now() - start} ms)`))
    .then(async () => {
      for (const [name, entrypoint] of entrypoints.entries()) {
        console.log(`\n- Starting build for ${name}`)
        await buildMicroService(name, entrypoint)
      }
    })
}

/**
 * Scans directories recursively to find entrypoints
 * @param {String} directory - directory to scan
 */
async function scanDirectory (directory) {
  const tasks = []
  for await (const dirent of await fs.promises.opendir(directory)) {
    if (dirent.isDirectory()) tasks.push(scanDirectory(path.resolve(directory, dirent.name)))
    else if (dirent.isFile()) {
      const file = path.resolve(directory, dirent.name)
      tasks.push(scanFile(file))
    }
  }
  await Promise.all(tasks)
}

/**
 * Resolve an import
 * @param {String} file - the file in which the import occurs
 * @param {String} imp - what is being imported
 * @param {String} [impName=imp] - the name of what is being imported
 * @throws {Error} when an error occurred
 * @returns {String} path of where an import leads to
 */
function resolveImport (file, imp, impName = imp) {
  try {
    return require.resolve(imp, { paths: [path.resolve(nodeModules)] })
  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') throw new Error(`Import '${impName}' in ${file} could not be found`)
    throw error
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

  // Find environment variables if needed
  if (env) {
    const envVars = getEnvironmentVariables(code)
    const knownEnvVars = environmentVariables.get(file)
    if (knownEnvVars) envVars.forEach(envVar => knownEnvVars.add(envVar))
    else environmentVariables.set(file, new Set(envVars))
  }

  const fileDependencies = getDependencies(code)
  const directory = path.dirname(file)
  // Loop through this file's dependencies and map them in modules/dependencies
  fileDependencies.forEach(depName => {
    const isNodeModule = !depName.match(/^[\\/.]/) && (resolveImport(file, depName) === depName || resolveImport(file, depName).includes('/node_modules/'))
    if (isNodeModule) {
      const isNative = resolveImport(file, depName) === depName
      if (isNative) return
      const depParts = depName.split('/')
      depName = depParts[0]
      if (depName[0] === '@') depName += `/${depParts[1]}`
      const knownModules = modules.get(file)
      if (knownModules) knownModules.add(depName)
      else modules.set(file, new Set([depName]))
    } else {
      const depPath = resolveImport(file, path.resolve(directory, depName), depName)
      const knownImports = dependencies.get(file)
      if (knownImports) knownImports.set(depName, depPath)
      else dependencies.set(file, new Map([[depName, depPath]]))
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
  const { requiredFiles, requiredModules, requiredEnvironmentVariables } = discoverRequirements(entrypoint)
  await Promise.all([
    writeRequiredFiles(js, requiredFiles, entrypoint),
    writePackageJson(name, root, requiredModules),
    writeDotEnv(root, requiredEnvironmentVariables)
  ])
  console.log(`-- Build for ${name} succesful (${Date.now() - start} ms)`)
}

/**
 * Generates & writes a .env file
 * @param {String} root - where to write the .env (should be at the root)
 * @param {Set} environmentVariables - which environment variables to write
 * @returns {Promise} promise that resolves when the file has been written
 */
function writeDotEnv (root, environmentVariables) {
  if (!env) return
  return fs.promises.writeFile(path.resolve(root, '.env'), Array.from(environmentVariables).join('=\n'))
}

/**
 * Generates & writes a package.json file
 * @param {String} name - name of the microservice
 * @param {String} root - where to place the package.json (should be at the root)
 * @param {Set} modules - modules to add to the package.json
 */
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
  const fileLocations = new Map([[entrypoint, mainPath]]) // oldPath => newPath
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
          const imps = dependencies.get(oldPath)
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
 * @param {Set} [requiredModules=new Set()] - modules that are required
 * @param {Set} [requiredEnvironmentVariables=new Set()] - required environment variables
 * @returns {{ requiredFiles: Set, requiredModules: Set, requiredEnvironmentVariables: Set }} sets of discovered things
 */
function discoverRequirements (file, handledFiles = new Set(), requiredFiles = new Set(), requiredModules = new Set(), requiredEnvironmentVariables = new Set()) {
  if (handledFiles.has(file)) return { requiredFiles, requiredModules }
  handledFiles.add(file)

  // Gather file requirements
  const reqs = new Set((dependencies.get(file) || new Map()).values())
  if (reqs) {
    reqs.forEach(req => {
      requiredFiles.add(req)
      // Recursively discover more requirements
      discoverRequirements(req, handledFiles, requiredFiles, requiredModules, requiredEnvironmentVariables)
    })
  }

  // Gather required node modules
  const mods = modules.get(file)
  if (mods) mods.forEach(mod => requiredModules.add(mod))

  // Gather required environment variables
  const envVars = environmentVariables.get(file)
  if (envVars) envVars.forEach(envVar => requiredEnvironmentVariables.add(envVar))

  return { requiredFiles, requiredModules, requiredEnvironmentVariables }
}
