#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const parser = require('@babel/parser')

const { Command } = require('commander')
const build = new Command()

build
  .command('build')
  .description('build your application as individual microservices')
  .option('-s, --source [source]', 'the source folder of your application', 'src')
  .option('-d, --destination [destination]', 'where to build to', 'build')
  .action(({ source, destination }) => startBuild(source, destination))

build.parse(process.argv)

async function startBuild (source, destination) {
  await scanDirectory(source) // map all dependencies in fileDependencies
}

async function scanDirectory (directory) {
  for await (const dirent of await fs.promises.opendir(directory)) {
    if (dirent.isDirectory()) await scanDirectory(path.resolve(directory, dirent.name))
    else if (dirent.isFile()) await scanFile(path.resolve(directory, dirent.name))
  }
}

async function scanFile (file) {
  // check if the file creates a new Server, new LoadBalancer, or new Client
  console.log(file)
  const code = await fs.promises.readFile(file, { encoding: 'utf8' })
  const node = parser.parse(code)
}
