# ezrpc
Easy to use RPC server/client

[![CI](https://github.com/timvandam/ezrpc/workflows/CI/badge.svg?branch=master)](https://github.com/timvandam/ezrpc/actions?query=workflow%3ACI)
[![Inline docs](https://inch-ci.org/github/timvandam/ezrpc.svg?branch=master&style=shields)](https://inch-ci.org/github/timvandam/ezrpc)
[![Coverage Status](https://coveralls.io/repos/github/timvandam/ezrpc/badge.svg?branch=master)](https://coveralls.io/github/timvandam/ezrpc?branch=master)

```javascript
// server.js
const { Server } = require('./')
const server = new Server(1250) // run rpc server on port 1250

function helloWorld () {
  console.log('Hello World!')
}

server.addMethods(helloWorld)


// client.js
const { Client } = require('./')
const { helloWorld } = new Client('localhost', 1250).methods

helloWorld()
  .then(() => console.log('helloWorld() called on server process'))
```

## Installing
`$ npm install ezrpc`

`$ yarn add ezrpc`

## Why?
- Easily divide your load among multiple processes on multiple machines
- Can be used like a child process, but does not have to be spawned on every function call
- ezrpc servers can be used in almost any language

## Docs
All code has been commented with JSDoc. To generate html documentation you can run the `doc` script:

`$ npm run doc`

`$ yarn doc`

Documentation will appear in /jsdoc

## Tests
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
An easy example can be found [here](./example). This example allows the client process to send text to the server process, which logs this text and the latency.
