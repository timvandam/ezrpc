const debug = require('debug')('ezrpc:loadbalancer')

const Server = require('./Server')
const Client = require('./Client')

// Short summary of what is going on here:
// This load balancer is a server, but whenever a called method
// is not found it will be sent to another server using a client
// in this.clients. This client is selected with the selectClient
// method.

/**
 * RPC server that distributes the load among other RPC servers using a round robin approach
 * @extends Server
 * @property {Client[]} clients - array of clients connected to servers being load balanced
 * @property {Number} nextClient - the index of the client in this.clients that will handle the next call
 */
class LoadBalancer extends Server {
  /**
   * Constructs a LoadBalancer instance
   * @param {ServerInfo[]} servers - a list of servers to load balance
   * @param {Number} port - port to run this load balancer at
   * @param {ClientOptions} [opts] - options to provide the created clients
   * @param {ReconnectStrategy} [opts.reconnectStrategy=Client.ReconnectStrategies.Linear(1)] - the reconnect strategy to use
   */
  constructor (servers, port, { reconnectStrategy = Client.ReconnectStrategies.Linear(1) } = {}) {
    if (!Array.isArray(servers)) throw new Error('You must provide an array of servers!')
    if (!servers.length) throw new Error('You must provide at least one server!')
    for (let i = 0; i < servers.length; i++) {
      const { host, port } = servers[i]
      if (!host) throw new Error('You must provide a server host!')
      if (typeof host !== 'string') throw new Error('Server host must be a string!')
      if (!port) throw new Error('You must provide a server port!')
      if (typeof port !== 'number') throw new Error('Server port must be numeric!')
    }
    super(port)
    this.clients = servers.map(({ host, port }) => new Client(host, port, {
      maxReconnectAttempts: -1,
      reconnectStrategy
    }))
    debug('created %d clients to remote servers', this.clients.length)
    this.nextClient = 0
    // It is possible to add methods to this load balancers
    // so first try to find such a method.
    // If such a method does not exist then send the call to another server
    this.methodsHandler.get = (target, property) => {
      const method = target[property]
      debug('calling method %s on load balancer', property)
      if (method) return method
      const client = this.selectClient()
      debug('redirecting method %s to another server', property)
      return async (...args) => client.methods[property](...args)
    }

    debug('loadbalancer instance created')
  }

  /**
   * Selects the next client round-robin wise
   * @returns {Client} the client that should relay the next call
   */
  selectClient () {
    const i = this.nextClient
    debug('selected client %d', i)
    // Increment the nextClient, but loop back after reaching the end of this.clients
    this.nextClient = (this.nextClient + 1) % this.clients.length
    debug('set next client to %d', this.nextClient)
    return this.clients[i]
  }
}

module.exports = LoadBalancer
