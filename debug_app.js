try {
    console.log('Attempting to require app.js...');
    require('./app.js');
    console.log('App required successfully (listening should start)');
} catch (err) {
    console.error('CRASH DETECTED IN require("./app.js"):');
    console.error(err.stack || err);
    process.exit(1);
}
