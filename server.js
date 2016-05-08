'use strict';

var _ws = require('ws');

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _rmq = require('./rmq');

var _rmq2 = _interopRequireDefault(_rmq);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _objectWithoutProperties(obj, keys) { var target = {}; for (var i in obj) { if (keys.indexOf(i) >= 0) continue; if (!Object.prototype.hasOwnProperty.call(obj, i)) continue; target[i] = obj[i]; } return target; }

var connection = new _rmq2.default('amqp://localhost');
var rqm = {
    push: _lodash2.default.wrap(connection.declarePush('server2agents'), function (func, _ref, _ref2) {
        var method = _ref.method;

        var data = _objectWithoutProperties(_ref, ['method']);

        var meta = _ref2[DATA_SENTINEL];
        return func({
            topic: [meta.realm, method].join("."),
            data: _lodash2.default.extend(data, { meta: meta })
        });
    }),
    pull: connection.declarePull('server2agents', '*')
};

rqm.pull.subscribe(function (msg) {
    var topic = msg.fields.routingKey;
    var data = JSON.parse(msg.content.toString());
    var _data$meta = data.meta;
    var cid = _data$meta.cid;
    var realm = _data$meta.realm;


    var method = topic.slice(realm.length);

    if (cid) {
        if (sockets.has(cid)) {
            sockets.get(cid).emit(data, method);
        } else {
            console.error('Unknown CID: ' + cid);
        }
    } else if (realm) {
        sockets.values.filter(function (sock) {
            return sock[DATA_SENTINEL].realm == realm;
        }).forEach(function (sock) {
            return sock.emit(data, method);
        });
    } else {
        console.error("Huh?");
    }
});

var server = new _ws.Server({ port: 8080 });
var DATA_SENTINEL = Symbol();
var realms = Object.create(null);
var realm = function realm(url) {
    return _lodash2.default.get(realms, url.split("/").filter(function (x) {
        return x != '';
    }));
};

var sockets = new Map();

server.on('connection', function (socket) {
    console.log('Handling connection');
    socket.on('message', function (message) {
        var data = JSON.parse(message);
        console.log('Handling message with method of \'' + data.method + '\'');

        if (data.method == "register") {
            socket.emit = function (data, method) {
                this.send(JSON.stringify(_lodash2.default.extend(_lodash2.default.omit(data, ['meta']), { method: method })));
            };

            socket[DATA_SENTINEL] = {
                cid: data.cid,
                realm: realm(socket.upgradeReq.url)
            };

            sockets.set(data.cid, socket);
        }

        if (data.method == "fetch" || data.method == "put") {
            rqm.push(data, socket);
        }
    });

    socket.on('close', function () {
        return sockets.delete((socket[DATA_SENTINEL] || {}).cid);
    });
});

//# sourceMappingURL=server.js.map