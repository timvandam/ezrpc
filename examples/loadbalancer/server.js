const { Server } = require('../../')

// Lets run a server at port 1251
// Note that the client is not connecting to this server, but to a server at port 1250
const server = new Server(1251)

// Export myMethod
server.module.exports = {
  myMethod () {
    return 'Hello from a server!'
  }
}
