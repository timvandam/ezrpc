const EventEmitter = require('events')

const Client = require('../Client')
const Callback = require('../Callback')

jest.mock('net')

const client = new Client('localhost', 1234, { reconnectDelay: 0 })
jest.spyOn(client.reader, 'feed')
jest.spyOn(client, 'call')
jest.spyOn(client, 'connect')

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

describe('connect works', () => {
  it('when succesfully connecting', async () => {
    const promise = client.connect()
    client.socket.emit('connect')
    await expect(promise).resolves.not.toThrow()
  })

  describe('when not connecting', () => {
    it('when reconnecting', async () => {
      client.reconnecting = true
      const promise = client.connect()
      client.socket.emit('error', new Error('error!'))
      await expect(promise).rejects.toThrow(new Error('error!'))
      client.reconnecting = false
    })

    it('when not reconnecting', async () => {
      const promise = client.connect()
      client.socket.emit('error', new Error('error!'))
      await expect(promise).resolves.not.toThrow()
    })
  })
})

it('methods proxy works', () => {
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
        const weirdResponse = Buffer.alloc(4)
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

describe('setUp works', () => {
  it('connect works', () => {
    const [connect] = client.socket.listeners('connect')
    client.reconnectAttempts = 10
    connect()
    expect(client.reconnectAttempts).toBe(0)
  })

  it('data works', () => {
    const [data] = client.socket.listeners('data')
    data(Buffer.alloc(4))
    expect(client.reader.feed).toHaveBeenLastCalledWith(Buffer.alloc(4))
  })

  it('error works', () => {
    const [error] = client.socket.listeners('error')
    expect(error).not.toThrow()
  })

  describe('close works', () => {
    const [close] = client.socket.listeners('close')
    it('when destroyed', async () => {
      client.destroyed = true
      await close()
      client.connect.mockClear()
      expect(client.connect).not.toHaveBeenCalled()
      client.destroyed = false
    })

    it('when reconnecting works', async () => {
      client.connect.mockResolvedValue()
      const promise = close()
      expect(client.reconnecting).toBe(true)
      await promise
      expect(client.reconnecting).toBe(false)
    })

    describe('when reconnecting fails', () => {
      let error
      beforeEach(() => {
        client.connect.mockRejectedValue(new Error('no!'))
        client.destroyed = false
        error = jest.fn()
        client.once('error', error)
      })

      it('when maxReconnectAttempts has not been exceeded', async () => {
        client.maxReconnectAttempts = Infinity
        await close()
        expect(client.destroyed).toBe(false)
        expect(error).not.toHaveBeenCalled()
      })

      it('when maxReconnectAttempts has been exceeded', async () => {
        client.maxReconnectAttempts = -2
        await close()
        expect(client.destroyed).toBe(true)
        expect(error).toHaveBeenCalled()
      })

      it('when maxReconnectAttempts is -1 (infinitely retry)', async () => {
        client.maxReconnectAttempts = -1
        await close()
        expect(client.destroyed).toBe(false)
        expect(error).not.toHaveBeenCalled()
      })
    })
  })
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
