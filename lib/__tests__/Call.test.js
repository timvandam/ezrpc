const Call = require('../Call')

const messageId = Math.random()
const methodName = 'methodX'
const args = Array(10).fill().map(() => Math.random())
const call = new Call(messageId, methodName, args)

it('constructor works', () => {
  expect(call).toEqual({ messageId, methodName, args })
})

it('getBuffer works', () => {
  const expected = [
    Buffer.alloc(2),
    Buffer.from(JSON.stringify({
      type: 'call',
      mid: messageId,
      name: methodName,
      args
    }))
  ]
  expected[0].writeUInt16LE(expected[1].length)
  expect(call.getBuffer()).toEqual(Buffer.concat(expected))
})

describe('fromBuffer works', () => {
  it('when buffer is not a call', () => {
    expect(() => Call.fromBuffer(Buffer.from('{"type":"callback"}'))).toThrow(new Error('Buffer is not a call'))
  })

  it('when buffer has no messageId', () => {
    expect(() => Call.fromBuffer(Buffer.from('{"type":"call"}'))).toThrow(new Error('Buffer does not contain a message id'))
  })

  it('when buffer has no method name', () => {
    expect(() => Call.fromBuffer(Buffer.from('{"type":"call","mid":1}'))).toThrow(new Error('Buffer does not contain a method name'))
  })

  it('when buffer has no args', () => {
    expect(() => Call.fromBuffer(Buffer.from('{"type":"call","mid":1,"name":"mthd"}'))).toThrow(new Error('Buffer does not contain arguments'))
  })

  it('when buffer is valid', () => {
    expect(Call.fromBuffer(call.getBuffer().slice(2))).toEqual(call)
  })
})
