const path = require('path')
const fs = require('fs')

const logDir = path.join(__dirname, 'logs')
const logPath = path.join(logDir, 'nomad.log')

try {
  fs.accessSync(logDir, fs.constants.F_OK)
} catch (err) {
  fs.mkdirSync(logDir)
}

const stream = fs.createWriteStream(logPath, { flags: 'a' })

const { NOMAD_LOGGING } = process.env

const log = NOMAD_LOGGING === 'true' ? {
  info: (o) => stream.write(JSON.stringify(o) + '\n'),
  error: (e) => stream.write(JSON.stringify({
    message: e.message,
    stack: e.stack.split('\n')
  }) + '\n')
} : {
  info: () => {},
  error: () => {}
}

module.exports = log
