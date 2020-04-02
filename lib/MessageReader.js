const EventEmitter = require('events')

/**
 * Class that composes full messages from receives socket data
 * @property {Number} bytesLeft - the amount of bytes still needed to complete the current message
 * @property {Buffer} data - data that is currently being used to form a complete message
 * @emits message when a full message was composed
 */
class MessageReader extends EventEmitter {
  /**
   * Constructs a message reader
   */
  constructor () {
    super()
    this.bytesLeft = 0
    this.data = Buffer.alloc(0)
  }

  /**
   * Feeds data to the messagereader
   * @param {Buffer} data - data to feed
   */
  feed (data) {
    if (!this.bytesLeft) {
      // If we have received a new message set bytesLeft and remove the length from the data buffer
      this.bytesLeft = data.readUInt16LE() // message length in bytes
      data = data.slice(2) // remove length from message
    }

    const dataWanted = data.slice(0, this.bytesLeft)
    const remainder = data.slice(this.bytesLeft)
    this.data = Buffer.concat([this.data, dataWanted])
    this.bytesLeft -= dataWanted.length
    if (!this.bytesLeft) this.sendMessage()
    if (remainder.length) this.feed(remainder)
  }

  /**
   * Sends the stored message out
   */
  sendMessage () {
    this.emit('message', this.data)
    this.data = Buffer.alloc(0)
    this.bytesLeft = 0
  }
}

module.exports = MessageReader
