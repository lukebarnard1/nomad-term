const { runTests } = require('../test-util')

const { SubTerminal } = require('../subterminal')

function getSubTerminalState(data) {
    const st = new SubTerminal(null, null, () => {})

    st.write(data)

    return {
      getLine: st.getLine.bind(st),
      getCursorPosition: st.getCursorPosition.bind(st),
    }
}

module.exports = () => runTests('SubTerminal ', [
    {
        description: 'inserting text updates cursor position',
        actual: getSubTerminalState('testing').getCursorPosition(),
        expected: {x: 7, y: 0}
    },
    {
        description: 'inserting text updates buffer',
        actual: getSubTerminalState('testing').getLine(0).slice(0, 7),
        expected: 'testing'
    },
])
