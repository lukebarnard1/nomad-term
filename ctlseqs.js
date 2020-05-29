const log = require('./log')

const ESC = '\u001b'

// Control Characters
const CTL = {
  CSI: {
    desc: 'Control Sequence Introducer',
    str: ESC + '['
  },
  IND: {
    str: ESC + 'D',
    desc: 'Index'
  },
  NEL: {
    str: ESC + 'E',
    desc: 'Next Line'
  },
  HTS: {
    str: ESC + 'H',
    desc: 'Tab Set'
  },
  RI: {
    str: ESC + 'M',
    desc: 'Reverse Index'
  },
  SS2: {
    str: ESC + 'N',
    desc: 'Single Shift Select of G2 Character Set'
  },
  SS3: {
    str: ESC + 'O',
    desc: 'Single Shift Select of G3 Character Set'
  },
  DCS: {
    str: ESC + 'P',
    desc: 'Device Control String'
  },
  SPA: {
    str: ESC + 'V',
    desc: 'Start of Guarded Area'
  },
  EPA: {
    str: ESC + 'W',
    desc: 'End of Guarded Area'
  },
  SOS: {
    str: ESC + 'X',
    desc: 'Start of String'
  },
  DECID: {
    str: ESC + 'Z',
    desc: 'Return Terminal ID'
  },
  ST: {
    str: ESC + '\\',
    desc: 'String Terminator'
  },
  OSC: {
    str: ESC + ']',
    desc: 'Operating System Command'
  },
  PM: {
    str: ESC + '^',
    desc: 'Privacy Message'
  },
  APC: {
    str: ESC + '_',
    desc: 'Application Program Command'
  }
}

log.info('running')

const CTL_SEQS = {
  ICH: 'CSI Ps @',
  SL: 'CSI Ps SP @',
  CUU: 'CSI Ps A',
  SR: 'CSI Ps SP A',
  CUD: 'CSI Ps B',
  CUF: 'CSI Ps C',
  CUB: 'CSI Ps D',
  CNL: 'CSI Ps E',
  CPL: 'CSI Ps F',
  CHA: 'CSI Ps G',
  CUP: 'CSI Ps ; Ps H',
  CHT: 'CSI Ps I',
  ED: 'CSI Ps J',
  DECSED: 'CSI ? Ps J',
  EL: 'CSI Ps K',
  DECSEL: 'CSI ? Ps K',
  IL: 'CSI Ps L',
  DL: 'CSI Ps M',
  DCH: 'CSI Ps P',
  SU: 'CSI Ps S',
  SD: 'CSI Ps T',
  SD2: 'CSI Ps ^',
  mouse_tracking: 'CSI Ps ; Ps ; Ps ; Ps ; Ps T',
  nml_tracking: 'CSI M Pchar',
  ECH: 'CSI Ps X',
  CBT: 'CSI Ps Z',
  HPA: 'CSI Pm `',
  HPR: 'CSI Pm a',
  REP: 'CSI Ps b',
  VPA: 'CSI Pm d',
  VPR: 'CSI Pm e',
  HVP: 'CSI Ps ; Ps f',
  TBC: 'CSI Ps g',
  SM: 'CSI Pm h',
  RM: 'CSI Pm l',
  DECSET: 'CSI ? Pm h',
  DECRST: 'CSI ? Pm l',
  MC: 'CSI Pm i',
  MC2: 'CSI ? Pm i',
  SGR: 'CSI Pm m',
  DSR: 'CSI Ps n',
  DSR_DEC: 'CSI ? Ps n',
  DECSTR: 'CSI ! p',
  DECSCL: 'CSI Pl ; Pc " p',
  DECRQM: 'CSI Ps $ p',
  DECSCUSR: 'CSI Ps SP q',
  DECSCA: 'CSI Ps " q',
  DECSTBM: 'CSI Ps r',
  restore_DECSET: 'CSI ? Pm r',
  DECCARA: 'CSI Pt ; Pl ; Pb ; Pr ; Ps $ r',
  reverse_DECCARA: 'CSI Pt ; Pl ; Pb ; Pr ; Ps $ t',
  window_management: 'CSI Ps ; Ps ; Ps t',
  SCOSC: 'CSI s',
  restore_SCOSC: 'CSI u',
  DECSLRM: 'CSI Pl ; Pr s',
  save_DECSET: 'CSI ? Pm s',
  DECCRA: 'CSI Pt ; Pl ; Pb ; Pr ; Pp ; Pt ; Pl ; Pp $ v',
  DECRQPSR: 'CSI Ps $ w',
  DECEFR: 'CSI Pt ; Pl ; Pb ; Pr \' w',
  DECREQTPARM: 'CSI Ps x',
  DECSACE: 'CSI Ps * x',
  DECFRA: 'CSI Pc ; Pt ; Pl ; Pb ; Pr $ x',
  XTCHECKSUM: 'CSI Ps # y',
  DECRQCRA: 'CSI Pi ; Pg ; Pt ; Pl ; Pb ; Pr * y',
  DECELR: 'CSI Ps ; Pu \' z',
  DECERA: 'CSI Pt ; Pl ; Pb ; Pr $ z',
  DECSLE: 'CSI Pm \' {',
  DECSERA: 'CSI Pt ; Pl ; Pb ; Pr $ {',
  XTREPORTSGR: 'CSI Pt ; Pl ; Pb ; Pr # |',
  DECSCPP: 'CSI Ps $ |',
  DECRQLP: 'CSI Ps \' |',
  DECSNLS: 'CSI Ps * |',
  DECIC: 'CSI Pm \' }',
  DECDC: 'CSI Pm \' ~'
}

const keys = Object.keys(CTL_SEQS)
const vals = Object.values(CTL_SEQS)
const fns = vals.map((s, ix) => {
  const prms = s
  // MUST remove CSI AND a space
    .replace(/^CSI /, '')
    .replace(/P[a-z] /, 'Pm ')
    .replace(/ ; P./g, '')
    .split(' ')

  const exps = prms.map((prm, i) => new RegExp(
    '^' +
    prms.slice(0, i + 1).map(k =>
      ({
        Pchar: '(?<Pchar>[^\u001b]*)',
        Pm: '(?<Pm>[0-9;]*)',
        SP: ' '
      }[k] || `[\\\\${k}]`)
    ).join('') +
    '$'
  )).slice(1)

  const n = new RegExp('^[0-9;]+$')

  const fTest = prms[0] === 'Pm' ? (p) => n.test(p) : () => false

  // Return true if p is a prefix of prms.
  const test = (p) => {
    if (fTest(p)) {
      return { code: keys[ix] }
    }

    const results = exps.map(e => e.exec(p))
    const matching = results.filter(r => r)
    const result = matching[matching.length - 1]
    if (result && result[0].length && result[0].length <= p.length) {
      const { groups } = result
      const params = groups && groups.Pm ? groups.Pm.split(';').map(Number) : []
      const chars = groups && groups.Pchar ? groups.Pchar : ''
      const rest = { length: results.length - results.indexOf(result) - 1 }
      const returning =
      {
        chars,
        params: [...params],
        code: keys[ix],
        rest
      }
      return returning
    } else {
      return false
    }
  }

  return {
    test,
    code: keys[ix]
  }
})

const r = new RegExp('^\u001b\\[?$')
const cache = new Map()

const getCodes = (s) => {
  if (r.test(s)) {
    return { some: true }
  }
  // TODO: better support for non-CSI seqs
  if (s === '\u001bM') return { exact: { code: 'RI', rest: [] } }
  // FIXME: Don't cache DL - it's an ambiguous prefix of nml_tracking
  if (s === '\u001b[M') return { some: true, exact: { code: 'DL', params: [], rest: [] } }

  const matches = []

  const rest = s.slice(2)

  if (cache.has(s)) {
    return { exact: { ...cache.get(s), params: cache.get(s).params.slice(0) } }
  }

  let i = 0
  while (matches.length < 2 && i < fns.length) {
    const res = fns[i].test(rest)
    if (res) {
      matches.push(res)
    }
    i++
  }

  const first = matches[0]
  const exact = first && first.rest && first.rest.length === 0 && first

  if (exact) {
    cache.set(s, { ...exact, params: exact.params.slice(0) })
  }

  return {
    some: matches.length > 0,
    exact,
    none: matches.length === 0
  }
}

const singleCharCtl = {
  '\n': 'NL',
  '\r': 'CR',
  '\b': 'BS',
  '\t': 'HTS',
  '\u0007': 'BL'
}

const addText = (text) => {
  if (text.includes('\u001b')) return []
  if (text.length === 0) {
    return []
  }
  const outs = []
  let t = ''
  text.split('').map(s => {
    const scc = singleCharCtl[s]
    if (scc) {
      if (t.length > 0) {
        outs.push({ text: t })
        t = ''
      }
      outs.push({ code: scc })
    } else {
      t = t + s
    }
  })
  outs.push({ text: t })
  return outs
}

const getCtlSeqs = (str) => {
  if (typeof str !== 'string') throw new Error('this is not a string')
  // List of output sequences/text
  let outs = []

  // The remaining data that has not been converted to
  // control sequences or text
  let rest = str
  let prevRest

  do {
    prevRest = rest
    // consume text up to first ESC
    const ixESC = rest.indexOf(ESC)
    if (ixESC !== -1) {
      const text = rest.slice(0, ixESC)

      // concat is very expensive
      if (text.length) {
        outs = outs.concat(addText(text))
      }

      // The remainder to be processed is after the text
      rest = rest.slice(ixESC)
    } else {
    // this is probably all text given lack of ESC
      return {
        outs: [...outs, ...addText(rest)]
      }
    }
    // Test for sequences adding character by character
    // to find the longest exact match
    let test = ''
    let lastMatching
    let lastTest
    let i = -1
    let none, exact, some
    do {
      i++
      test = rest.slice(0, i + 1)

      const codeResult = getCodes(test)
      none = codeResult.none
      some = codeResult.some
      exact = codeResult.exact

      if (exact) {
        lastMatching = exact
        lastTest = test
      }
    } while (some && i < rest.length - 1)

    if (lastMatching) {
      outs.push(lastMatching)
      rest = rest.slice(lastTest.length)
    } else {
      // Slice even if there was no match so that we don't get stuck
      // on unrecognised sequences
      if (none) {
        rest = rest.slice(i + 1)
      }
    }
  } while (rest.length !== prevRest.length)

  return {
    str,
    outs,
    rest
  }
}

module.exports = {
  getCtlSeqs
}

// get all CSIs and parameters:
//  grep '\(CSI.* .\|.*([A-Z]*)\|.*P.\s.*\)' -o ctlseqs.txt | less
// get all CSIs
//  grep '\(CSI.* .\|.*([A-Z]*)\)' -o ctlseqs.txt | less

// vim: tw=80
