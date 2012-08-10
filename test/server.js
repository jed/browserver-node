var PORT = "෴".charCodeAt()

var spawn  = require("child_process").spawn
var assert = require("assert")
var http   = require("http")
var fs     = require("fs")

var tap  = require("tap")
var test = tap.test
var plan = tap.plan

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

var url = "http://vcap.me:3572/"
var clientHost
var phantom

test("running tests...", function(t) {
  t.test("launch client", function(t) {
    servers.brow.on("connection", function(client) {
      t.ok("id" in client, "client has an id")
      t.equal(typeof client.id, "string", "client id is a string")

      clientHost = client.id + ".vcap.me:3572"
      t.end()
    })

    phantom = spawn("phantomjs", ["browser.js", url], {cwd: __dirname})
  })

  t.test("GET /location", function(t) {
    var href = "http://" + clientHost + "/location"
    var location = ""

    t.plan(1)

    http.get(href, function(res) {
      res.on("data", function(chunk){ location += chunk })
      res.on("end", function() {
        t.equal(location, url, "original url returned")
      })
    })
  })

  t.test("GET /notFound", function(t) {
    var href = "http://" + clientHost + "/notFound"

    t.plan(1)

    http.get(href, function(res) {
      t.equal(res.statusCode, 404, "404 returned")
    })
  })

  t.test("teardown", function(t) {
    t.plan(1)

    phantom.kill()
    servers.ws.close()
    servers.http.close(function() {
      t.ok(true, "http server should close")
    })
  })

  // t.test("exit", function(t) {
  //   process.exit()
  // })

  t.end()
})

