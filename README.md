# ezrpc
Easy to use RPC server/client (+ load balancer)

[![CI](https://github.com/timvandam/ezrpc/workflows/CI/badge.svg?branch=master)](https://github.com/timvandam/ezrpc/actions?query=workflow%3ACI)
[![Inline docs](https://inch-ci.org/github/timvandam/ezrpc.svg?branch=master&style=shields)](https://inch-ci.org/github/timvandam/ezrpc)
[![Coverage Status](https://coveralls.io/repos/github/timvandam/ezrpc/badge.svg?branch=master)](https://coveralls.io/github/timvandam/ezrpc?branch=master)

```javascript
// server.js
const { Server } = require('ezrpc')
const server = new Server(1250) // run rpc server on port 1250

function helloWorld () {
  console.log('Hello World!')
}

// Make helloWorld accessible by the remote client
server.module.exports = {
  helloWorld
}
```
```javascript
// client.js
const { Client } = require('ezrpc')
const { helloWorld } = new Client('localhost', 1250).methods

helloWorld()
  .then(() => console.log('helloWorld() was called on server process'))
```

## Installing
`$ npm install ezrpc`

`$ yarn add ezrpc`

## Why?
- Easily load-balance tasks among multiple processes on multiple machines
- Can be used like a child process, but does not have to be spawned on every function call
- ezrpc servers can be used in almost any language

## Docs
The [wiki](https://github.com/timvandam/ezrpc/wiki) will help you get started with `ezrpc`

Additionally you can generate html documentation of all all method & properties using `jsdoc` using the `doc` script:

`$ npm run doc`

`$ yarn doc`

Documentation will appear in /jsdoc

## Tests
Tests are not included when you download from npm; clone the GitHub repository to run tests.

**npm**
```bash
$ npm install
$ npm test
```
**yarn**
```bash
$ yarn install
$ yarn test
```

## Examples
Some basic explanatory examples can be found [here](./examples). They currently include a simple master-child example where the master (client.js) calls methods on the child process (server.js), and an example where the LoadBalancer class is used to distribute calls among multiple servers.
