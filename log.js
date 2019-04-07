const path = require('path');
const fs = require('fs');

const logPath = path.join(path.join(__dirname, 'logs'), 'info.log');
const stream = fs.createWriteStream(logPath, {flags: 'a'});
const log = {
    info: (o) => stream.write(JSON.stringify(o) + '\n'),
    error: (e) => stream.write(JSON.stringify({
        message: e.message,
        stack: e.stack.split('\n')
    }) + '\n')
};

module.exports = log;
