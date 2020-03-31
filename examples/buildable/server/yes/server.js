/* ezrpc-server */
const myMethod = require('./myMethod')
const { Server } = require('ezrpc')
const server = new Server()
server.module.exports = { myMethod }
