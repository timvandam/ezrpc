const net = require('net')
const debug = require('debug')('ezrpc:server')
const { InvalidArgumentException } = require('ezerrors')

const Call = require('./Call')
const Callback = require('./Callback')
const MessageReader = require('./MessageReader')

/**
 * RPC server that allows clients to execute exposed methods
 * @property {Number} port - port to listen on
 * @property {ProxyHandler} methodsHandler - proxyhandler for methods
 * @property {Proxy} methods - proxy used to get/set methods
 * @property {Proxy} module - used to emulate module.exports
 * @property {Proxy} module.exports - emulates addMethods when this is set to an object
 * @property {net.Server} server - tcp server
 */
class Server {
  /**
   * Constructs a Server instance
   * @param {Number} port - port to allow connections on
   */
  constructor (port) {
    if (!port || typeof port !== 'number') throw new InvalidArgumentException('Provide a valid port!')
    this.port = parseInt(port)
    // This is not created in the methods proxy as it is slightly modified in the LoadBalancer class
    this.methodsHandler = {
      set: (target, property, value) => {
        if (typeof value !== 'function') throw new InvalidArgumentException('Provide a function!')
        // Make method a promise (easier to handle)
        target[property] = async (...args) => value(...args)
        return true
      },
      // Un-exposes/removes a method
      deleteProperty: (target, property) => {
        delete target[property]
        return true
      }
    }
    this.methods = new Proxy({}, this.methodsHandler)
    this.module = new Proxy({ exports: this.methods }, {
      set: (target, property, value) => {
        if (property !== 'exports') throw new InvalidArgumentException('Only module.exports can be set')
        if (typeof value !== 'object') throw new InvalidArgumentException('Provide an object!')
        const currentMethods = Object.keys(this.methods)
        if (currentMethods.length) this.removeMethods(...currentMethods)
        this.addMethods(value)
        return true
      }
    })
    this.server = new net.Server()

    this.setUp()
    /* istanbul ignore next */
    this.listen().then(() => debug('listening on %d', this.port))

    debug('server instance created')
  }

  /**
   * Sets up listeners
   */
  setUp () {
    // Listen to incoming function calls
    this.server.on('connection', socket => {
      socket.on('error', error => {
        debug('socket emitted error %o', error)
        // At this point this socket will have been destroyed
        // So there is nothing we need to do here
      })

      const reader = new MessageReader()

      socket.on('data', data => reader.feed(data))

      reader.on('message', async data => {
        try {
          const { methodName, messageId, args } = Call.fromBuffer(data)
          const method = this.methods[methodName]
          if (!method) {
            debug('received call for unknown method %s', methodName)
            socket.write(new Callback(messageId, null, 'No such method!').getBuffer())
            return
          }
          debug('calling %s', methodName)
          method(...args)
            .then(response => socket.write(new Callback(messageId, response, null).getBuffer()))
            .catch(error => socket.write(new Callback(messageId, null, error.message).getBuffer()))
        } catch (error) {
          debug('received invalid data')
          // The message sent was not a call
          // This should never happen (the client currently only sends calls)
        }
      })
    })
  }

  /**
   * Starts listening
   * @returns {Promise} promise that resolves when the server starts listening
   */
  listen () {
    return new Promise(resolve => this.server.listen(this.port, resolve))
  }

  /* eslint-disable */
  /**
   * Exposes methods to the client
   * @param {Object<string, Function>} methodObj - object of methods
   *//**
   * Exposes methods to the client
   * @param  {...Function} methods - named methods
   */
  addMethods (methodObj, ...methods) {
    /* eslint-enable */
    if (typeof methodObj === 'function') {
      // Add methods by name (& make sure only methods were provided)
      methods = [methodObj].concat(methods)
      if (methods.some(method => typeof method !== 'function' || !method.name)) throw new InvalidArgumentException('Provide only named functions!')
      methods.forEach(method => {
        const { name } = method
        debug('method %s added', name)
        this.methods[name] = method
      })
    } else if (typeof methodObj === 'object') {
      if (Object.values(methodObj).some(method => typeof method !== 'function')) throw new InvalidArgumentException('Provide only functions!')
      Object.entries(methodObj).forEach(([key, value]) => {
        debug('method %s added', key)
        this.methods[key] = value
      })
    } else throw new InvalidArgumentException('Provide an object mapping strings to functions!')
  }

  /**
   * Un-exposes methods
   * @param  {...Function|String} methods - named methods
   */
  removeMethods (...methods) {
    if (!methods.length) throw new InvalidArgumentException('Provide an array of named functions/function names!')
    if (methods.some(method => typeof method === 'function' && !method.name)) throw new InvalidArgumentException('Functions must be named!')
    methods.forEach(method => {
      const { name = method } = method
      debug('method %s removed', name)
      delete this.methods[name]
    })
  }
}

module.exports = Server
