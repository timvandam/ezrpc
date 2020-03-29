const { Server } = require('../..')

// Create a server running on port 1250
const server = new Server(1250)

// Create a function
function logMessage (msg, time) {
  console.log(msg, Date.now() - time, 'ms')
}

// Add that function to the functions that clients connected to the server can call
// Whatever this function returns is returned to the client as well
// Throwing errors in the function will be caught and relayed to the client ass well
server.module.exports = {
  logMessage
}
