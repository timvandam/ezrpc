/**
 * Class that represents a call to an exposed method
 */
class Call {
  /**
   * Constructs a Call instance
   * @param {any} messageId - a message id
   * @param {String} methodName - the name of the method to call
   * @param {any[]} args - the arguments to pass to the method call
   */
  constructor (messageId, methodName, args) {
    this.messageId = messageId
    this.methodName = methodName
    this.args = args
  }

  /**
   * Get the buffer-form of this call
   * @returns {Buffer} buffer form of this call
   */
  getBuffer () {
    const message = Buffer.from(JSON.stringify({
      type: 'call',
      mid: this.messageId,
      name: this.methodName,
      args: this.args
    }), 'utf8')
    const length = Buffer.alloc(2)
    length.writeUInt16LE(message.length)
    return Buffer.concat([length, message])
  }

  /**
   * Creates a Call instance from a buffer
   * @param {Buffer} buffer - buffer to create a Call instance from
   * @returns {Call} Call instance
   */
  static fromBuffer (buffer) {
    const { mid, name, args, type } = JSON.parse(buffer.toString('utf8'))
    if (type !== 'call') throw new Error('Buffer is not a call')
    if (mid === undefined) throw new Error('Buffer does not contain a message id')
    if (name === undefined) throw new Error('Buffer does not contain a method name')
    if (args === undefined) throw new Error('Buffer does not contain arguments')
    return new Call(mid, name, args)
  }
}

module.exports = Call
