var webpage = require("webpage")
var system = require("system")
var url = system.args[1]

webpage.create().open(url)
