
const pty = require('node-pty')
const log = require('./log')
const os = require('os')

const { SubTerminal: OldSubTerminal } = require('./old-subterminal')

const { getCtlSeqs } = require('./ctlseqs')

function uniqueId () {
  return Math.random().toString(36).slice(2)
}

function filterParentEnv ({
  SSH_AUTH_SOCK,
  HOME,
  LANG
}) {
  return {
    // Set name of the terminal to nomad!
    TERM_PROGRAM: 'nomad_term',
    // Proxy ssh-agent socket location as a convenience. This allows interaction
    // with the same ssh-agent that was in use by the parent shell.
    SSH_AUTH_SOCK,
    // Proxy HOME directory variable
    HOME,
    // Proxy LANG (e.g. en_GB.UTF-8 - vim uses this)
    LANG
  }
}

function createSubTerminal (renderCb, opts) {
  const { onProcData = null, id = null, compareWithOld = false } = opts || {}
  const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash'
  const proc = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    cwd: process.env.HOME,
    env: filterParentEnv(process.env)
  })
  const st = new SubTerminal(
    proc.write.bind(proc),
    proc.resize.bind(proc),
    renderCb
  )

  st.id = id || st.id
  proc.on('data', data => st.write(data))

  const sts = [st]

  if (compareWithOld) {
    const oldSt = new OldSubTerminal(
      proc.write.bind(proc),
      proc.resize.bind(proc),
      renderCb
    )
    oldSt.resize(10, 10)
    oldSt.id = 'old_' + (id || oldSt.id)

    proc.on('data', data => oldSt.write(data))

    sts.push(oldSt)
  }

  if (onProcData) {
    proc.on('data', onProcData)
  }

  return sts
}

// TODO: Make SubTerminal much easier to test
// TODO: Add tests for
//        - text buffer insertion
//        - scrolling
//        - clearing the screen
//        - inserting formats
class SubTerminal {
  constructor (writeProcCb, resizeCb, renderCb) {
    this.id = uniqueId()
    this.writeProcCb = writeProcCb
    this.resizeCb = resizeCb
    this.renderCb = () => renderCb(this.id)

    const w = 10000
    const h = 10000

    // Lines of the buffer
    this.buffer = {
      // 0: String
      // 2: String
    }

    // Lines of buffer that has been scrolled out of view
    this.oldBuffer = []

    this.scrollY = 0
    // TODO: accelerated scrolling
    this.scrollSpeed = 3

    // TODO: DECSET/DECRST
    this.flags = {}

    this.formatBuffer = {
      // 0: {
      //   fg: {
      //     color: 123,
      //     bright: false,
      //   },
      //   bg: { ... },
      //   underline: false,
      //   negative: false
      // }
    }

    this.cursor = {
      x: 0,
      y: 0
    }

    // Effective maximum size of viewport
    this.dimension = { w, h }
    this.size = { cols: w, rows: h }

    this.setScrollMargins()

    this.inputBuffer = Buffer.alloc(10000)
    this.inputBufferIx = 0

    this.modes = {
      // 'MODE': false
    }
  }

  getLine (row) { return this.buffer[row] }
  getCursorPosition () { return this.cursor }

  writeToProc (data) {
    // Disable "DL" because there's a bug in ctlseqs that mistakes it for mouse
    // tracking and will cause the next sequence to break
    const seqs = getCtlSeqs(data.toString('utf8'), ['DL']).outs

    log.info({
      seqs
    })

    const [seq] = seqs
    if (seq) {
      switch (seq.code) {
        case 'nml_tracking':

          // If DECCKM and "Alternate Buffer", send mouse events to the
          // program... Not sure why.
          if (this.flags[1]) { // && this.flags[47]) {
            const c = {
              '`': '\u001bOA',
              a: '\u001bOB'
            }[seq.chars[0]]
            log.info({ sendingToProc: c })
            if (c) this.writeProcCb(c)
            return
          }

          switch (seq.chars[0]) {
            case 'a': // scroll up
              this.scrollY = (this.scrollY || 0) - this.scrollSpeed
              if (this.scrollY < 0) this.scrollY = 0
              break
            case '`': // scroll down
              this.scrollY = (this.scrollY || 0) + this.scrollSpeed
              if (this.scrollY > this.oldBuffer.length) this.scrollY = this.oldBuffer.length
              break
          }

          this.render()
          return
        case 'CUP': // up
          // this.updateScrollRegion(-1)
          break
        case 'CUD': // down
        // this.updateScrollRegion(1, 0)
          break
      }
    }

    this.writeProcCb(data)
  }

  setDimension ({ w, h }) {
    this.dimension = { w, h }
  }

  // TODO: WRAPPING!
  resize (cols, rows) {
    log.info({ resize: { cols, rows }, c: this.cursor, sc: this.scrollY })

    this.resizeCb(cols, rows)
    if (this.size.cols === cols && this.size.rows === rows) return
    this.size = { cols, rows }

    // After first resize, set default scroll margins
    this.setScrollMargins()
  }

  setCursor (y, x) {
    this.cursor = { x, y }

    log.info({ cursor: this.cursor })
  }

  // Set the scrolling margins of the screen. Rows outside of this
  // region are not affected by scrolling.
  setScrollMargins (t = 1, b = this.size.rows) {
    this.scrollMargins = { t: t - 1, b: b - 1 }
  }

  isWithinScrollMargins (i) {
    return i >= this.scrollMargins.t && i <= this.scrollMargins.b
  }

  getDeltaOutOfScrollMargins (i) {
    if (i > this.scrollMargins.b) {
      return i - this.scrollMargins.b
    } else if (i < this.scrollMargins.t) {
      return i - this.scrollMargins.t
    }
    return 0
  }

  // Scroll lines in the scroll region by d
  updateScrollRegion (d) {
    log.info({ scrollingBy: d })

    // Scroll to the bottom because the program is trying to show us something :)
    this.scrollY = 0

    const newBuffer = {}
    const newFormatBuffer = {}
    for (let ix = 0; ix < this.size.rows; ix++) {
      if (this.isWithinScrollMargins(ix)) {
        if (this.isWithinScrollMargins(ix + d)) {
          newBuffer[ix] = this.buffer[ix + d] || ''
        } else {
          newBuffer[ix] = ''
        }
        newFormatBuffer[ix] = this.formatBuffer[ix + d] || []
      } else {
        newBuffer[ix] = this.buffer[ix] || ''
        newFormatBuffer[ix] = this.formatBuffer[ix] || []
      }
    }

    // If there are lines being scrolled off the top of the buffer, add them to
    // the oldBuffer
    if (d > 0) {
      for (let ix = 0; ix < d; ix++) {
        if (typeof this.buffer[ix] !== 'string') {
          continue
        }
        this.oldBuffer.push({
          line: this.buffer[ix].slice(0).replace(/[\n\r]/g, '') + ' ',
          fmt: this.formatBuffer[ix]
        })
      }
    }

    this.buffer = newBuffer
    this.formatBuffer = newFormatBuffer
  }

  // Delete n lines from the buffer starting at cursor y
  deleteLines (n) {
    const save = this.scrollMargins.t
    this.scrollMargins.t = this.cursor.y
    this.updateScrollRegion(n)
    this.scrollMargins.t = save
  }

  deleteCharacter (n) {
    const { x, y } = this.cursor
    const oldLine = this.buffer[y]
    this.buffer[y] = oldLine.slice(0, x) + oldLine.slice(x + n)
  }

  // Insert n lines above the cursor
  insertLines (n) {
    const save = this.scrollMargins.t
    this.scrollMargins.t = this.cursor.y
    this.updateScrollRegion(-n)
    this.scrollMargins.t = save
  }

  setFormat (params) {
    // Set the current parameters for the format of inserted text
    const newFormat = {
      ...this.format,
      ...this.getFormatChange(params, true)
    }
    this.format = newFormat
  }

  getFormatChange (params, initial = false) {
    const reset = {
      bright: false,
      faint: false,
      italics: false,
      underline: false,
      dbl_underline: false,
      blink: false,
      negative: false,
      invisible: false,
      strikeout: false,
      fg: {},
      bg: {}
    }
    if (params.length === 0) {
      return initial ? reset : {}
    }

    const first = params.shift()

    let bright
    const flagChange = {
      0: reset,
      1: { bright: true },
      2: { faint: true },
      22: { bright: false, faint: false },
      3: { italics: true },
      23: { italics: false },
      4: { underline: true },
      21: { dbl_underline: true },
      24: { underline: false, dbl_underline: false },
      5: { blink: true },
      25: { blink: false },
      7: { negative: true },
      27: { negative: false },
      8: { invisible: true },
      28: { invisible: false },
      9: { strikeout: true },
      29: { strikeout: false }
    }[first]

    if (flagChange) {
      return {
        ...flagChange,
        ...this.getFormatChange(params)
      }
    }

    const colors = [
      'black',
      'red',
      'green',
      'yellow',
      'blue',
      'magenta',
      'cyan',
      'white',
      // Last two are special
      'extended', // takes multiple parameters
      'default' // resets to default
    ]

    // 30 - 39 foreground non-bold
    // 90 - 97 foreground bold
    // 40 - 49 background non-bold
    // 100 - 107 background bold
    let fg
    let start = 0
    if (first >= 30 && first <= 39) {
      fg = true
      bright = false
      start = 30
    } else
    if (first >= 90 && first <= 97) {
      fg = true
      bright = true
      start = 90
    } else
    if (first >= 40 && first <= 49) {
      fg = false
      bright = false
      start = 40
    } else
    if (first >= 100 && first <= 107) {
      fg = false
      bright = true
      start = 100
    }

    let colorChange = {}

    if (start) {
      const colorIx = first - start
      const color = colors[colorIx]

      if (color === 'default') {
        colorChange = fg ? { fg: {} } : { bg: {} }
      } else if (color === 'extended') { // first = 38 or 48
        const second = params.shift()
        if (second === 5) {
          // extended indexed
          const color = params.shift()
          colorChange = fg ? { fg: { color } } : { bg: { color } }
        } else if (second === 2) {
          // extended RBG
          //  ignore first param "Pi"
          //  next 3 are R, G, B
          params.shift()
          const color = params.splice(0, 3)
          colorChange = fg ? { fg: { color_rgb: color } } : { bg: { color_rgb: color } }
        } else {
          params.unshift(second)
        }
      } else {
        colorChange = fg ? {
          fg: { bright, color_ix: colorIx }
        } : {
          bg: { bright, color_ix: colorIx }
        }
      }
    }

    // This is a new object everytime, so we can reuse this.format
    return {
      ...colorChange,
      ...this.getFormatChange(params)
    }
  }

  moveCursor (y, x) {
    log.info({ moveCursor: { x, y } })
    const cappedX = Math.max(Math.min(this.cursor.x + x, this.size.cols), 0)
    const cappedY = Math.max(Math.min(this.cursor.y + y, this.size.rows), 0)

    this.cursor = { x: cappedX, y: cappedY }
  }

  clearBuffer () {
    // Fix for exiting full-screen programs
    this.cursor.x = 0
    this.cursor.y = 0
    this.buffer = {}
    this.formatBuffer = {}
  }

  clearEntireLine () {
    const { x, y } = this.cursor
    const bufY = y

    this.buffer[bufY] = undefined
    this.formatBuffer[bufY] = undefined
  }

  clearLine (right) {
    const { x, y } = this.cursor
    const bufY = y

    if (!this.buffer[bufY]) return
    this.buffer[bufY] = right
      ? this.buffer[bufY].slice(0, this.cursor.x)
      : this.buffer[bufY].slice(this.cursor.x)

    this.addFormat(bufY, right
      ? {
        start: this.cursor.x,
        length: this.dimension.w,
        format: {}
      }
      : {
        start: 0,
        length: this.cursor.x,
        format: {}
      }
    )
  }

  clearScreen (below) {
    const { y } = this.cursor
    const kept = {}
    const formatTop = {}
    const keys = Object.keys(this.buffer)
    const highestIx = parseInt(keys[keys.length - 1])

    // Clearing
    //  - below: keep the top (0 to y)
    //  - above: keep the bottom (y to highest)
    const keepStart = below ? 0 : (y + 1)
    const keepEnd = below ? y : highestIx

    for (let i = keepStart; i < keepEnd; i++) {
      kept[i] = this.buffer[i]
      formatTop[i] = this.formatBuffer[i]
    }
    this.buffer = kept
    this.formatBuffer = formatTop
  }

  checkScroll () {
    const d = this.getDeltaOutOfScrollMargins(this.cursor.y)
    if (d !== 0) {
      this.updateScrollRegion(d)
      this.cursor.y = this.cursor.y - d
    }
  }

  setMode (mode, v) {
    this.modes[mode] = v
  }

  reduceTerminalAction (seq) {
    log.info({ seq })

    if (seq.text) {
      this.insertText(seq.text)
      return
    }

    if (!seq.code) return

    const params = seq.params || []
    const count = params[0] || 1

    const action = { match: [] }

    // TODO: do TDD to check each of these affect the terminal as expected
    // CUP HVP
    if (seq.code === 'HVP' || seq.code === 'CUP') {
      this.setCursor((params[0] || 1) - 1, (params[1] || 1) - 1)
    } else if (action.whole_match === '\u0007') {
      // bell
    } else if (seq.code === 'CR') {
      this.setCursor(this.cursor.y, 0)
    } else if (seq.code === 'NL') {
      this.cursor.y += 1

      this.checkScroll()
    } else if (seq.code === 'RI') {
      this.cursor.y -= 1

      this.checkScroll()
    } else if (seq.code === 'BS') {
      this.cursor.x -= 1
    } else if (seq.code === 'HTS') {
      const tabWidth = 8
      const x = tabWidth + this.cursor.x - (this.cursor.x % tabWidth)
      this.setCursor(this.cursor.y, x)
    } else if (seq.code === 'CUU') {
      this.moveCursor(-count, 0)
    } else if (seq.code === 'CUD') {
      this.moveCursor(count, 0)
    } else if (seq.code === 'CUF') {
      this.moveCursor(0, count)
    } else if (seq.code === 'CUB') {
      this.moveCursor(0, -count)
    } else if (seq.code === 'CNL') {
      this.setCursor(this.cursor.y + count, 0)
    } else if (seq.code === 'DL') {
      this.deleteLines(count)
    } else if (seq.code === 'IL') {
      this.insertLines(count)
    } else if (seq.code === 'EL') {
      switch (parseInt(params[0])) {
        case 1:
          this.clearLine(false)
          break
        case 2:
          this.clearEntireLine()
          break
        case 0:
        default:
          this.clearLine(true)
          break
      }
    } else if (seq.code === 'DCH') {
      this.deleteCharacter(params[0])
    } else if (seq.code === 'DECSTBM') {
      this.setScrollMargins(params[0], params[1])
    } else if (seq.code === 'DECSET') {
      this.flags[params[0]] = true
    } else if (seq.code === 'DECRST') {
      this.flags[params[0]] = false
    } else if (seq.code === 'ED') {
      // CSI Ps J  Erase in Display (ED), VT100.
      //   Ps = 0  ⇒  Erase Below (default).
      //   Ps = 1  ⇒  Erase Above.
      //   Ps = 2  ⇒  Erase All.
      //   Ps = 3  ⇒  Erase Saved Lines, xterm.
      switch (parseInt(params[0])) {
        case 1:
          this.clearLine(false)
          this.clearScreen(false)
          break
        case 2:
          this.clearBuffer()
          break
        case 0:
        default:
          this.clearScreen(true)
          break
      }
    } else if (seq.code === 'CHA') {
      this.setCursor(this.cursor.y, params[0] - 1)
    } else if (seq.code === 'SGR') {
      this.setFormat(params)
    } else if (seq.code === 'SM' || seq.code === 'RM') {
      // Set Mode (SM), Reset Mode (RM)
      const shouldSet = seq.code === 'SM'
      switch (params[0]) {
        case 4:
          this.setMode('IRM', shouldSet)
          break
      }
    } else {
      log.info({ unsupported: { seq } })
    }
  }

  drawSubTerminal (w, h, { highlight, isFocussed }) {
    const lines = []

    const keys = Object.keys(this.buffer)
    const l = parseInt(keys[keys.length - 1])

    for (let i = 0; i < h; i++) {
      let line = Buffer.alloc(w, ' ')
      let formats = []

      // Offset to make sure that the last `h` lines of the buffer
      // are drawn, so that the view looks correct after a resize
      const d = h - l - 1

      const bufY = i - (this.scrollY || 0) - d

      if (bufY < 0 && this.oldBuffer[this.oldBuffer.length + bufY - 1]) {
        const oldEl = this.oldBuffer[this.oldBuffer.length + bufY]
        line = oldEl.line
        formats = oldEl.fmt
      } else
      if (this.buffer[bufY]) {
        line = this.buffer[bufY]
        formats = this.formatBuffer[bufY] || []
      }

      const originalLine = line.toString('utf8').trimEnd()
      line = originalLine.toString('utf8').slice(0, w)
      line = line + (line.length < w ? Buffer.alloc(w - line.length, ' ') : '')

      // TODO: allow programs to hide cursor
      if (bufY === this.cursor.y && isFocussed) {
        line = line.slice(0, this.cursor.x) + '_' + line.slice(this.cursor.x + 1)
      }

      if (highlight) {
        formats = [{ start: 0, length: w, format: { bg: { color: 7 }, fg: { color: 8 } } }]
      }

      // TODO: Pointless k => k ?
      line = this.applyFormats(line, formats.map(k => k))

      lines.push(line)

      let rest = originalLine
      // let offset = 0
      if (rest.length > w) {
        rest = rest.slice(w)
        const wrapped = rest.slice(0, w)
        /* TODO
        // offset += w
        const formatted =
          this.applyFormats(wrapped,
            formats
              .filter(k => k.start + k.length >= offset)
              .map(k => ({ ...k, start: k.start < offset ? 0 : k.start - offset }))
          )
        */
        lines.push(
          wrapped +
          (wrapped.length < w ? Buffer.alloc(w - wrapped.length, ' ') : '')
        )
      }
    }

    return lines.slice(-h)
  }

  applyFormats (str, formats = []) {
    const endSeq = '\u001b[m'
    str = str.toString('utf8')

    let result = ''
    let cursorIx = 0

    let first = formats.shift()

    // TODO: (bug) why is first.format undefined?
    // it's probably supposed to - it should mean "remove format"
    while (first) {
      result += str.slice(cursorIx, first.start)
      result += getFormatSeq(first.format)
      result += str.slice(first.start, first.start + first.length)
      result += endSeq

      cursorIx = first.start + first.length
      first = formats.shift()
    }

    result += str.slice(cursorIx)

    function getFormatSeq (format) {
      // TODO make sure parameters are numbers
      const startSeq = (...params) => '\u001b[' + params.join(';') + 'm'
      let res = []

      if (!format) {
        return startSeq(0)
      }

      const invert = format.negative
      const { fg, bg } = invert
        ? { ...format, bg: format.fg, fg: format.bg }
        : format

      if (format.bright) {
        res.push(1)
      }
      if (format.faint) {
        res.push(2) // not = 22
      }

      if (format.italics) {
        res.push(3) // not = 23
      }

      if (format.underline) {
        res.push(4)
      }

      if (format.dbl_underline) {
        res.push(21) // not = 24
      }

      if (format.blink) {
        res.push(5) // not = 25
      }

      if (format.invisible) {
        res.push(8) // not = 28
      }

      if (bg) {
        if (bg.color) {
          res = [...res, 48, 5, bg.color]
        } else if (typeof bg.color_rgb === 'object' && bg.color_rgb.length === 3) {
          res = [...res, 48, 5, bg.color_rgb[0], bg.color_rgb[1], bg.color_rgb[2]]
        } else if (typeof bg.color_ix === 'number') {
          res = [...res, (bg.bright ? 100 : 40) + bg.color_ix]
        }
      }
      if (fg) {
        if (fg.color) {
          res = [...res, 38, 5, fg.color]
        } else if (typeof fg.color_rgb === 'object' && fg.color_rgb.length === 3) {
          res = [...res, 38, 5, fg.color_rgb[0], fg.color_rgb[1], fg.color_rgb[2]]
        } else if (typeof fg.color_ix === 'number') {
          res = [...res, (fg.bright ? 90 : 30) + fg.color_ix]
        }
      }

      return startSeq(...res)
    }

    return result
  }

  insertText (text) {
    if (text.includes('\u001b')) {
      log.error(new Error('insertText ESC ' + text))
      return
    }

    const shouldInsert = this.modes.IRM

    const bufX = this.cursor.x
    const bufY = this.cursor.y
    log.info({ text, bufX, bufY })

    // text could include cariage returns
    //   \n moves down
    //   \r goes back to start

    try {
      // TODO: Is -bufX needed
      const t = text.slice(0, this.dimension.w - bufX)

      let oldLine = this.buffer[bufY] || Buffer.alloc(this.size.cols, ' ')

      if (bufX + t.length - oldLine.length > 0) {
        oldLine = oldLine + Buffer.alloc(bufX + t.length - oldLine.length, ' ').toString('utf8')
      }

      const newBufferLine = oldLine.slice(0, bufX) + t + oldLine.slice(bufX + (shouldInsert ? 0 : t.length))

      this.buffer[bufY] = newBufferLine

      if (t.length > 0) {
        // TODO indent...
        this.addFormat(bufY, {
          start: bufX,
          length: t.length,
          format: this.format
        })
      }

      this.cursor.x += t.length
    } catch (e) {
      log.info({ ERROR: { m: e.message, s: e.stack.split('\n') }, bufX, bufY })
    }
  }

  addFormat (bufY, format) {
    this.formatBuffer[bufY] = reduceFormats(this.formatBuffer[bufY], format)
  }

  write (data) {
    const currentRest = this.rest || ''
    this.rest = ''

    // TODO: Some sequences can be mistaken for others that are a prefix
    // of themselves. E.g. DL is CSI Pm M , and can therefore be CSI M,
    // which can be mistaken for CSI M Pchar Pchar Pchar (nml_tracking).
    //
    // By disabling nml_tracking here and disabling DL elsewhere, this
    // bug is avoided.
    //
    // The better solution would be to do a different kind of matching
    // that isn't based on longest prefix. I think?
    const {
      outs: seqs,
      rest
    } = getCtlSeqs(currentRest + data.toString('utf8'), ['nml_tracking'])

    log.info({ data: data.toString('utf8'), seqs })

    if (rest) {
      this.rest = rest
    }

    seqs.forEach(s => this.reduceTerminalAction(s))

    this.render()
  }

  render () {
    this.renderCb()
  }
}

function removeAdjacent (fs) {
  const hashes = fs.map(f => JSON.stringify(f.format))

  const stack = []

  hashes.forEach((h, ix) => {
    const top = stack.pop()
    if (!top) {
      stack.push(fs[ix])
      return
    }

    const stackHash = JSON.stringify(top.format)

    if (stackHash === h && fs[ix].start === top.start + top.length) {
      top.length += fs[ix].length
      stack.push(top)
    } else {
      stack.push(top)
      stack.push(fs[ix])
    }
  })

  return stack
}

// TODO: Put this in it's own file
function reduceFormats (formats = [], format) {
  if (!format) return formats

  const within = (pos) => pos > format.start && pos < format.start + format.length

  const intersecting = (a, b) => {
    const sA = a.start
    const sB = b.start
    const fA = a.start + a.length
    const fB = b.start + b.length

    return (sA > sB && sA < fB) ||
           (sB > sA && sB < fA) ||
           (fA > sB && fA < fB) ||
           (fB > sA && fB < fA) ||
           (sA === sB && fA === fB)
  }

  if (formats.length === 0) return [format]

  const intersectingFormats = formats
    .sort((a, b) => a.start - b.start)
    .filter(f => {
      return intersecting(f, format)
    })
  const nonIntersectingFormats = formats
    .sort((a, b) => a.start - b.start)
    .filter(f => {
      return !intersecting(f, format)
    })

  const newIntersectingFormats = intersectingFormats.map(f => {
    // Diagrams to show the insertion of format and
    // it's effect on existing formats, f and the resulting
    // formats, r.
    //
    // format         |---------|
    // f0:              |--|
    // r0:            |---------|
    //
    // f1: |------------------------------|
    // r1: |----------|---------|---------|
    //
    // f2:                   |--------------|
    // r2:            |---------|-----------|
    //
    // f3: |--------------|
    // r3: |----------|---------|
    //
    // f4:            |---------|
    // r4:            |---------| (replaced with f)

    const startWithin = within(f.start)
    const endWithin = within(f.start + f.length)

    const isSame = f.start === format.start && f.length === format.length

    // f4
    if (isSame) {
      return [format]
    }

    // f0
    if (startWithin && endWithin) return []

    const fs = []
    let both = false

    if (f.start === format.start && f.length === format.length) {
      return []
    }

    // f1
    if (!startWithin && !endWithin) {
      both = true
    }

    let newStart, newLength
    // f2
    if (startWithin || both) {
      newStart = format.start + format.length
      newLength = f.start + f.length - newStart

      if (newLength > 0) {
        fs.push({
          start: newStart,
          length: newLength,
          format: f.format
        })
      }
    }

    // f3
    if (endWithin || both) {
      newStart = f.start
      newLength = format.start - f.start

      if (newLength > 0) {
        fs.push({
          start: newStart,
          length: newLength,
          format: f.format
        })
      }
    }
    return fs
  }).reduce((a, b) => a.concat(b), [])

  const result = [...nonIntersectingFormats, ...newIntersectingFormats, format].sort((a, b) => a.start - b.start)

  // TODO: Figure out why there are duplicates in the first place instead
  // of removing them
  //
  // Remove duplictes (bug)
  result.forEach((f, ix) => {
    result.forEach((f2, ix2) => {
      if (ix === ix2 || !f2 || !f) return
      if (f.start === f2.start && f.length === f2.length) {
        result[ix2] = null
      }
    })
  })

  return removeAdjacent(result.filter(f => f !== null))
}
module.exports = { createSubTerminal, reduceFormats, SubTerminal }
