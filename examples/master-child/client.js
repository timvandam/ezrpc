const { Client } = require('../..')

// Create a client that connects to a server at localhost:1250
const client = new Client('localhost', 1250)

// Define logMessage as a function to be called on the remote server
// All remote methods return a promise, resolving with the return value or rejecting with the thrown error
const { logMessage } = client.methods

// Handle fatal errors
// 'error' is emitted when the client could not reconnect
// after the configured amount of reconnect attempts (default = 5)
client.on('error', error => {
  console.log(`Client error - ${error.message}`)
  process.exit(0)
})

// This takes input from the terminal and sends it whenever you press enter
process.stdin.setEncoding('utf8')
process.stdin.on('readable', () => {
  let chunk
  while ((chunk = process.stdin.read()) !== null) {
    // Call logMessage on the server.
    // If it fails log the error
    logMessage(chunk.trim(), Date.now())
      .catch(error => console.log(`Could not send message - ${error}`))
  }
})
