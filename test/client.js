!function() {
  var ws     = new WebSocket(location.href.replace("http", "ws"))
  var server = http.createServer(onRequest).listen(ws)

  function onRequest(req, res) {
    var match   = req.url.match(/^[^?]+/)
    var path    = match && match[0]
    var route   = routes[path]
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

  function testClient(host, cb) {
    var opts = {
      method: "POST",
      host: host,
      path: "/echo-body"
    }

    var req = http.request(opts, function(res) {
      console.log("RES", res)

      var body = ""
      res.on("data", function(chunk){
        console.log("DATA")
        body += chunk
      })
      res.on("end", function() {
        console.log(body, "123")
        body === "123"
          ? cb()
          : cb(new Error("Response not identical"))
      })
    })

    req.write("123")
    req.end()
  }

  var routes = {
    "/testees": {
      POST: function(req, res) {
        var body = ""
        var code = 200

        req.on("data", function(chunk){ body += chunk })
        req.on("end", function() {
          testClient(body, function(err) {
            console.log
            if (err) {
              res.writeHead(500, {"Content-Type": "text/plain"})
              res.write(err.message)
            }

            else res.writeHead(204)

            res.end()
          })
        })
      }
    },

    "/echo-body": {
      POST: function(req, res) {
        res.writeHead(200, {"Content-Type": "text/plain"})
        req.on("data", function(data){ res.write(data) })
        req.on("end", function(){
          console.log("INCOMING", req)
          res.end()
        })
      }
    },

    "/echo-headers": {
      GET: function(req, res) {
        res.writeHead(200, {"Content-Type": "application/json"})
        res.end(JSON.stringify(req.headers))
      }
    }
  }
}()
