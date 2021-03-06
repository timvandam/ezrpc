const { Client } = require('../../')

// Connect to a server and assign the myMethod variable
const { myMethod } = new Client('localhost', 1250).methods

// Handle fatal errors
client.on('error', error => {
  console.log(`Client error - ${error.message}`)
  process.exit(0)
})

// Call myMethod, log whatever happens, then exit
myMethod()
  .then(value => console.log(`myMethod was succesfully called and returned ${value}`))
  .catch(error => console.log(`myMethod threw an error - ${error.message}`))
  .finally(() => process.exit(0))
