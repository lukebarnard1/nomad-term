const { runTests } = require('../test-util')

const { SubTerminal } = require('../subterminal')

function getSubTerminalState (data) {
  const _ = () => {}
  const st = new SubTerminal(_, _, _)

  st.resize(20, 20)
  st.write(data)

  const state = {
    getLine: st.getLine.bind(st),
    getLines: () => st.drawSubTerminal(20, 20, { isFocussed: false }),
    getCursorPosition: st.getCursorPosition.bind(st),
    debug: () => {
      console.info(st.buffer)
      return state
    }
  }

  return state
}

module.exports = () => runTests('SubTerminal handles ', [
  {
    description: 'inserting text updates cursor position',
    actual: getSubTerminalState('testing').getCursorPosition(),
    expected: { x: 7, y: 0 }
  },
  {
    description: 'inserting text updates buffer',
    actual: getSubTerminalState('testing').getLine(0).slice(0, 7),
    expected: 'testing'
  },
  {
    description: 'inserting text across multiple lines',
    actual: getSubTerminalState('first\n\n\n\n\n\rsecond').getLine(5).slice(0, 6),
    expected: 'second'
  },
  {
    description: 'inserting text after basic cursor movement',
    actual: getSubTerminalState('testing\n\n\n\n\n\rtoasting\u001b[2A\rhello world\u001b[3B').getLine(3).slice(0, 11),
    expected: 'hello world'
  },
  {
    description: 'deleting lines after basic cursor movement',
    actual: getSubTerminalState('first\n\n\n\n\n\rsecond\u001b[3A\u001b[3M').getLine(2).slice(0, 6),
    expected: 'second'
  },
  {
    description: 'inserting lines after basic cursor movement',
    actual: getSubTerminalState('first\nsecond\u001b[4L').getLine(0).slice(0, 5),
    expected: 'first'
  },
  {
    description: 'basic scrolling sub region',
    actual: getSubTerminalState('first\n\n\n\n\n\rsecond\u001b[1;5r\u001b[0;0H\u001b[3L').getLine(3).slice(0, 5),
    expected: 'first'
  },
  {
    description: 'basic scrolling sub region 2',
    actual: getSubTerminalState('first\n\n\n\n\n\rsecond\u001b[1;5r\u001b[0;0H\u001b[3L').getLine(5).slice(0, 6),
    expected: 'second'
  },
  {
    description: 'basic scrolling sub region 3',
    actual: getSubTerminalState('first\n\n\n\n\n\rsecond\u001b[1;5r\u001b[0;0H\u001b[3L\u001b[1M').getLine(2).slice(0, 5),
    expected: 'first'
  },
  {
    description: 'clearing screen leaves cursor position unchanged',
    actual: getSubTerminalState('first\n\n\n\n\n\rsecond\u001b[1;5r\u001b[5;5H\u001b[3L\u001b[1M\u001b[2J').getCursorPosition(),
    expected: { x: 4, y: 4 }
  },
  {
    description: 'clearing screen sets all lines in the buffer to the empty string',
    actual: getSubTerminalState('first\nsecond\nthird\nfourth\nfith\u001b[2J').getLines().join('\n').trim(),
    expected: ''
  }
])
