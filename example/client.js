const { Client } = require('../index')

const client = new Client('localhost', 1250)
const { logMessage } = client.methods

process.stdin.setEncoding('utf8')
process.stdin.on('readable', () => {
  let chunk
  // Use a loop to make sure we read all available data.
  while ((chunk = process.stdin.read()) !== null) {
    logMessage(chunk.trim(), Date.now())
      .catch(error => console.log(`Could not send message - ${error}`))
    process.exit(0)
  }
})
