/* ezrpc-server */
const myMethod = require('../bbb')
const { Server } = require('ezrpc')
const server = new Server()
server.module.exports = { myMethod }
