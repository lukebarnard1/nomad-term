const path = require('path')
const fs = require('fs')

const logDir = path.join(__dirname, 'logs')
const logPath = path.join(logDir, 'test-integ.log')

try {
  fs.accessSync(logDir, fs.constants.F_OK)
} catch (err) {
  fs.mkdirSync(logDir)
}

const stream = fs.createWriteStream(logPath, { flags: 'w' })

const { createSubTerminal } = require('./subterminal')

function log (obj) {
  console.info(JSON.stringify(obj) + '\n')
  stream.write(JSON.stringify(obj) + '\n')
}

async function delay (ms) {
  log({ delay: ms })
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function doUserInput (userInput, subTerm) {
  log({ userInput, subTermId: subTerm.id })
  subTerm.writeToProc(userInput)
  await delay(3000)
}

const { stdin, stdout } = process

function recordSubTerm (subTerm) {
  const lines = subTerm.drawSubTerminal(50, 50, {
    isFocussed: true,
    highlight: false
  })
  log({
    subTerminal: {
      lines,
      size: subTerm.size,
      cursor: subTerm.cursor
    },
    subTermId: subTerm.id
  })
}

async function record (userInput, subTerm) {
  await doUserInput(userInput, subTerm)
  recordSubTerm(subTerm)
}

async function getSubTerm (id) {
  const onProcData = data => log({ procOutput: data, subTermId: id })
  const subTerm = createSubTerminal(() => {}, { id, onProcData })
  subTerm.resize(50, 50)
  await delay(2000)
  return subTerm
}

async function runPlan ({ name, plan }) {
  console.info({ name })
  const subTerm = await getSubTerm(name)
  await plan(subTerm)
}

async function runTests (tests) {
  await Promise.all(tests.map(runPlan))

  stream.end()
  process.exit(0)
}

runTests([
  {
    name: 'test_simple',
    plan: (subTerm) =>
      record('echo hello\n', subTerm)
  },
  {
    name: 'test_vim_simple',
    plan: (subTerm) => record('vim test_vim_simple.' + Date.now() + '.js\n', subTerm)
  },
  {
    name: 'test_man_cat',
    plan: (subTerm) => record('man cat\njjjjkkkjkjjkkjj', subTerm)
      .then(() => record('q', subTerm))
  },
  {
    name: 'test_vim_complex',
    plan: (subTerm) =>
      record('vim example.' + Date.now() + '.js\nilet i = 10;while(i-- >0)console.info(i);\u001bV:!node\n', subTerm)
        .then(() => record(':q!\n', subTerm))
  },
  {
    name: 'test_vim_complex_2',
    plan: (subTerm) =>
      record('vim example.' + Date.now() + '.js\nilet i = 100;while(i-- >0)console.info(i);\u001bV:!node\n', subTerm)
        .then(() => record('VG:sort\n', subTerm))
        .then(() => record(':q!\n', subTerm))
  },
  {
    name: 'test_vim_complex_3',
    plan: (subTerm) =>
      record('vim example.' + Date.now() + '.js\nilet i = 1000;while(i-- >0)console.info(i);\u001bV:!node\n', subTerm)
        .then(() => record('VG:sort\n', subTerm))
        .then(() => record('100j5dd3p', subTerm))
        .then(() => record(':q!\n', subTerm))
  },
  {
    name: 'test_vim_help',
    plan: (subTerm) =>
      record('vim\n:help\n', subTerm)
        .then(() => record('/CTRL\n', subTerm))
        .then(() => record('5n', subTerm))
        .then(() => record('n', subTerm))
        .then(() => record('n', subTerm))
        .then(() => record('n', subTerm))
        .then(() => record('Vjjjy', subTerm))
        .then(() => record(':q!\n', subTerm))
        .then(() => record('5p', subTerm))
        .then(() => record('VGJ', subTerm))
        .then(() => record(':q!\n', subTerm))
  }
])
