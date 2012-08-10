var events = require("events")
var http   = require("http")
var url    = require("url")

function Server(opts) {
  events.EventEmitter.call(this)

  this.clients = {}
  this.responses = {}

  this.Client = function(){ Client.call(this) }
  this.Client.prototype = new Client
  this.Client.prototype.server = this

  if (!opts) opts = {}

  this.setHost(opts.host)
  this.attachWs(opts.ws)
  this.attachHttp(opts.http, opts.port)
}

Server.prototype = new events.EventEmitter

Server.prototype.ws = null
Server.prototype.http = null
Server.prototype.host = "*.vcap.me"

Server.prototype.setHost = function(host) {
  if (host) this.host = host

  if (this.host.split("*").length != 2) {
    throw new Error("Specified host must have one and only one `*`.")
  }

  var hostPattern = this.host
    .replace(/\./g, "\\.")
    .replace(/\*/g, "([a-zA-Z0-9-]+)")

  this.hostPattern = new RegExp("^" + hostPattern + "$")

  return this
}

Server.prototype.attachWs = function(server) {
  this.ws = server

  if (!this.ws) throw new Error("No WebSocket server specified.")

  this.ws.on("connection", this.handleConnection.bind(this))

  return this
}

Server.prototype.attachHttp = function(server, port) {
  this.http = server

  if (!this.http) {
    if (!port) port = "෴".charCodeAt()

    this.http = http.createServer().listen(port)
    this.http.on("request", function(req, res) {
      this.handleError(501, res)
    }.bind(this))
  }

  this.http.emit = function(event, req, res) {
    event == "request"
      ? this.handleRequest(req, res)
      : http.Server.prototype.emit.apply(this.http, arguments)
  }.bind(this)

  return this
}

Server.prototype.handleConnection = function(socket) {
  var client = new this.Client().attachSocket(socket)

  this.clients[client.id] = client

  this.emit("connection", client)
}

Server.prototype.handleRequest = function(req, res) {
  var host = req.headers.host
  var hostname = host && host.split(":")[0]
  var match = hostname && hostname.match(this.hostPattern)
  var id = match && match[1]
  var emit = http.Server.prototype.emit

  if (!id) return emit.call(this.http, "request", req, res)

  var client = this.clients[id]

  if (!client) return this.handleError(504, res) // destroy connection instead?

  req.body = ""
  req.setEncoding("utf8")
  req.on("data", function(chunk){ req.body += chunk })
  req.on("end", client.handleRequest.bind(client, req, res))
}

Server.prototype.handleError = function(code, res) {
  if (!code) code = 500

  var reason = http.STATUS_CODES[code] + "\n"

  res.writeHead(code, {
    "Content-Type": "text/plain",
    "Content-Length": Buffer.byteLength(reason)
  })

  res.end(reason)
}

function Client() {
  this.id = Client.id()
  this.responses = {}
}

Client.id = function() {
  return Math.random().toString(36).slice(2)
}

Client.prototype = new events.EventEmitter

Client.prototype.attachSocket = function(socket) {
  socket.on("message", this.handleMessage.bind(this))
  socket.on("close", this.handleClose.bind(this))
  socket.on("error", this.emit.bind(this, "error"))

  this.socket = socket

  return this
}

Client.prototype.handleClose = function() {
  delete this.server.clients[this.id]
}

Client.prototype.handleMessage = function(data) {
  var self = this

  try { data = JSON.parse(data) }
  catch (error) { return this.emit("error", error) }

  if (data.statusCode) {
    data.headers["Content-Length"] = Buffer.byteLength(data.body)

    var id = data.headers["x-brow-req-id"]
    delete data.headers["x-brow-req-id"]

    var res = this.responses[id]

    res.writeHead(data.statusCode, data.headers)

    data.body ? res.end(data.body) : res.end()

    delete this.responses[id]
  }

  else if (data.method) {
    data.path = data.url
    delete data.path

    data.host = data.headers.host
    delete data.headers.host

    var id = data.headers["x-brow-req-id"]
    delete data.headers["x-brow-req-id"]

    var req = http.request(data, function(res) {
      var body = ""

      res.headers["x-brow-req-id"] = id
      res.setEncoding("utf8")
      res.on("data", function(data){ body += data })
      res.on("end", function() {
        self.socket.send(JSON.stringify({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body || undefined
        }))
      })
    })

    if (data.body) req.write(data.body)

    req.end()
  }

  else {
    // invalid type
  }
}

Client.prototype.handleRequest = function(req, res) {
  var id = Math.random().toString(36).slice(2)

  req.headers["x-brow-req-id"] = id
  delete req.headers.host
  this.responses[id] = res

  var payload = JSON.stringify({
    method: req.method,
    headers: req.headers,
    url: req.url,
    body: req.body || undefined
  })

  this.socket.send(payload)
}

exports.Server = Server
exports.Client = Client
