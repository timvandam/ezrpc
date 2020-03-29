const Server = require('./Server')
const Client = require('./Client')

/**
 * RPC server that distributes the load among other RPC servers using a round robin approach
 * @property {Client[]} clients - array of clients connected to servers being load balanced
 */
class LoadBalancer extends Server {
  constructor (servers, port) {
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
    this.clients = servers.map(({ host, port }) => new Client(host, port, { maxReconnectAttempts: -1 }))
  }

  setUp () {
  }
}

module.exports = LoadBalancer
