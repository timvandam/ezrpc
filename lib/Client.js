const net = require('net')

const Call = require('./Call')
const Callback = require('./Callback')

/**
 * RPC client that connects to an RPC server
 * @todo autoconnecting on disconnect
 */
class Client {
  /**
   * Constructs a Client instance
   * @param {String} host - host to connect to
   * @param {Number} port - port of the host to connect to
   */
  constructor (host, port) {
    if (!host || typeof host !== 'string') throw new Error('Provide a host!')
    if (!port || typeof port !== 'number') throw new Error('Provide a numeric port!')
    this.options = {
      host,
      port: parseInt(port)
    }
    this.socket = new net.Socket()
    this.messageId = 0
    this.methods = new Proxy({}, {
      // Returns a method call for the property accessed
      get: (target, property) => {
        return target[property] || this.call.bind(this, property)
      }
    })

    // the client acts like a module as that it provides an object of functions
    // sothere is no need to keep the process alive if only this client instance exists
    this.socket.unref()
    this.connect()
  }

  /**
   * Connects to the given host
   * @returns {Promise} promise that resolves when the connection has been established
   */
  connect () {
    return new Promise((resolve, reject) => {
      this.socket.connect(this.options, resolve)
    })
  }

  /**
   * Attempts to call an external method
   * @param {String} methodName - name of the method to call
   * @param {...any} args - arguments to pass to the method call
   * @returns {Promise} promise that resolves with what the method call returned/threw
   */
  call (methodName, ...args) {
    const messageId = this.messageId++
    const outMsg = new Call(messageId, methodName, args).getBuffer()
    return new Promise(resolve => {
      const handleMsg = data => {
        try {
          const callback = Callback.fromBuffer(data)
          if (callback.messageId !== messageId) return
          this.socket.removeListener('data', handleMsg)
          // Roll back messageId as it can be re-used
          if (messageId < this.messageId) this.messageId = messageId
          resolve(callback.getPromise())
        } catch (error) {
          // The message sent by the server was not a callback; ignore it
        }
      }
      this.socket.on('data', handleMsg)
      this.socket.write(outMsg)
    })
  }
}

module.exports = Client
