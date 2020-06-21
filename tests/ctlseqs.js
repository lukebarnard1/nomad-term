
const ESC = '\u001b'

const { runTests } = require('../test-util')
const { getCtlSeqs } = require('../ctlseqs.js')

const testCase = (s) => {
  const result = getCtlSeqs(s)
  return {
    sequenceCount: result.outs.filter(s => s.code).length,
    sequenceParameters: result.outs.filter(s => s.code).map(s => s.params),
    sequenceCodes: result.outs.filter(s => s.code).map(s => s.code),
    sequenceChars: result.outs.filter(s => s.code).map(s => s.chars),
    texts: result.outs.filter(s => s.text).map(s => s.text)
  }
}

const vimSeq =
  '\u001b7\u001b[?47h\u001b[?1h\u001b=\u001b[H\u001b[2J\u001b[?2004h\u001b[?1004h\u001b[8;59;189t\u001b[r\u001b[1;1H\u001b[m\u001b[38;5;252m\u001b[48;5;237m                                                                                                                                                                                             \r\n                                                                                                                                                                                             \r\n                                                                                                                                                                                             \r\n                                                                                                                                                                                             \r\n                                                                                                                                                                                 '

module.exports = () => runTests('ctlseqs.js ', [
  {
    description: 'handles a single format sequence without parameters',
    actual: testCase(ESC + '[m').sequenceCount,
    expected: 1
  },
  {
    description: 'correctly identifies text after a sequence',
    actual: testCase(ESC + '[mhello').texts[0],
    expected: 'hello'
  },
  {
    description: 'correctly identifies text before and after a sequence',
    actual: testCase('goodbye' + ESC + '[mhello').texts,
    expected: ['goodbye', 'hello']
  },
  {
    description: 'correctly identifies text before and after multiple sequences',
    actual: testCase('goodbye' + ESC + '[77;7;7mhello' + ESC + '[99;9;9mworld').texts,
    expected: ['goodbye', 'hello', 'world']
  },
  {
    description: 'can handle sequences with multiple parameters ',
    actual: testCase('\u001b[1;2;3;4;5;6;7;8;9;0m\u001b[00;0;0;0;0;0;0;000;0;0;0m').sequenceParameters,
    expected: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]]
  },
  {
    description: 'can handle sequences with weird structures ',
    actual: testCase('\u001b[205436977;2134567*y\u001b[6977;217*y').sequenceParameters,
    expected: [[205436977, 2134567], [6977, 217]]
  },
  {
    description: 'can handle weird sequences',
    actual: testCase('\u001b[$w').sequenceCodes,
    expected: ['DECRQPSR']
  },
  {
    description: 'can handle broken sequences',
    actual: testCase('\u001b[1;2;3;4;5;m;7;8;9;123;oops;456m').texts,
    expected: [';7;8;9;123;oops;456m']
  },
  {
    description: 'can handle sequences with spaces',
    actual: testCase('\u001b[2 q').sequenceCodes,
    expected: ['DECSCUSR']
  },
  {
    description: 'can handle sequences with quotes',
    actual: testCase('\u001b["q').sequenceCodes,
    expected: ['DECSCA']
  },
  {
    description: 'can handle the vim sequence with no text',
    actual: testCase(vimSeq).texts.reduce((acc, val) => acc + val, '').replace(/\s+/, ''),
    expected: ''
  },
  {
    description: 'can handle the vim sequence with no text (sequences)',
    actual: testCase(vimSeq).sequenceCodes,
    expected: [
      'DECSET', 'DECSET', 'CUP', 'ED', 'DECSET', 'DECSET', 'window_management', 'DECSTBM', 'CUP', 'SGR', 'SGR', 'SGR',
      'CR', 'NL',
      'CR', 'NL',
      'CR', 'NL',
      'CR', 'NL'
    ]
  },
  {
    description: 'will not return partial sequences in text',
    actual: testCase('\u001b[m <- complete sequence, incomplete sequence -> \u001b[1;2;3;').texts,
    expected: [' <- complete sequence, incomplete sequence -> ']
  },
  {
    description: 'can handle lack of parameters',
    actual: testCase('\u001b[m').sequenceParameters,
    expected: [[]]
  },
  {
    description: 'handle cariage returns before sequences',
    actual: testCase('\r\u001b[K\u001b[H   if (text.includes').sequenceCodes,
    expected: ['CR', 'EL', 'CUP']
  },
  {
    description: 'handles RI, which does not start with CSI',
    actual: testCase('\u001bM').sequenceCodes,
    expected: ['RI']
  },
  {
    description: 'can handle deletion of lines without parameters',
    actual: testCase('\u001b[M').sequenceParameters,
    expected: [[]]
  },
  {
    description: 'handles ambiguous sequences',
    actual: testCase('\u001b[M\u001b[r\u001b[Maaa\u001b[r').sequenceCodes,
    expected: ['DL', 'DECSTBM', 'nml_tracking', 'DECSTBM']
  },
  {
    description: 'will not return partial sequences',
    actual: testCase('\u001b[1;2;3;').sequenceCodes,
    expected: []
  },
  {
    description: 'can capture mouse tracking sequence codes',
    actual: testCase('\u001b[Mabc').sequenceCodes,
    expected: ['nml_tracking']
  },
  {
    description: 'does not capture mouse tracking as text',
    actual: testCase('\u001b[Maaa\u001b[Mccc\u001b[Mbbb').texts,
    expected: []
  },
  {
    description: 'can capture mouse tracking sequence codes and all characters',
    actual: testCase('\u001b[Maaa\u001b[Mccc\u001b[Mbbb').sequenceChars,
    expected: ['aaa', 'ccc', 'bbb']
  },
])
