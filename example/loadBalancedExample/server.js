const { Server } = require('../../')

const server = new Server(1251)

function logMessage (msg, time) {
  console.log(msg, Date.now() - time, 'ms')
}

server.module.exports = {
  logMessage
}
