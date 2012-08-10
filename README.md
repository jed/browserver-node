෴ browserver-node ෴
======================

This is a [browserver](http://browserver.org) proxy for [node.js](http://nodejs.org).

Use browserver-node to create servers that act as a two-way proxies between an HTTP server and a WebSocket server, by

- forwarding incoming HTTP requests on to WebSocket connected clients, and back.
- forwarding incoming WebSocket messages to other HTTP servers, and back.

This library, along with [browserver-client](https://github.com/jed/browserver-client), is all the code you need to set up your own browserver.

Example
-------

```javascript
// http, websocket, and browservers
var http   = require("http")
var engine = require("engine.io")
var brow   = require("brow")

function handler(req, res) {
  // your usual HTTP server logic
}

// instantiate http and websocket servers
var httpServer = http.createServer(handler)
var wsServer   = engine.attach(httpServer)

// pass each to a new browserver...
var browServer = new brow.Server({
  http: httpServer,
  ws: wsServer,
  host: "*.mydomain.org"
})

// ... and start listening!
httpServer.listen(80, function() {
  // wait for incoming/outgoing browser connections...
})
```

Installation
------------

browserver is available through npm.

`npm install brow`

API
---

### browserver = new brow.Server(options)

This joins a WebSocket server and HTTP server, returning a new browserver instance. The `options` argument accepts the following properties:

- `ws`: Required. Must be an instance of a WebSocket server (such as [ws](https://github.com/einaros/ws)) or compatible shim (such as [socket.io](https://github.com/learnboost/socket.io), [engine.io](https://github.com/learnboost/engine.io)) that emits socket instances through `connection` events.

- `http`: Optional. If specified, must be an instance of `http.Server`. If omitted, an instance will be instantiated and bound to port `3572` (the Unicode codepoint for the brow `෴`).

- `host` Optional. If specified, must be a string containing one and only one asterisk (`*`), which is replaced with a socket id when a WebSocket connection is established. Note that this means you will need a wildcard CNAME or A record in your DNS settings that resolves to the appropriate domain or IP address. If omitted, CloudFoundry's [*.vcap.me](https://github.com/cloudfoundry/vcap/) domain is used, which resolves all domains/subdomains to `127.0.0.1`.

### browserver.on("connection", function(client){ ... })

The browserver server emits a `connection` event with a WebSocket-connected browserver client, whenever one connects. Each client is an instance of `brow.Client`, with an `id` property that defaults to a random lowercase alphanumeric string generated upon instantiation. How these ids are generated can be customized by overriding the static `brow.Client.id` method.

### client.on("close", function(){ ... })

browserver clients emit a `close` event when their underlying WebSocket is closed.

TODO
----

- Add integrated hooks for authorization and authentication of requests, both incoming and outgoing.
- Finish filling out phantomjs tests, and put them on travis-ci.
- Consider using the standard HTTP format instead of JSON for communication.
