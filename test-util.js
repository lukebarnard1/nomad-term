function expect({description, actual, expected}) {
    actual = JSON.stringify(actual)
    expected = JSON.stringify(expected)
    const pass = actual === expected
    const result = `${pass ? 'PASS' : 'FAIL'}`

    console.info(`${result}: ${description}`)

    if (!pass) {
        console.info(' - ' + actual)
        console.info(' + ' + expected)
    }
    return pass
}

function runTests(description, tests) {
    return tests
        .map(t => expect({...t, description: description + t.description}))
        .reduce((failures, pass) => failures += (pass ? 0 : 1), 0)
}

module.exports = { runTests }
