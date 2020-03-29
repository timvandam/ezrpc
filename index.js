const Client = require('./lib/Client')
const Server = require('./lib/Server')
const LoadBalancer = require('./lib/LoadBalancer')

const RPC = {
  Client,
  Server,
  LoadBalancer
}

module.exports = RPC
