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

  data = parseHTTP.call({}, data.data || data)

  if (data.statusCode) {
    var id = data.headers["x-brow-req-id"]
    var res = this.responses[id]

    data.headers["Content-Length"] = Buffer.byteLength(data._body)
    delete data.headers["x-brow-req-id"]

    res.writeHead(data.statusCode, data.headers)

    if (data._body) res.write(data._body)

    res.end()

    delete this.responses[id]
  }

  else if (data.method) {
    var id = data.headers["x-brow-req-id"]
    delete data.headers["x-brow-req-id"]

    data = {
      path: data.url,
      host: data.headers.host
    }

    var req = http.request(data, function(res) {
      var body = ""

      res.headers["x-brow-req-id"] = id
      res.setEncoding("utf8")
      res.on("data", function(data){ body += data })
      res.on("end", function() {
        self.socket.send(serializeHTTP.call({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body || ""
        }))
      })
    })

    if (data._body) req.write(data._body)

    req.end()
  }

  else {
    // invalid
  }
}

Client.prototype.handleRequest = function(req, res) {
  var id = Math.random().toString(36).slice(2)
  req.headers["x-brow-req-id"] = id
  this.responses[id] = res

  var payload = ServerRequest.prototype.toString.call(req)

  this.socket.send(payload)
}

function ServerRequest(){}
ServerRequest.prototype.toString = function() {
  var str = this.method + " " + this.url + " HTTP/" + this.httpVersion + "\r\n"

  for (var key in this.headers) {
    str += key + ": " + this.headers[key] + "\r\n"
  }

  return str + "\r\n" + this.body
}

function ClientResponse(){}
ClientResponse.prototype.toString = function() {
  // TODO: find real HTTP version, reason code
  var reason = http.STATUS_CODES[this.statusCode]
  var str = "HTTP/" + ("1.1") + " " + this.statusCode + " " + reason + "\r\n"

  for (var key in this.headers) {
    str += key + ": " + this.headers[key] + "\r\n"
  }

  return str + "\r\n" + this.body
}

function parseHTTP(data) {
  var pattern = /\r?\n/g
  var headers = this.headers = {}
  var match = pattern.exec(data)
  var start = 0
  var end = match.index
  var row = data.slice(start, end).split(" ")

  if (row[1] > 0) {
    this.httpVersion = row[0].slice(5)
    this.statusCode = +row[1]
    this.reason = row[2]
  }

  else {
    this.method = row[0]
    this.url = row[1]
    this.httpVersion = row[2].slice(5)
  }

  while (true) {
    start = end + match[0].length
    match = pattern.exec(data)
    end = match.index
    row = data.slice(start, end)

    if (!row) break

    start = row.match(/:\s*/)
    headers[row.slice(0, start.index)] = row.slice(start.index + start[0].length)
  }

  this._body = data.slice(end + match[0].length)

  return this
}

var CRLF = "\r\n"

function serializeHTTP() {
  var data = this.statusCode
    ? "HTTP/" + this.httpVersion + " " + this.statusCode
    : this.method + " " + this.url + " HTTP/" + this.httpVersion

  data += CRLF

  for (var name in this.headers) {
    data += name + ": " + this.headers[name] + CRLF
  }

  data += CRLF + this._body

  return data
}

exports.Server = Server
exports.Client = Client
