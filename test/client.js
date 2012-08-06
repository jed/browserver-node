!function() {
  var ws = new WebSocket("ws://localhost:3572")
  var server = http.createServer(onRequest).listen(ws)

  function error(code, res) {
    res.writeHead(code, {"Content-Type": "text/plain"})

    res.end({
      405: "Method not allowed",
      404: "Not found",
      501: "Not implemented"
    }[code])
  }

  function onRequest(req, res) {
    if (req.url == "/location") {
      if (req.method != "GET") return error(405, res)

      res.writeHead(200, {"Content-Type": "text/plain"})
      return res.end(window.location.href)
    }

    if (req.url.slice(0, 21) == "/document/body/style/") {
      if (req.method != "PUT") return error(405, res)

      var prop = req.url.slice(21)

      prop = prop.replace(/-[a-z]/g, function(str) {
        return str.slice(1).toUpperCase()
      })

      document.body.style[prop] = req.body
      res.writeHead(204)
      return res.end()
    }

    error(404, res)
  }
}()
