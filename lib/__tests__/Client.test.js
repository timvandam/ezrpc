const EventEmitter = require('events')

const Client = require('../Client')
const Call = require('../Call')
const Callback = require('../Callback')
const MessageReader = require('../MessageReader')

jest.mock('net')

const client = new Client('localhost', 1234)
Object.assign(client.socket, EventEmitter.prototype)
client.setUp()

describe('constructor works', () => {
  it('when providing invalid arguments', () => {
    expect(() => new Client()).toThrow(new Error('Provide a host!'))
    expect(() => new Client(123)).toThrow(new Error('Provide a host!'))
    expect(() => new Client('localhost')).toThrow(new Error('Provide a numeric port!'))
    expect(() => new Client('localhost', 'str')).toThrow(new Error('Provide a numeric port!'))
    expect(() => new Client('localhost', 123, { maxReconnectAttempts: '1' })).toThrow(new Error('Provide a numeric maxReconnectAttempts!'))
    expect(() => new Client('localhost', 123, { reconnectDelay: '1' })).toThrow(new Error('Provide a numeric reconnectDelay!'))
    expect(() => new Client('localhost', 123, { reconnectStrategy: '1' })).toThrow(new Error('ReconnectStrategy must be a function!'))
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
  it('when the client is destroyed', async () => {
    client.destroyed = true
    await expect(client.call('hello')).rejects.toThrow(new Error('This instance has been destroyed'))
    client.destroyed = false
  })

  it('when the client is reconnecting', async () => {
    client.reconnecting = true
    await expect(client.call('hello')).rejects.toThrow(new Error('Not connected to the server. Attempting to reconnect...'))
    client.reconnecting = false
  })

  describe('when the client is connected', () => {
    it('when returning a value', async () => {
      const messageId = 123
      client.socket.write.mockImplementationOnce(data => {
        const response = new Callback(messageId, 'Goodbye!').getBuffer()
        // Set the messageId to -123 to check if messageId is properly set after call
        client.messageId = -123
        client.socket.emit('data', response)
      })
      client.messageId = messageId
      await expect(client.call('Hello!')).resolves.toEqual('Goodbye!')
      expect(client.messageId).toBe(-123)
    })

    it('when returning an error', async () => {
      const messageId = 321
      client.socket.write.mockImplementationOnce(data => {
        // Send a response with a different messageId to make sure it ignores it
        const fakeResponse = new Callback(messageId + 1, 'Goodbye!').getBuffer()
        // Send some invalid data to check if it ignores that too
        const weirdResponse = Buffer.from('BEEF', 'hex') // the client is vegetarian, no beef allowed!
        const response = new Callback(messageId, undefined, 'That\'s not right!').getBuffer()
        client.socket.emit('data', fakeResponse)
        client.socket.emit('data', weirdResponse)
        client.socket.emit('data', response)
      })
      client.messageId = messageId
      await expect(client.call('Hello!')).rejects.toThrow('That\'s not right!')
    })
  })
})

describe('autoreconnect works', () => {
})

describe('reconnect strategies work', () => {
  it('static works', () => {
    expect(Client.ReconnectStrategies.Static(5, 1000)).toBe(1000)
  })

  describe('exponential works', () => {
    it('when providing invalid arguments', () => {
      expect(() => Client.ReconnectStrategies.Exponential('hello')).toThrow('Base must be numeric!')
    })

    it('when providing valid arguments', () => {
      expect(Client.ReconnectStrategies.Exponential(4)(3, 2000)).toBe(2000 * 4 ** 3)
      expect(Client.ReconnectStrategies.Exponential()(3, 2000)).toBe(2000 * 2 ** 3)
    })
  })

  describe('linear works', () => {
    it('when providing invalid arguments', () => {
      expect(() => Client.ReconnectStrategies.Linear('16')).toThrow('Slope must be numeric!')
    })

    it('when providing valid arguments', () => {
      expect(Client.ReconnectStrategies.Linear(6)(7, 800)).toBe(800 * 7 * 6)
      expect(Client.ReconnectStrategies.Linear()(7, 800)).toBe(800 * 7)
    })
  })
})
