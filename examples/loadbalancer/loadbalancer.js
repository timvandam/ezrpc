const { LoadBalancer } = require('../../')

// Lets define what servers we want to load balance for
const serversToLoadBalance = [{
  host: 'localhost',
  port: 1251
}]
// In a real-world scenario you would of course have multiple servers in here

// Start a load balancer server on port 1250
// This server acts just like a normal ezrpc Server, but will relay any undefined methods to
// servers in serversToLoadBalance
const server = new LoadBalancer(serversToLoadBalance, 1250)

// Your load balancer is already set up now!
//

// This is completely optional!
// If you do export methods they will not be relayed to a load balanced server
// but will be executed by the load balancer instead
// server.module.exports = {
//   ...
// }
