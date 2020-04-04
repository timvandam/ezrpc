const { CustomError, InvalidArgumentException } = require('ezerrors')

const Callback = require('../Callback')

const messageId = 0
const returnValue = 'returnval'
const callback = new Callback(messageId, returnValue)

describe('constructor works', () => {
  it('when arguments are valid', () => {
    expect(callback).toEqual({
      messageId,
      returnValue,
      errorValue: undefined
    })
  })

  it('when arguments are invalid', () => {
    expect(() => new Callback(0, undefined, 'hello')).toThrow(new InvalidArgumentException('Error value must be an error!'))
  })
})

it('getBuffer works', () => {
  const expected = [
    Buffer.alloc(4),
    Buffer.from(JSON.stringify({
      type: 'callback',
      mid: messageId,
      ret: returnValue,
      err: undefined
    }))
  ]
  expected[0].writeUInt32LE(expected[1].length)
  expect(callback.getBuffer()).toEqual(Buffer.concat(expected))
})

describe('fromBuffer works', () => {
  it('when buffer is not a callback', () => {
    expect(() => Callback.fromBuffer(Buffer.from('{"type":"call"}'))).toThrow(new Error('Buffer is not a callback'))
  })

  it('when buffer has no messageId', () => {
    expect(() => Callback.fromBuffer(Buffer.from('{"type":"callback"}'))).toThrow(new Error('Buffer does not contain a message id'))
  })

  describe('when buffer has an invalid err', () => {
    it('when its name is missing', () => {
      const badCallback = Object.assign(Object.create(Callback.prototype), { messageId: 0, errorValue: {} })
      expect(() => Callback.fromBuffer(badCallback.getBuffer().slice(4))).toThrow(new InvalidArgumentException('Error must contain a name!'))
    })

    it('when its message is missing', () => {
      const badCallback = Object.assign(Object.create(Callback.prototype), { messageId: 0, errorValue: { name: 'Error' } })
      expect(() => Callback.fromBuffer(badCallback.getBuffer().slice(4))).toThrow(new InvalidArgumentException('Error must have a message!'))
    })
  })

  it('when buffer is valid', () => {
    expect(Callback.fromBuffer(callback.getBuffer().slice(4))).toEqual(callback)
  })
})

describe('getPromise works', () => {
  it('when promise resolves', async () => {
    await expect(callback.getPromise()).resolves.toEqual(returnValue)
  })

  it('when promise rejects', async () => {
    const error = new CustomError('Error message!')
    await expect(new Callback(messageId, undefined, error).getPromise()).rejects.toThrow(new CustomError('Error message!'))
  })
})
