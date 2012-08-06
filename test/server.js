var PORT = "෴".charCodeAt()

var exec   = require("child_process").exec
var assert = require("assert")
var http   = require("http")
var fs     = require("fs")

var HttpServer       = require("http").Server
var WebSocketServer  = require(  "ws").Server
var BrowServer       = require( "../").Server
var browserverClient = require("brow-client")

var servers = {}

servers.http = new HttpServer().listen(PORT)
servers.ws   = new WebSocketServer({server: servers.http})
servers.brow = new BrowServer({ws: servers.ws, http: servers.http})

var client = new Buffer(
  "<!doctype html>\n" +
  "<script>" + browserverClient.source + "</script>\n" +
  "<script>" + fs.readFileSync(__dirname + "/client.js"   , "utf8") + "</script>\n"
)

servers.http.on("request", function(req, res) {
  if (req.url == "/") {
    res.writeHead(200, {
      "Content-Type": "text/html",
      "Content-Length": client.length
    })

    return res.end(client)
  }

  res.writeHead(404, {
    "Content-Type": "text/plain",
    "Content-Length": 10
  })

  res.end("Not found\n")
})


var phantom = exec("phantomjs browser.js http://localhost.browserver.org:3572/", {cwd: __dirname})

servers.brow.on("connection", function(client) {
  var href = "http://" + client.id + ".localhost.browserver.org:3572/location"

  http.get(href, function(res) {
    var location = ""

    res.on("data", function(chunk){ location += chunk })
    res.on("end", function() {
      assert.equal(location, "http://localhost.browserver.org:3572/")

      phantom.kill()
      servers.ws.close()
      servers.http.close()
      process.exit()
    })
  })
})
