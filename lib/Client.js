const net = require('net')
const EventEmitter = require('events')

const Call = require('./Call')
const Callback = require('./Callback')

function sleep (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * A function that computes what delay should be used before attempting to reconnect
 * @typedef {Function} ReconnectStrategy
 * @property {Number} attempts - the amount of previous failed attempts
 * @property {Number} reconnectDelay - the configured reconnectDelay
 * @returns {Number} the delay before attempting to reconnect
 */

/**
 * @typedef {Object} ClientOptions
 * @property {Number} [maxReconnectAttempts=5] - the amount of times to attempt to reconnect to the server on disconnect
 * @property {Number} [reconnectDelay=1000] - how many ms to wait before the first reconnect attempt (doubles every attempt)
 * @property {ReconnectStrategy} [reconnectStrategy=Client.ReconnectStrategies.Exponential(2)] - function that computes the time between reconnects
 */

/**
 * RPC client that connects to an RPC server
 * @extends EventEmitter
 * @property {{ host: string, port: Number }} options - options to provide to socket.connect
 * @property {net.Socket} socket - socket used to connect with ezrpc server
 * @property {Number} messageId - used to match callbacks with calls
 * @property {Proxy} methods - proxy used to get methods
 * @property {Number} maxReconnectAttempts - the amount of times to attempt to reconnect on disconnect
 * @property {Number} reconnectDelay - the delay between reconnects (doubles every reconnect fail)
 * @property {Number} reconnectAttempts - the current amount of reconnect attempts
 * @property {ReconnectStrategy} reconnectStrategy - the currently used reconnect strategy
 * @property {Boolean} reconnecting - whether socket it currently attempting to reconnect
 * @property {Boolean} destroyed - true if reconnecting failed
 * @emits error when reconnecting failed
 */
class Client extends EventEmitter {
  /**
   * Constructs a Client instance
   * @param {String} host - host to connect to
   * @param {Number} port - port of the host to connect to
   * @param {ClientOptions} [opts] - options
   */
  constructor (host, port, {
    maxReconnectAttempts = 5,
    reconnectDelay = 1000,
    reconnectStrategy = Client.ReconnectStrategies.Exponential(2)
  } = {}) {
    if (!host || typeof host !== 'string') throw new Error('Provide a host!')
    if (!port || typeof port !== 'number') throw new Error('Provide a numeric port!')
    if (typeof maxReconnectAttempts !== 'number') throw new Error('Provide a numeric maxReconnectAttempts!')
    if (typeof reconnectDelay !== 'number') throw new Error('Provide a numeric reconnectDelay!')
    if (typeof reconnectStrategy !== 'function') throw new Error('ReconnectStrategy must be a function!')
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
    this.reconnectStrategy = reconnectStrategy
    this.reconnectAttempts = 0
    this.reconnecting = false
    this.destroyed = false // this indicates whether reconnectAttempts has exceeded maxReconnectAttempts

    this.setUp()
    this.connect()
  }

  /**
   * Set up socket & listeners
   */
  setUp () {
    this.socket.on('connect', () => {
      // On connect we should reset reconnect parameters
      this.reconnectAttempts = 0
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
      await sleep(this.reconnectStrategy())
      this.reconnectAttempts++
      try {
        await this.connect()
        this.reconnecting = false // we were succesful!
      } catch (e) {
        if (this.maxReconnectAttempts === -1 || this.reconnectAttempts < this.maxReconnectAttempts) return
        // Could not reconnect within the set amount of attempts; destroy
        this.destroyed = true
        this.reconnecting = false
        this.emit('error', new Error('Could not reconnect to the server'))
      }
    })
  }

  /**
   * Connects to the given host
   * @returns {Promise} promise that resolves when the connection has been established
   */
  connect () {
    return new Promise((resolve, reject) => {
      this.socket.once('connect', resolve)

      // Should only reject when reconnecting
      // Otherwise the constructor can cause an unhandled promise reject exception
      // This solution is fine because it will still simply try to reconnect
      this.socket.once('error', this.reconnecting ? reject : resolve)

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
    if (this.destroyed) return Promise.reject(new Error('This instance has been destroyed'))
    if (this.reconnecting) return Promise.reject(new Error('Not connected to the server. Attempting to reconnect...'))
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

/**
 * A function that generates a ReconnectStrategy
 * @typedef {Function} ReconnectStrategyGenerator
 * @returns {ReconnectStrategy} generated strategy
 */

/**
 * Object containing possible reconnect strategies
 * @hideconstructor
 * @returns {Object.<String, ReconnectStrategyGenerator|ReconnectStrategy>} object containing strategies and functions that generate them
 */
Client.ReconnectStrategies = class {
  /**
   * Strategy that exponentially increases the reconnectDelay as the amount of failed attempts increases
   * @type {ReconnectStrategyGenerator}
   * @param {Numbers} [base=2] - the base of the exponential growth
   * @returns {ReconnectStrategy} exponential strategy for the given base
   */
  static Exponential (base = 2) {
    if (typeof base !== 'number') throw new Error('Base must be numeric!')
    return (attempts, reconnectDelay) => reconnectDelay * (base ** attempts)
  }

  /**
   * Strategy that linearly increases the reconnectDelay as the amount of failed attempts increases
   * @type {ReconnectStrategyGenerator}
   * @param {Number} slope - the slope of the linear growth
   * @returns {ReconnectStrategy} linear strategy for the given slope
   */
  static Linear (slope = 1) {
    if (typeof slope !== 'number') throw new Error('Base must be numeric!')
    return (attempts, reconnectDelay) => reconnectDelay * slope * attempts
  }

  /**
   * Strategy that keeps the reconnectDelay static
   * @type {ReconnectStrategy}
   */
  static get Static () {
    return (attempts, reconnectDelay) => reconnectDelay
  }
}

module.exports = Client
