var PORT = "෴".charCodeAt()

var spawn  = require("child_process").spawn
var assert = require("assert")
var http   = require("http")
var url    = require("url")
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

describe("browserver", function() {
  var phantom
  var host

  before(function() {
    phantom = spawn(
      "phantomjs",
      ["browser.js", "http://vcap.me:3572/"],
      {cwd: __dirname}
    )
  })

  it("should emit an incoming client", function(done) {
    servers.brow.on("connection", function(client) {
      assert.equal(typeof client.id, "string")

      host = client.id + ".vcap.me:3572"
      done()
    })
  })

  it("should get a 404 for /doesnotexist", function(done) {
    var url = "http://" + host + "/doesnotexist"

    http.get(url, function(res) {
      assert.equal(res.statusCode, 404)
      done()
    })
  })

  it("should get a 405 for GET /echo", function(done) {
    var url = "http://" + host + "/echo"

    http.get(url, function(res) {
      assert.equal(res.statusCode, 405)
      done()
    })
  })

  it("should get the original body back for POST /echo", function(done) {
    var body = "hello, world."
    var opts = url.parse("http://" + host + "/echo")

    opts = {
      method: "POST",
      hostname: opts.hostname,
      port: opts.port,
      path: opts.path
    }

    var req = http.request(opts, function(res) {
      assert.equal(res.statusCode, 200)

      var remoteBody = ""
      res.on("data", function(chunk){ remoteBody += chunk })
      res.on("end", function() {
        assert.equal(body, remoteBody)
        done()
      })
    })

    req.on("error", done)
    req.write(body)
    req.end()
  })
})
