෴ browserver-node ෴
======================

[![Build Status](https://secure.travis-ci.org/jed/browserver-node.png?branch=master)](http://travis-ci.org/jed/browserver-node)

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
var brow   = require("browserver")

function handler(req, res) {
  // your usual HTTP server logic
}

// instantiate http and websocket servers
var httpServer = http.createServer(handler)
var wsServer   = engine.attach(httpServer)

// pass each to a new browserver...
var browServer = new brow.Server
browServer.listen(wsServer)
browServer.listen(httpServer, {hostname: "*.mydomain.org"})

// ... and start listening!
httpServer.listen(80, function() {
  // wait for incoming/outgoing browser connections...
})
```

Installation
------------

browserver is available through npm.

`npm install browserver`

API
---

### browserver = new brow.Server

This creates a new browserver proxy, which works by listening to both a WebSocket-alike server and an HTTP server.

### browserver.listen(webSocketServer, [options])

`webSocketServer` is required, and must be an instance of a WebSocket server (such as [ws](https://github.com/einaros/ws)) or compatible shim (such as [socket.io](https://github.com/learnboost/socket.io), [engine.io](https://github.com/learnboost/engine.io)) that emits socket instances through `connection` events.

`options` is an optional object that can have any of the following properties:

- `authorize`: An optional request method used for authorization of client requests FROM the browser. This method is invoked with the request as the `this` context and a callback as the first argument (`authorize.call(request, callback)`). If this method calls back without an error, the request will be passed on. If this method calls back with an error, a 403 is returned with the error message as the body of the response. By default, browserver will forward-proxy any request from a browser to the greater Internet, so use this method to limit the resources to which browserver clients have access.

### browserver.listen(httpServer, [options])

`httpServer` is required, and can either be an instance of `http.Server`, or a primitive (such as `3572` or `undefined`) to be used as the port on which a new server instance will listen.

`options` is an optional object that can have any of the following properties:

- `hostname` Optional. If specified, must be a string containing one and only one asterisk (`*`), which is replaced with a socket id when a WebSocket connection is established. Note that this means you will need a wildcard CNAME or A record in your DNS settings that resolves to the appropriate domain or IP address. If omitted, CloudFoundry's [*.vcap.me](https://github.com/cloudfoundry/vcap/) domain is used, which resolves all domains/subdomains to `127.0.0.1`.

- `authorize`: An optional request method used for authorization of server requests TO the browser. This method is invoked with the request as the `this` context and a callback as the first argument (`authorize.call(request, callback)`). If this method calls back without an error, the request will be passed on to the browserver client. If this method calls back with an error, a 403 is returned with the error message as the body of the response. By default, browserver will reverse-proxy any request from the greater Internet to a browserver clients, so use this method to authenticate or limit the requests actually sent to which browserver clients.

### browserver.on("connection", function(server){ ... })

The browserver server proxy emits a `connection` event whenever a browserver client connects. The listener is called with one argument, the browserver server. The server's unique hostname is available at the `hostname` propery.

### browserver.on("disconnection", function(server){ ... })

The browserver server proxy emits a `disconnection` event whenever a browserver client disconnects. The listener is called with one argument, the disconnected browserver server.
