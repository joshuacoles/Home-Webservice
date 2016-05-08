import { Server } from 'ws'
import _ from 'lodash'
import RQM from './rmq'

const connection = new RQM('amqp://localhost');
const rqm = {
    push: _.wrap(connection.declarePush('server2agents'), (func, { method, ...data }, { [DATA_SENTINEL]: meta }) => func({
        topic: [meta.realm, method].join("."),
        data: _.extend(data, { meta })
    })),
    pull: connection.declarePull('server2agents', '*')
};

rqm.pull.subscribe(msg => {
    let topic = msg.fields.routingKey;
    let data = JSON.parse(msg.content.toString());
    let { cid, realm } = data.meta;

    let method = topic.slice(realm.length);

    if (cid) {
        if (sockets.has(cid)) {
            sockets.get(cid).emit(data, method)
        } else {
            console.error(`Unknown CID: ${cid}`)
        }
    } else if (realm) {
        sockets.values.filter(sock => sock[DATA_SENTINEL].realm == realm).forEach(sock => sock.emit(data, method))
    } else {
        console.error("Huh?")
    }
});

const server = new Server({ port: 8080 });
const DATA_SENTINEL = Symbol();
const realms = Object.create(null);
const realm = (url) => _.get(realms, url.split("/").filter(x => x != ''));

let sockets = new Map();

server.on('connection', (socket) => {
    console.log(`Handling connection`);
    socket.on('message', (message) => {
        let data = JSON.parse(message);
        console.log(`Handling message with method of '${data.method}'`);

        if (data.method == "register") {
            socket.emit = function (data, method) {
                this.send(JSON.stringify(_.extend(_.omit(data, ['meta']), { method })))
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

    socket.on('close', () => sockets.delete((socket[DATA_SENTINEL] || {}).cid))
});
