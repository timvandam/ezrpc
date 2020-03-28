const { Server } = require('../index')

const server = new Server(1250)

server.module.exports = {
  logMessage: (msg, time) => {
    console.log(msg, Date.now() - time, 'ms')
  }
}
