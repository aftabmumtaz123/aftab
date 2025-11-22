const redis = require('redis');

const client = redis.createClient({
    socket: {
        host: '127.0.0.1',
        port: 6379
    }
});

client.on('error', (err) => {
    // Suppress connection refused errors to avoid spamming console if Redis is not running
    if (err.code === 'ECONNREFUSED') {
        // console.log('Redis not available, skipping caching.');
    } else {
        console.log('Redis Client Error', err);
    }
});

client.on('connect', () => console.log('Redis Client Connected'));

(async () => {
    try {
        await client.connect();
    } catch (err) {
        // Ignore initial connection error
    }
})();

module.exports = client;
