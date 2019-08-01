const { runTests } = require('../test-util')

const { reduceFormats } = require('../subterminal')

function bgFormat(start, length, color) {
    return {start, length, format: {bg: {color}}}
}

module.exports = () => runTests('reduceFormats ', [
    {
        description: 'returns an array',
        actual: reduceFormats([], null),
        expected: []
    },
    {
        description: 'handles simple sequences',
        actual: reduceFormats([], bgFormat(0, 5, 123)),
        expected: [bgFormat(0, 5, 123)],
    },
    {
        description: 'handles non-intersecting sequences',
        actual: reduceFormats([bgFormat(0, 3, 123)], bgFormat(3, 2, 456)),
        expected: [bgFormat(0, 3, 123), bgFormat(3, 2, 456)],
    },
    {
        description: 'handles non-intersecting, out of order sequences',
        actual: reduceFormats([bgFormat(3, 2, 123)], bgFormat(0, 3, 456)),
        expected: [bgFormat(0, 3, 456), bgFormat(3, 2, 123)],
    },
    {
        description: 'handles sub sequences',
        actual: reduceFormats([bgFormat(0, 10, 123)], bgFormat(1, 5, 456)),
        expected: [bgFormat(0, 1, 123), bgFormat(1, 5, 456), bgFormat(6, 4, 123)],
    },
    {
        description: 'handles complex sub sequences',
        actual: reduceFormats([bgFormat(0, 5, 123), bgFormat(5, 5, 456)], bgFormat(4, 2, 9)),
        expected: [bgFormat(0, 4, 123), bgFormat(4, 2, 9), bgFormat(6, 4, 456)],
    },
    {
        description: 'handles more complex sub sequences',
        actual: reduceFormats([bgFormat(0, 5, 123), bgFormat(5, 5, 456)], bgFormat(0, 10, 9)),
        expected: [bgFormat(0, 10, 9)],
    },
    {
        description: 'handles other more complex sub sequences',
        actual: reduceFormats([bgFormat(0, 5, 123), bgFormat(5, 5, 456), bgFormat(10, 4, 3)], bgFormat(5, 7, 9)),
        expected: [bgFormat(0, 5, 123), bgFormat(5, 7, 9), bgFormat(12, 2, 3)],
    },
    {
        description: 'handles other more complex sub sequences',
        actual: reduceFormats([bgFormat(0, 5, 123), bgFormat(5, 5, 456), bgFormat(10, 4, 3)], bgFormat(5, 7, 9)),
        expected: [bgFormat(0, 5, 123), bgFormat(5, 7, 9), bgFormat(12, 2, 3)],
    },
    {
        description: 'handles fully overlapping sequences',
        actual: reduceFormats([bgFormat(0, 5, 123)], bgFormat(0, 5, 1)),
        expected: [bgFormat(0, 5, 1)],
    }
])
