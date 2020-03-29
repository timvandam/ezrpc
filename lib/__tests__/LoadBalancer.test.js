const LoadBalancer = require('../LoadBalancer')
const Client = require('../Client')

jest.mock('net')

const loadBalancer = new LoadBalancer([{
  host: 'localhost',
  port: 1251
}, {
  host: 'localhost',
  port: 1252
}], 1250)

describe('constructor works', () => {
  it('when providing invalid arguments', () => {
    expect(() => new LoadBalancer()).toThrow(new Error('You must provide an array of servers!'))
    expect(() => new LoadBalancer([])).toThrow(new Error('You must provide at least one server!'))
    expect(() => new LoadBalancer([{ }])).toThrow(new Error('You must provide a server host!'))
    expect(() => new LoadBalancer([{ host: 123 }])).toThrow(new Error('Server host must be a string!'))
    expect(() => new LoadBalancer([{ host: '123' }])).toThrow(new Error('You must provide a server port!'))
    expect(() => new LoadBalancer([{ host: '123', port: '1251' }])).toThrow(new Error('Server port must be numeric!'))
    expect(() => new LoadBalancer([{ host: '123', port: 1251 }], '1250')).toThrow(new Error('Provide a valid port!'))
  })

  it('when providing valid arguments', () => {
    expect(() => new LoadBalancer([{ host: 'localhost', port: 1251 }], 1250)).not.toThrow()
    expect(loadBalancer.clients).toEqual(expect.arrayContaining([expect.any(Client)]))
    expect(loadBalancer.nextClient).toBe(0)
  })
})

describe('selectClient works', () => {
  it('returns the right client', () => {
    expect(loadBalancer.selectClient()).toEqual(loadBalancer.clients[0])
    expect(loadBalancer.selectClient()).toEqual(loadBalancer.clients[1])
  })

  it('sets nextClient to the right value', () => {
    expect(loadBalancer.nextClient).toBe(0)
    loadBalancer.selectClient()
    expect(loadBalancer.nextClient).toBe(1)
    loadBalancer.selectClient()
    expect(loadBalancer.nextClient).toBe(0)
  })
})

describe('methodsHandler.get works', () => {
  loadBalancer.module.exports = {
    lbMethod () {
      return 'hello!'
    }
  }

  it('when the method is defined', async () => {
    await expect(loadBalancer.methods.lbMethod()).resolves.toBe('hello!')
    expect(loadBalancer.nextClient).toBe(0) // asserts that client didnt send a call
  })

  it('when the method is undefined', async () => {
    loadBalancer.methods.hello()
    expect(loadBalancer.nextClient).toBe(1) // asserts that client sent a call
  })
})
