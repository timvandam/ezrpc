const { LoadBalancer } = require('../../')

// This loadbalancer functions like a reverse proxy to a server running on port 1251
const server = new LoadBalancer([{ host: 'localhost', port: 1251 }], 1250)
