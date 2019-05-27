
const result = [
    require('./tests/reduceFormats.js')(),
    require('./tests/subterminal.js')()
].reduce((a,b) => a + b, 0)
process.exit(result)

