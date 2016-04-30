import {Server} from 'ws'
import amqp from 'amqplib'
import _ from 'lodash'

let rmq = undefined;

function ws2rmq({method, ...data}, {[DATA_SENTINEL]: meta}) {
    return {
        topic: [realm, method].join("."),
        data: _.extend(data, {meta})
    }
}

function rmq2ws(msg) {
    let topic = msg.fields.routingKey;
    let data = JSON.parse(msg.content.toString());
    let {cid, realm} = data.meta;

    if (cid) {
        if (sockets.has(cid)) {
            sockets.get(cid).emit(data)
        } else {
            console.error(`Unknown CID: ${cid}`)
        }
    } else if (realm) {
        sockets.values.filter(sock => sock[DATA_SENTINEL].realm == realm).forEach(sock => sock.emit(data))
    } else {
        console.error("Huh?")
    }
}

amqp.connect("amqp://localhost").then(conn => {
    conn.createChannel().then(ch => {
        ch.assertExchange('ws-rmq', 'topic', {durable: false}).then(({exchange}) => {
            rmq = {
                conn,
                channel: ch,
                exchange: exchange,
                emit: ({topic, data}) => {
                    ch.publish(exchange, topic, new Buffer(JSON.stringify(data)));
                }
            };
        });
    });

    let recCh = conn.createChannel();

    conn.createChannel().then(recCh => {
        recCh.assertExchange('rmq-ws', 'topic', {durable: false})
            .then(() => recCh.assertQueue(''))
            .then(({queue}) => {
                recCh.bindQueue(queue, 'rmq-ws', '*');
                return queue
            })
            .then(queue => recCh.consume(queue, rmq2ws, {noAck: true}))
    });
});

let server = new Server({port: 8080});
let DATA_SENTINEL = Symbol();
let realms = Object.create(null);
let deepGet = (obj, path) => path.reduce((r, c) => r[c], obj);
let realm = (url) => deepGet(realms, url.split("/").filter(x => x != ''));


let sockets = new Map();

server.on('connection', (socket) => {
    console.log(`Handling connection`);
    socket.on('message', (message) => {
        let data = JSON.parse(message);
        console.log(`Handling message with method of '${data.method}'`);

        if (data.method == "register") {
            socket.emit = function (data) {
                this.send(JSON.stringify(_.omit(data, ['meta'])))
            };

            socket[DATA_SENTINEL] = {
                cid: data.cid,
                realm: realm(socket.upgradeReq.url)
            };

            sockets.set(data.cid, socket);
        }

        if (data.method == "fetch" || data.method == "put") {
            rmq.emit(ws2rmq(data, socket))
        }
    });

    socket.on('close', () => sockets.delete((socket[DATA_SENTINEL] || {}).cid))
});
