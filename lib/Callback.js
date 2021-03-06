const errors = require('ezerrors')
const { InvalidArgumentException } = errors

/**
 * Class that represents a callback of an exposed method
 */
class Callback {
  /**
   * Creates a Callback instance
   * @param {any} messageId - a message id
   * @param {any} [returnValue] - the value returned by the called method
   * @param {any} [errorValue] - the value thrown by the called method
   */
  constructor (messageId, returnValue, errorValue) {
    if (errorValue && !(errorValue instanceof Error)) throw new InvalidArgumentException('Error value must be an error!')
    this.messageId = messageId
    this.returnValue = returnValue
    this.errorValue = errorValue
  }

  /**
   * Gets the buffer-form of this callback
   * @returns {Buffer} buffer form of this callback
   */
  getBuffer () {
    const message = Buffer.from(JSON.stringify({
      type: 'callback',
      mid: this.messageId,
      ret: this.returnValue,
      err: this.errorValue ? {
        name: this.errorValue.name,
        message: this.errorValue.message
      } : undefined
    }))
    const length = Buffer.alloc(4)
    length.writeUInt32LE(message.length)
    return Buffer.concat([length, message])
  }

  /**
   * Creates a Callback instance from a buffer
   * @param {Buffer} buffer - buffer to create a Callback instance from
   * @returns {Callback} Callback instance
   */
  static fromBuffer (buffer) {
    const { mid, ret, err, type } = JSON.parse(buffer.toString('utf8'))
    if (type !== 'callback') throw new InvalidArgumentException('Buffer is not a callback')
    if (mid === undefined) throw new InvalidArgumentException('Buffer does not contain a message id')
    if (err) {
      const { name, message } = err
      if (!name) throw new InvalidArgumentException('Error must contain a name!')
      if (message === undefined) throw new InvalidArgumentException('Error must have a message!')
      return new Callback(mid, ret, new errors[name](message))
    }
    return new Callback(mid, ret, err)
  }

  /**
   * Returns what this callback returns in the form of a promise
   * @returns {Promise<any>} promise that resolves/rejects with the returned/thrown value
   */
  getPromise () {
    return this.errorValue
      ? Promise.reject(this.errorValue)
      : Promise.resolve(this.returnValue)
  }
}

module.exports = Callback
