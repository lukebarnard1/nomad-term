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
  DECDC: 'CSI Pm \' ~',
  OSC52: 'OSC 52 ; [csp] ; Pdat OSC_END',
  OSC52_P: 'OSC 52 ; [csp] ; ? OSC_END',
  OSC_GET_BG_COL: 'OSC 11 ; ? OSC_END',
  OSC_RST_CSR_COL: 'OSC 112 OSC_END',
  RI: 'ESC M',
  // TODO
  DECKPAM: 'ESC =', // Enter Keypad Application Mode (DEC Private)
  DECKPNM: 'ESC >', // Enter Keypad Numeric Mode (DEC Private)
  DECSC: 'ESC 7', // Save Cursor Position (DEC Private) - save cursor pos/style
  DECRC: 'ESC 8', // Restore Cursor Position (DEC Private)
  UNKNOWN: 'ESC ] 112 BEL',
  UNKNOWN_2: 'CSI > Pm m',
  HTS: 'ESC H'
}

const trie = { }

const keys = Object.keys(CTL_SEQS)

const reg = {
  Pm: new RegExp('^(?<Pm>[0-9]+)'),
  Pchar: new RegExp('^(?<Pchar>[^\u001b]{3})'),
  Pdat: new RegExp('^(?<Pdat>[^\u0007\u001b]+)')
}
const TOKEN_MATCH_FN = {
  OSC: (s) => s.startsWith(CTL.OSC.str) ? {consumed: 2} : {},
  CSI: (s) => s.startsWith(CTL.CSI.str) ? {consumed: 2} : {},
  Pchar: (s) => {
    const res = reg.Pchar.exec(s);
    return res ? { consumed: res[0].length, chars: res.groups.Pchar} : {};
  },
  Pdat: (s) => {
    const res = reg.Pdat.exec(s);
    return res ? { consumed: res[0].length, dat: res.groups.Pdat} : {};
  },
  // TODO: Generalise this a bit
  '[csp]': (s) => (s[0] === 'c' || s[0] === 's' || s[0] === 'p') ? {consumed: 1} : {},
  'OSC_END': (s) => {
    if(s[0] === '\u0007') return { consumed: 1 }
    if(s[0] === '\u001b' && s[1] === '\\') return { consumed: 2 }
  },
  'Pm': (s) => {
    const res = reg.Pm.exec(s);
    return {
      optional: true,
      ...(res ? { consumed: res[0].length, params: [Number(res.groups.Pm)]}: {})
    }
  }
}

function getMatchFn(token) {
  token = {
    SP: ' ',
    BEL: '\u0007',
    ESC: '\u001b'
  }[token] || token;
  const fn = TOKEN_MATCH_FN[token]
  if (fn) return fn;
  if (token.length === 1) {
    return (s) => {
      return s[0] === token ? { consumed: 1 } : {}
    };
  }
  if (token.length > 1) {
    return (s) => s.startsWith(token) ? { consumed: token.length } : {};
  }
  return () => {}
}

for (const key of keys) {
  const pattern = CTL_SEQS[key];
  const rest = pattern.split(' ')
  let node = trie;
  while (rest.length > 0) {
    let token = rest.shift();
    token = token.replace(/P[a-z]$/, 'Pm')
    // Token is already present on current node, use existing
    if (node[token]) {
      node = node[token]
    } else {
      // Token does not exist on node, add a stub for it
      let next = { _token: token, _matchFn: getMatchFn(token) };
      if (rest.length === 0) {
        // Indicate that this is a terminal token
        next._code = key;
      }
      if (token === 'Pm') {
        // This token can repeat the previous "Pm" any number of times
        // Give the trie structure a way of repeating itself by
        // circular reference
        next[';'] = {
          _token: ';',
          _matchFn: getMatchFn(';'),
          'Pm': next
        }
      }
      node[token] = next;
      node = next;
    }
  }
}

function getLongestMatchingCtlSeq(s) {
  // Walk the Trie to find the deepest matching path
  let pointers = [{node: trie, rest: s}];
  let longestMatch = null;
  while (pointers.length > 0) {
    const next = [];
    for (const p of pointers) {
      for (const k of Object.keys(p.node)) {
        if (k === '_token' || k === '_matchFn' || k === '_code') continue;
        // Check for a prefix match
        let {
          consumed,
          params,
          chars,
          optional
        } = p.node[k]._matchFn(p.rest);
        if (consumed > 0) {
          // Keep advancing each pointer if there's a match
          next.push({
            node: p.node[k],
            params: [...(p.params || []), ...(params || [])],
            chars: chars || p.chars,
            raw: (p.raw || '') + p.rest.slice(0, consumed),
            rest: p.rest.slice(consumed),
            consumed,
          });
        } else if (optional) {
          // Advance without consuming
          next.push({
            ...p,
            node: p.node[k],
          });
        }
      }
    }
    pointers = next;
    // At this point, some pointers will have reached a complete
    // pattern
    for (const p of pointers) {
      let match = null;
      if (p.node._code) {
        match = p;
        match.code = p.node._code;
      } else if (p.rest === '') {
        match = p
      }
      if (match && (!longestMatch || match.raw.length > longestMatch.raw.length)) {
        longestMatch = match;
      }
    }
  }
  return longestMatch;
}

const cache = new Map()

const getCodes = (s) => {
  const rest = s

  if (cache.has(s)) {
    const exact = cache.get(s)
    return { ...exact, params: exact.params.slice(0) }
  }

  const exact = getLongestMatchingCtlSeq(rest);

  if (exact) {
    cache.set(s, { ...exact, params: exact.params.slice(0) })
  }

  return exact ? {
    chars: exact.chars,
    code: exact.code,
    params: exact.params,
    text: exact.text,
    rest: exact.rest,
    raw: exact.raw
  } : null
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
    const match = getCodes(rest);

    if (match) {
      outs.push(match)
      rest = match.rest;
    } else {
      // Slice even if there was no match so that we don't get stuck
      // on unrecognised sequences
      // TODO: Really? Is this a good idea?
      rest = rest.slice(1)
    }
  } while (rest.length !== prevRest.length)

  return {
    str,
    outs,
    rest
  }
}

module.exports = {
  getCtlSeqs,
  CTL
}

// get all CSIs and parameters:
//  grep '\(CSI.* .\|.*([A-Z]*)\|.*P.\s.*\)' -o ctlseqs.txt | less
// get all CSIs
//  grep '\(CSI.* .\|.*([A-Z]*)\)' -o ctlseqs.txt | less

// vim: tw=80
