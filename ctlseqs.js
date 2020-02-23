
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

function createSeq (name) {
  return {
    name: 'SEQ'
  }
}

/**
 * Decode a string of bytes into graphic characters and control sequences
  */
function getSeqs (str) {
  return []
}

console.info('running')

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
  DECSTBM: 'CSI Ps ; Ps r',
  restore_DECSET: 'CSI ? Pm r',
  DECCARA: 'CSI Pt ; Pl ; Pb ; Pr ; Ps $ r',
  reverse_DECCARA: 'CSI Pt ; Pl ; Pb ; Pr ; Ps $ t',
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
    .replace(/P[a-z]/, 'Pm')
    .replace(/ ; P./g, '')
    .split(' ')

  // Return true if p is a prefix of prms.
  const test = (p) => {
    if (p === '\u001b') return { code: keys[ix] }

    if (p === '\u001b[') return { code: keys[ix] }
    if (p[0] !== '\u001b' || p[1] !== '[') return false
    p = p.slice(2)

    const rest = [...prms]
    let params = []
    while (rest.length > 0) {
      const k = rest.shift()
      switch (k) {
        case 'Pm': {
          const match = p.match(/^[0-9;]+/)
          if (!match) {
            // try without parameters
            continue
          }
          params = match[0].split(';')
          p = p.slice(match[0].length)
          break
        }
        case 'SP': {
          if (p[0] !== ' ') return false
          p = p.slice(1)
          break
        }
        default: {
          if (p[0] !== k) return false
          p = p.slice(1)
        }
      }
      if (p.length === 0) {
        return {
          params: params.map(Number),
          code: keys[ix]
        }
      }
    }
  }

  return {
    test,
    code: keys[ix]
  }
})

const tests = [
  ESC + '[m',
  'test' + ESC + '[myo',
  ESC + '[1;2m',
  ESC + '[555555;4*y',
  ESC + '[$w',
  ESC + '[m',
  ESC + '[1;2;3;4;5;6;7;8;9;123;456m',
  ESC + '[1;2;3;4;5;m;7;8;9;123;456m',
  'test' + ESC + '[myo and some more' + ESC + '[5;4"pother',
  ESC + '[2 q',
  `\u001b7\u001b[?47h\u001b[?1h\u001b=\u001b[H\u001b[2J\u001b[?2004h\u001b[?1004h\u001b[8;59;189t\u001b[r\u001b[1;1H\u001b[m\u001b[38;5;252m\u001b[48;5;237m                                                                                                                                                                                             \r\n                                                                                                                                                                                             \r\n                                                                                                                                                                                             \r\n                                                                                                                                                                                             \r\n                                                                                                                                                                                 `,
  ESC + '[1;2;3;4mand' + ESC + '[1;2;3',
  'just text yo' + ESC + '[mtext',

  'abig' + ESC + '[M',
  '\r\u001b[K\u001b[H\u001bM   if (text.includes',
]

fns.push({ test: (p) => {
  // TODO better support for non CSI seqs
  if (p === '\u001bM') return { code: 'RI' }
}})

const getCodes = (s) => {
  return fns.map(({ test, k }) => {
    return test(s)
  }).filter(Boolean)
}

const singleCharCtl = {
  '\n': 'NL',
  '\r': 'CR',
  '\b': 'BS',
  '\t': 'HTS',
  '\u0007': 'BL'
}

const addText = (text) => {
  //log.info({debugg : { add_text: text }})
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
  //log.info({debugg : { add_text_outs: outs }})
  return outs
}

// TODO: Make not stateful?
let left = ''
const getCtlSeqs = (str) => {
  let outs = []

  if (left.length > 0) {
    //str = left + str
    left = ''
  }

  const ixCSI = str.indexOf(ESC)

  let rest = str

  // consume text up to first CSI
  if (ixCSI !== -1) {
    const text = str.slice(0, ixCSI)

    outs = outs.concat(addText(text))

    // consume up to first CSI
    rest = str.slice(ixCSI)
  } else {
    // assume this is unfinished CSI to be consumed later
    // TODO: could be unconsumed ESC sequence
    /*
    const ixESC = str.indexOf(ESC)

    if (ixESC !== -1) {
      left = left + str.slice(ixESC)

      return {
        outs: addText(str.slice(0, ixESC)),
        rest: str.slice(ixESC)
      }
    }
    */

    return {
      outs: addText(str)
    }
  }

  // consume as much if the rest as a control seq

  let test = ''

  // continue to ingest character by character until matching only one or none

  let matching = []
  let lastMatching
  let lastTest
  let i = -1
  do {
    i++

    // params
    test = test + rest[i]
    matching = getCodes(test)

    if (matching.length === 1) {
      lastMatching = matching[0]
      lastTest = test
    }
    //log.info({debugg : matching.length})
  } while (matching.length > 0 && i < rest.length - 1)

  if (lastMatching) {
    outs.push(lastMatching)
    rest = rest.slice(lastTest.length)
  } else {
  // Slice even if there was no match so that we don't get stuck
  // on unrecognised sequences
    if (matching.length === 0) {
      rest = rest.slice(i + 1)
    }
  }
  //log.info({debugg: { rest_now: rest }})

  // TODO have a long think about the different scenarios here
  // because there aren't that many and mostly involve
  // data being consumed without it's preceding data being
  // present.
  //
  // So literally one option is to "wait" until data has been
  // buffered in before consuming it.
  //
  // A program shouldn't expect to render correctly until it delivers
  // all the data required, so it's fine to wait and also avoids pointless
  // work to determine that, no this unfinished sequence doesn't
  // match anything.

  // After matching an entire sequence, there might just be
  // only CSI left, so set left to that and return so that
  // it can be consumed next time
  /*
  if (rest === CTL.CSI.str) {
    left = rest
    return {
      str,
      outs,
      rest
    }
  }

  // The test had matches but not exactly one, and
  // it was entirely consumed so consider it unfinished.
  if (matching.length > 0) {
  // if (i === rest.length && !lastMatching ) {
    //log.info({debugg : { maybe_add_to_left: test }})
    left = CTL.CSI.str + test
    return {
      str,
      outs,
      rest//: CTL.CSI.str + test
    }
  }

  // After matching an entire sequence and finding exactly one
  // match, there was some left over, so recurse to continue
  // finding more sequences
  if (rest.length >= 0) {
    //log.info({debugg : { rest_after_seq: rest }})
    const next = getCtlSeqs(rest)
    outs = outs.concat(next.outs)
    rest = next.rest
  }
  */
  //console.info({rest, str})
  if (rest.length !== str.length) {
    //log.info({debugg : { rest_after_seq: rest }})
    const next = getCtlSeqs(rest)
    outs = outs.concat(next.outs)
    rest = next.rest
  }

  return {
    str,
    outs,
    rest
  }
}

const res = tests.map(getCtlSeqs)

console.info(JSON.stringify(res,null,2))

module.exports = {
  getCtlSeqs
}

// get all CSIs and parameters:
//  grep '\(CSI.* .\|.*([A-Z]*)\|.*P.\s.*\)' -o ctlseqs.txt | less
// get all CSIs
//  grep '\(CSI.* .\|.*([A-Z]*)\)' -o ctlseqs.txt | less

// vim: tw=80
