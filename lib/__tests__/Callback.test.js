const Callback = require('../Callback')

const messageId = 0
const returnValue = 'returnval'
const callback = new Callback(messageId, returnValue)

it('constructor works', () => {
  expect(callback).toEqual({
    messageId,
    returnValue,
    errorValue: undefined
  })
})

it('getBuffer works', () => {
  expect(callback.getBuffer()).toEqual(Buffer.from(JSON.stringify({
    type: 'callback',
    mid: messageId,
    ret: returnValue,
    err: undefined
  })))
})

describe('fromBuffer works', () => {
  it('when buffer is not a callback', () => {
    expect(() => Callback.fromBuffer(Buffer.from('{"type":"call"}'))).toThrow(new Error('Buffer is not a callback'))
  })

  it('when buffer has no messageId', () => {
    expect(() => Callback.fromBuffer(Buffer.from('{"type":"callback"}'))).toThrow(new Error('Buffer does not contain a message id'))
  })

  it('when buffer is valid', () => {
    expect(Callback.fromBuffer(callback.getBuffer())).toEqual(callback)
  })
})

describe('getPromise works', () => {
  it('when promise resolves', async () => {
    await expect(callback.getPromise()).resolves.toEqual(returnValue)
  })

  it('when promise rejects', async () => {
    const error = 'Error message!'
    await expect(new Callback(messageId, undefined, error).getPromise()).rejects.toThrow(new Error(error))
  })
})
