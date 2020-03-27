const Client = require('../Client')
const Call = require('../Call')
const Callback = require('../Callback')
const EventEmitter = require('events')

jest.mock('net')

const client = new Client('localhost', 1234)

describe('constructor works', () => {
  it('when providing invalid arguments', () => {
    expect(() => new Client()).toThrow(new Error('Provide a host!'))
    expect(() => new Client(123)).toThrow(new Error('Provide a host!'))
    expect(() => new Client('localhost')).toThrow(new Error('Provide a numeric port!'))
    expect(() => new Client('localhost', 'str')).toThrow(new Error('Provide a numeric port!'))
  })

  it('when providing valid arguments', () => {
    expect(client.options).toEqual({ host: 'localhost', port: 1234 })
    expect(client.socket.connect).toHaveBeenCalledTimes(1)
  })
})

it('connect works', () => {
  expect(client.socket.connect).toHaveBeenLastCalledWith({ host: 'localhost', port: 1234 })
})

it('methods proxy works', () => {
  jest.spyOn(client, 'call')
  client.methods.hello()
  expect(client.call).toHaveBeenLastCalledWith('hello')
})

describe('call works', () => {
  it('when returning a value', async () => {
    // eventemitter stuff was mocked -> re-create them
    client.socket = new EventEmitter()
    // Instantly fire a positive callback when socket.write is called
    client.socket.write = buffer => {
      client.messageId = 0
      const { messageId } = Call.fromBuffer(buffer)
      client.socket.emit('data', new Callback(messageId + 1, 'bye!').getBuffer())
      client.socket.emit('data', new Callback(messageId, 'hello!').getBuffer())
    }
    client.messageId = 10
    await expect(client.call('methodName', 'firstArg')).resolves.toEqual('hello!')
  })

  it('resets messageId properly', () => {
    expect(client.messageId).toBe(0)
  })

  it('when throwing an error', async () => {
    client.socket.write = buffer => {
      const { messageId } = Call.fromBuffer(buffer)
      client.socket.emit('data', new Callback(messageId, undefined, 'an error!').getBuffer())
    }
    await expect(client.call('methodName', 'firstArg')).rejects.toThrow(new Error('an error!'))
  })
})
