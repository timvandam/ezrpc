const net = require('net')
const EventEmitter = require('events')

const Call = require('./Call')
const Callback = require('./Callback')

/**
 * RPC client that connects to an RPC server
 */
class Client extends EventEmitter {
  /**
   * Constructs a Client instance
   * @param {String} host - host to connect to
   * @param {Number} port - port of the host to connect to
   * @param {Number} [maxReconnectAttempts=5] - the amount of times to attempt to reconnect to the server on disconnect
   * @param {Number} [reconnectDelay=1000] - how many ms to wait before the first reconnect attempt (doubles every attempt)
   */
  constructor (host, port, maxReconnectAttempts = 5, reconnectDelay = 1000) {
    if (!host || typeof host !== 'string') throw new Error('Provide a host!')
    if (!port || typeof port !== 'number') throw new Error('Provide a numeric port!')
    super()
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
    this.maxReconnectAttempts = maxReconnectAttempts
    this.reconnectDelay = reconnectDelay

    this.reconnectAttempts = 0
    this.reconnecting = false
    this.destroyed = false // this indicates whether reconnectAttempts has exceeded maxReconnectAttempts

    this.setUp()

    // This error is handled by the 'close' event, so ignore it here
    this.connect().catch(() => {})
  }

  /**
   * Set up socket & listeners
   */
  setUp () {
    // the client acts like a module as that it provides an object of functions
    // sothere is no need to keep the process alive if only this client instance exists
    this.socket.unref()

    this.socket.on('connect', () => {
      // On connect we should reset reconnect parameters
      this.reconnectAttempts = 0
      this.reconnectDelay = 1000
    })

    this.socket.on('error', () => {
      // Errors don't have to be handled explicitly
      // To prevent them from being thrown we need this listener
    })

    this.socket.on('close', async () => {
      // If previous reconnect attempts did not work we won't try again
      if (this.destroyed) return
      // The socket has died, lets revive it!
      this.reconnecting = true
      setTimeout(async () => {
        this.reconnectAttempts++
        this.reconnectDelay *= 2
        try {
          await this.connect()
          this.reconnecting = false // we were succesful!
        } catch (e) {
          if (this.reconnectAttempts < this.maxReconnectAttempts) return
          // Could not reconnect within the set amount of attempts; destroy
          this.destroyed = true
          this.emit('error', new Error('Could not reconnect to the server'))
        }
      }, this.reconnectDelay * 2 ** (this.reconnectAttempts))
    })
  }

  /**
   * Connects to the given host
   * @returns {Promise} promise that resolves when the connection has been established
   */
  connect () {
    return new Promise((resolve, reject) => {
      this.socket.once('connect', resolve)
      this.socket.once('error', reject)
      this.socket.connect(this.options)
    })
  }

  /**
   * Attempts to call an external method
   * @param {String} methodName - name of the method to call
   * @param {...any} args - arguments to pass to the method call
   * @returns {Promise} promise that resolves with what the method call returned/threw
   */
  call (methodName, ...args) {
    if (this.reconnecting) return Promise.reject(new Error('Not connected to the server'))
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
