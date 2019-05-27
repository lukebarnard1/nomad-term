const { runTests } = require('../test-util')

const { SubTerminal } = require('../subterminal')

function getSubTerminalState(data) {
    const st = new SubTerminal(null, null, () => {})

    st.write(data)

    return st.getState()
}

module.exports = () => runTests('SubTerminal ', [
    {
        description: 'inserting text updates cursor position',
        actual: getSubTerminalState('testing').cursor,
        expected: {x: 7, y: 0}
    },
    {
        description: 'inserting text updates buffer',
        actual: getSubTerminalState('testing').buffer[0].slice(0, 7),
        expected: 'testing'
    },
])
