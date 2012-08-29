var PORT
var CLIENT_COUNT = 3
var results = []

var exec   = require("child_process").exec
var assert = require("assert")
var http   = require("http")
var url    = require("url")
var fs     = require("fs")

var log = console.log.bind(console)

var HttpServer       = require("http").Server
var WebSocketServer  = require(  "ws").Server
var BrowServer       = require( "../").Server

var servers = {}

servers.http = new HttpServer()
servers.ws   = new WebSocketServer({server: servers.http})
servers.brow = new BrowServer().listen(servers.ws).listen(servers.http)

var client = new Buffer(
  "<!doctype html>\n" +
  "<html>" +
    "<body>" +
      "<script>" + fs.readFileSync(__dirname + "/../node_modules/browserver-client/browserver.js") + "</script>\n" +
      "<script>" + fs.readFileSync(__dirname + "/client.js", "utf8") + "</script>\n" +
    "</body>" +
  "</html>"
)

var routes = {
  "/": {
    GET: function(req, res) {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf8",
        "Content-Length": client.length
      })

      res.end(client)
    }
  }
}

servers.http.on("request", onRequest)

function onRequest(req, res) {
  var match = req.url.match(/^[^?]+/)
  var path = match && match[0]
  var route = routes[path]
  var handler = route && route[req.method]

  if (!route) {
    res.writeHead(404, {"Content-Type": "text/plain"})
    res.end("Not found")
  }

  else if (!handler) {
    res.writeHead(405, {"Content-Type": "text/plain"})
    res.end("Method not allowed")
  }

  else handler.call(this, req, res)
}

servers.http.listen(function() {
  var address = this.address()

  PORT = address.port

  log(
    "The browserver proxy is listening at http://%s:%s.",
    address.address,
    address.port
  )

  spawnClients(CLIENT_COUNT, function(err, clients) {
    startTests(clients)
  })
})

var command = process.argv[2] == "--headless"
  ? "phantomjs browser.js"
  : "open"

function spawnClient(cb) {
  var url   = "http://localhost:" + PORT
  var child = exec(command + " " + url, {cwd: __dirname})

  servers.brow.once("connection", function(client) {
    cb(null, client.hostname)
  })
}

function spawnClients(count, cb) {
  log("Spawning %s clients...", count)

  var clients = []

  spawnClient(function onClient(err, client) {
    clients.push(client)

    log("Client #%s of %s spawned (%s)...", clients.length, count, client)

    if (clients.length < count) return spawnClient(onClient)

    log("All clients spawned.")
    cb(null, clients)
  })
}

function startTests(clients) {
  var client_count = clients.length
  var test_count = client_count * (client_count - 1)

  log(
    "Setting up %s tests (%s for each of %s testers)",
    test_count,
    client_count - 1,
    client_count
  )

  clients.forEach(function(testee, testeeNum) {
    clients.forEach(function(tester, testerNum) {
      if (tester == testee) return

      var options = {
        method: "POST",
        hostname: tester,
        port: PORT,
        path: "/testees",
        headers: {
          "Content-Type": "text/plain"
        }
      }

      var req = http.request(options, function(res) {
        log("Client #%s tested client #%s...", testerNum + 1, testeeNum + 1)

        if (res.statusCode == 204) {
          log("OK.")

          if (--test_count) return

          log("Done")
          process.exit(0)
        }

        var reason = ""

        res.on("data", function(chunk){ reason += chunk })
        res.on("end", function() {
          throw new Error("ERROR: " + reason)
        })
      })

      req.write(testee + ":" + PORT)

      req.end()
    })
  })
}
