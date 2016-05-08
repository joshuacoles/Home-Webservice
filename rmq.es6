import amqp from 'amqplib'
import Rx from 'rx'

export default class RMQ {
    constructor(url) {
        this.connection = amqp.connect(url)
    }

    async declarePush(id) {
        return await (this.connection.then(connection => {
            connection.createChannel().then(channel => {
                channel.assertExchange(id, 'topic', {durable: false}).then(({exchange}) => {
                    return ({topic, data}) => {
                        channel.publish(exchange, topic, new Buffer(JSON.stringify(data)));
                    }
                })
            })
        }));
    }

    declarePull(id, key) {
        return Rx.Observable.create((observer) => {
            this.connection.createChannel().then(channel => {
                channel.assertExchange('server2agents', 'topic', {durable: false})
                    .then(() => channel.assertQueue(''))
                    .then(({queue}) => {
                        channel.bindQueue(queue, id, key);
                        return queue
                    })
                    .then(queue => channel.consume(queue, (msg) => observer.onNext(msg), {noAck: true}))
            });
        });
    }
}
