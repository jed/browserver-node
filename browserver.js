var http = require("http")
var brow = require("browserver-client")

var EventEmitter = brow.EventEmitter
var Request      = brow.Request
var Response     = brow.Response

Request.prototype.authorize = function(cb){ cb() }

Response.prototype.error = function(code, message) {
  if (!code) code = 500
  if (!message) message = http.STATUS_CODES[code]

  this.writeHead(code, {
    "Content-Type": "text/plain",
    "Content-Length": Buffer.byteLength(message)
  })

  this.end(message)
}

function Proxy() {
  EventEmitter.call(this)

  this.servers = {}

  this.Server = function(){ Server.call(this) }
  this.Server.prototype = new Server

  this.Server.prototype.ServerRequest = function(){ Request.call(this) }
  this.Server.prototype.ServerRequest.prototype = new Request

  this.Server.prototype.ClientRequest = function(){ Request.call(this) }
  this.Server.prototype.ClientRequest.prototype = new Request
}

Proxy.prototype = new EventEmitter

Proxy.prototype.hostname = "*.vcap.me"

Proxy.prototype.listen = function(server, options) {
  server instanceof http.Server || typeof server != "object"
    ? this.listenHttp(server, options)
    : this.listenWs(server, options)

  return this
}

Proxy.prototype.listenWs = function(wsServer, options) {
  var proxy = this

  if (!options) options = {}

  if (options.authorize) {
    this.Server.prototype.ServerRequest.prototype.authorize = options.authorize
  }

  this.ws = wsServer

  wsServer.on("connection", function(socket) {
    var server = new proxy.Server(options)
    var hostname = proxy.hostname.replace("*", server.id)

    server.hostname = hostname

    proxy.servers[hostname] = server

    socket.on("close", function() {
      delete proxy.servers[hostname]
      proxy.emit("disconnection", server)
    })

    server.listen(socket)

    proxy.emit("connection", server)
  })
}

Proxy.prototype.listenHttp = function(httpServer, options) {
  if (typeof httpServer == "string") {
    hostname = httpServer
    httpServer = null
  }

  if (!(httpServer instanceof http.Server)) {
    httpServer = http.createServer().listen(httpServer)
  }

  this.http = httpServer

  if (!options) options = {}

  if (options.authorize) {
    this.Server.prototype.ServerRequest.prototype.authorize = options.authorize
  }

  if (options.hostname) this.hostname = options.hostname

  this.hostPattern = new RegExp("^" +
    this.hostname
      .replace(/\./g, "\\.")
      .replace(/\*/g, "[a-zA-Z0-9-]+") +
  "$")

  var emit = httpServer.emit
  var proxy = this

  httpServer.emit = function(event, req, res) {
    if (event != "request") return emit.apply(this, arguments)

    var host = req.headers.host || "localhost"
    var hostname = host.split(":")[0]

    if (!proxy.hostPattern.test(hostname)) {
      return emit.apply(this, arguments)
    }

    var server = proxy.servers[hostname]

    if (!server) return Response.prototype.error.call(res, 504)

    var ip = req.connection.remoteAddress
    var forwardedFor = req.headers["x-forwarded-for"]

    if (forwardedFor) ip = forwardedFor + ", " + ip

    req.headers["x-forwarded-for"] = ip
    req.authorize = server.ServerRequest.prototype.authorize

    server.onserverrequest(req, res)
  }
}

function Server() {
  this.id = brow.guid()

  this.requests = {}
  this.responses = {}
}

Server.prototype.listen = function(socket) {
  this.socket = socket

  var server = this

  socket.on("message", function(data) {
    var req = (new server.ClientRequest).parse(data)

    if (req) return server.onclientrequest(req)

    var res = (new Response).parse(data)

    if (res) server.onserverresponse(res)
  })

  socket.on("close", function() {
    var responses = server.responses

    for (var id in responses) {
      Response.prototype.error.call(responses[id], 504)
      delete responses[id]
    }
  })

  socket.on("error", function(error) {
    console.log(error.message, error.stack)
  })
}

Server.prototype.onserverrequest = function(req, res) {
  var server = this

  req.authorize(function(err) {
    if (err) return Response.prototype.error.call(res, 403, err.message)

    var socket = server.socket

    req.id = brow.guid()
    req.body = ""

    server.responses[req.id] = res

    req.on("data", function(chunk){ req.body += chunk })
    req.on("end", function() {
      socket.send(Request.prototype.serialize.call(req))
    })
  })
}

Server.prototype.onserverresponse = function(res) {
  var response = this.responses[res.id]

  if (!response) return

  response.writeHead(res.statusCode, res.headers)
  response.write(res.body)
  response.end()
}

Server.prototype.onclientrequest = function(req) {
  var socket = this.socket

  req.authorize(function(err) {
    if (err) {
      var res = new Response

      res.statusCode = 403
      res.headers = {"content-type": "text/plain"}
      res.reasonPhrase = http.STATUS_CODES[403]
      res.id = req.id
      res.body = err.message || res.reasonPhrase

      return socket.send(res.serialize())
    }

    var host = req.headers.host
    delete req.headers.host

    host = host ? host.split(":") : ["localhost"]

    var opts = {
      method: req.method,
      hostname: host[0],
      port: host[1],
      path: req.url,
      headers: req.headers
    }

    var request = http.request(opts, function(res) {
      res.body = ""
      res.id = req.id

      res.on("data", function(chunk){ res.body += chunk })
      res.on("end", function() {
        socket.send(Response.prototype.serialize.call(res))
      })
    })

    request.write(req.body)
    request.end()
  })
}

exports.Server = Proxy
exports.createServer = function(){ return new Proxy }
