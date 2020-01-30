
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
    .replace(/P./, 'Pm')
    .replace(/ ; P./g, '')
    .split(' ')

  // Return true if p is a prefix of prms.
  const test = (p) => {
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
  'test' + ESC + '[myo and some more' + ESC + '[5;4"pother'
]

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
}

const addText = (text) => {
  log.info({addText: text})
  const outs = []
  let t = ''
  text.split('').map(s => {
    const scc = singleCharCtl[s]
    if (scc) {
      if (t.length > 0) {
        log.info({t})
        outs.push({ text: t })
        t = ''
      }
      outs.push({ code: scc })
    } else {
      t = t + s
      log.info({t})
    }
  })
  outs.push({ text: t })
  return outs
}

const getCtlSeqs = (str) => {
  let outs = []


  const ixCSI = str.indexOf(CTL.CSI.str)

  let rest = str

  // consume text up to first CSI
  if (ixCSI !== -1) {
    const text = str.slice(0, ixCSI)

    outs = outs.concat(addText(text))

    // consume first CSI
    rest = str.slice(ixCSI + CTL.CSI.str.length)
  } else {
    return {
      outs: addText(str)
    }
  }

  // consume as much if the rest as a control seq

  let test = ''

  // continue to ingest character by character until matching only one or none

  let matching = []
  let lastMatching
  let i = -1
  do {
    i++

    // params
    test = test + rest[i]
    matching = getCodes(test)

    if (matching.length === 1) {
      lastMatching = matching[0]
    }
  } while (matching.length > 0 && i < rest.length)

  if (lastMatching) {
    outs.push(lastMatching)
  }

  rest = rest.slice(i)

  if (rest.length > 0) {
    outs = outs.concat(getCtlSeqs(rest).outs)
  }

  return {
    str,
    outs
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
