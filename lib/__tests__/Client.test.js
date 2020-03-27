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

describe('autoreconnect works', () => {
  beforeAll(() => {
    client.socket = {
      unref: jest.fn(),
      on: jest.fn(),
      once: jest.fn(),
      connect: jest.fn()
    }
    client.setUp()
  })

  it('connect listener works', () => {
    expect(client.socket.unref).toHaveBeenCalledTimes(1)

    client.reconnectAttempts = 10
    const connectListener = client.socket.on.mock.calls[0][1]
    connectListener()

    expect(client.reconnectAttempts).toBe(0)
  })

  it('error listener works', () => {
    const errorListener = client.socket.on.mock.calls[1][1]
    expect(errorListener).not.toThrow()
  })

  describe('close listener works', () => {
    let closeListener
    beforeAll(() => {
      closeListener = client.socket.on.mock.calls[2][1]

      // client.connect should resolve
      client.socket.once.mockImplementation((event, mth) => {
        if (event === 'connect') mth()
      })
    })

    it('when client has been destroyed', async () => {
      client.destroyed = true
      await closeListener()
      expect(client.reconnecting).toBeFalsy()
      client.destroyed = false
    })

    it('when it reconnects', async () => {
      client.socket.connect.mockImplementation(() => Promise.resolve())
      await closeListener()
      expect(client.socket.connect).toHaveBeenCalled()
      expect(client.reconnecting).toBeFalsy()
    })

    it('when it does not reconnect', async () => {
      // client.connect should reject
      client.socket.once.mockImplementation((event, mth) => {
        if (event === 'error') mth()
      })
      client.emit = jest.fn()
      client.reconnectAttempts = 0
      client.maxReconnectAttempts = 2
      await closeListener()
      expect(client.destroyed).toBeFalsy()
      await expect(client.call('hello')).rejects.toThrow(new Error('Not connected to the server. Attempting to reconnect...'))
      await closeListener()
      expect(client.destroyed).toBeTruthy()
      expect(client.emit).toHaveBeenLastCalledWith('error', new Error('Could not reconnect to the server'))
    })

    it('call rejects when client is destroyed', async () => {
      await expect(client.call('hello')).rejects.toThrow(new Error('This instance has been destroyed'))
    })
  })
})
