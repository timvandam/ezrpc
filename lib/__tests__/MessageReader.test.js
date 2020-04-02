const MessageReader = require('../MessageReader')

it('constructor works', () => {
  expect(new MessageReader()).toEqual(expect.objectContaining({
    bytesLeft: 0,
    data: Buffer.alloc(0)
  }))
})

describe('feed works', () => {
  const message = jest.fn()
  let reader
  beforeEach(() => {
    reader = new MessageReader()
    reader.once('message', message)
    message.mockClear()
  })

  it('when providing a complete message', () => {
    reader.feed(Buffer.from('010041', 'hex')) // msg length = 1 = 0x0100 (LE 2 bytes). Message = 0x41 = hex for A
    expect(message).toHaveBeenCalled()
    expect(message).toHaveBeenLastCalledWith(Buffer.from('A'))
  })

  it('when providing partial messages', () => {
    reader.feed(Buffer.from('0200', 'hex')) // 2 bytes
    reader.feed(Buffer.from('41', 'hex')) // first byte = A
    reader.feed(Buffer.from('42', 'hex')) // second byte = B
    expect(message).toHaveBeenCalled()
    expect(message).toHaveBeenLastCalledWith(Buffer.from('AB'))
  })

  it('when providing multiple messages', () => {
    reader.removeAllListeners('message')
    reader.on('message', message)
    reader.feed(Buffer.from('010041010042', 'hex'))
    reader.removeAllListeners('message')
    expect(message).toHaveBeenCalledTimes(2)
    expect(message).toHaveBeenNthCalledWith(1, Buffer.from('A'))
    expect(message).toHaveBeenNthCalledWith(2, Buffer.from('B'))
  })
})

it('sendMessage works', () => {
  const reader = new MessageReader()
  const message = jest.fn()
  reader.once('message', message)
  const data = Buffer.from('hello')
  reader.data = data
  reader.bytesLeft = 123
  reader.sendMessage()
  expect(message).toHaveBeenCalled()
  expect(message).toHaveBeenLastCalledWith(data)
  expect(reader).toEqual(expect.objectContaining({
    bytesLeft: 0,
    data: Buffer.alloc(0)
  }))
})
