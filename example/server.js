const { Server } = require('../index')

const server = new Server(1250)

server.module.exports = {
  logMessage: (msg, time) => {
    console.log(msg, Date.now() - time, 'ms')
  }
}
/* This is equivalent to:
  server.addMethods(function logMessage () { ... })
  server.addMethods({ logMessage: () => { ... } })
  server.methods.logMessage = () => { ... }
*/
