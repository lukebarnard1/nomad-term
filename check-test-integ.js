const path = require('path')
const fs = require('fs')

const logDir = path.join(__dirname, 'logs')
const logPath = path.join(logDir, 'test-integ.log')

const { createSubTerminal } = require('./subterminal')

try {
  fs.accessSync(logDir, fs.constants.F_OK)
} catch (err) {
  fs.mkdirSync(logDir)
}

const stream = fs.createReadStream(logPath)

let data = ''
stream.on('readable', () => {
  let chunk
  while ((chunk = stream.read()) !== null) {
    data += chunk
  }
})

stream.on('end', () => {
  const entries = data.split('\n').filter(l => l).map((l, ix) => {
    console.info({ lineNumber: ix + 1, parsing: l })
    return JSON.parse(l)
  })
  check(entries)
  stream.close()
})

function check (entries) {
  function drawCallback () {
    // do nothing
  }

  // Receive data from process
  function onProcData (data) {
    // do nothing
  }

  const subTermIds = Array.from(new Set(entries.map(e => e.subTermId)))

  // This does actually start a bash process, which is not needed
  // TODO: just make a new SubTerminal - no side-effects testing

  const subTerms = {}
  subTermIds.map(id => {
    const subTerm = createSubTerminal(drawCallback, { id, onProcData })
    subTerm.resize(50, 50)
    subTerms[id] = subTerm
  })

  function identical (a, b) {
    return JSON.stringify(a) === JSON.stringify(b)
  }

  let errorCount = 0

  function runEntry (e) {
    const { subTermId } = e

    const subTerm = subTerms[subTermId]

    if (e.procOutput !== undefined) {
      subTerm.write(e.procOutput)
    }

    if (e.userInput !== undefined) {
      // User input is ignored - there is no process to send it to
    }

    if (e.subTerminal !== undefined) {
      // Check that recorded state matches current subTerm state

      const expected = e.subTerminal
      const actual = {
        lines: subTerm.drawSubTerminal(50, 50, {
          isFocussed: true,
          highlight: false
        }),
        size: subTerm.size,
        cursor: subTerm.cursor
      }

      const props = ['size', 'cursor', 'lines']

      function basicCheck (propName) {
        // check size
        if (!identical(expected[propName], actual[propName])) {
          console.error('mismatch: ' + propName)
          console.error({
            expected: expected[propName],
            actual: actual[propName]
          })
          errorCount++
        }
      }

      props.map(basicCheck)
    }
  }

  entries.map(runEntry)

  console.info({ processedEntries: entries.length, errorCount })

  process.exit(errorCount)
}
