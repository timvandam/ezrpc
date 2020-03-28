const { Server } = require('../index')

const server = new Server(1250)

function logMessage (msg, time) {
  console.log(msg, Date.now() - time, 'ms')
}

server.module.exports = {
  logMessage
}
