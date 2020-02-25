
const pty = require('node-pty')
const log = require('./log')
const os = require('os')

const { SubTerminal: OldSubTerminal } = require('./old-subterminal')

const { getCtlSeqs } = require('./ctlseqs')

function uniqueId () {
  return Math.random().toString(36).slice(2)
}

function createSubTerminal (renderCb, opts) {
  const { onProcData = null, id = null, compareWithOld = false } = opts || {}
  const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash'
  const proc = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    cwd: process.env.HOME,
    env: {
      HOME: process.env.HOME,
      PS1: process.env.PS1
    }
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

    this.inputBuffer = Buffer.alloc(10000)
    this.inputBufferIx = 0

    this.modes = {
      // 'MODE': false
    }
  }

  getLine (row) { return this.buffer[row] }
  getCursorPosition () { return this.cursor }

  writeToProc (data) {
    this.writeProcCb(data)
  }

  setDimension ({ w, h }) {
    this.dimension = { w, h }
  }

  // TODO: WRAPPING!
  resize (cols, rows) {
    log.info({ resize: { cols, rows } })

    this.resizeCb(cols, rows)
    if (this.size.cols === cols && this.size.rows === rows) return
    this.size = { cols, rows }

    // After first resize, set default scroll margins
    // TODO: set size during creation
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
    const newBuffer = {}
    const newFormatBuffer = {}
    for (let ix = 0; ix < this.size.rows; ix++) {
      if (this.isWithinScrollMargins(ix)) {
        if (this.isWithinScrollMargins(ix + d)) {
          newBuffer[ix] = this.buffer[ix + d] || ''
        } else {
          newBuffer[ix] = ''
        }
        log.info({ isWithin: ix, n: newBuffer[ix], o: this.buffer[ix] })
        newFormatBuffer[ix] = this.formatBuffer[ix + d] || []
      } else {
        newBuffer[ix] = this.buffer[ix] || ''
        newFormatBuffer[ix] = this.formatBuffer[ix] || []
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
    let newFormat = (params.length === 0) ? {} : this.format

    let change = {
      4: { underline: true },
      24: { underline: false },
      7: { negative: true },
      27: { negative: false }
    }[params[0]]

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
    let fg, bright, start
    if (params[0] === 1) {
      fg = true
      bright = true
      start = 1
      params.shift()
    }
    if (params[0] >= 30 && params[0] <= 39) {
      fg = true
      bright = false
      start = 30
    } else
    if (params[0] >= 90 && params[0] <= 97) {
      fg = true
      bright = true
      start = 90
    } else
    if (params[0] >= 40 && params[0] <= 49) {
      fg = false
      bright = false
      start = 40
    } else
    if (params[0] >= 100 && params[0] <= 107) {
      fg = true
      bright = true
      start = 100
    }

    if (start) {
      const colorIx = params[0] - start
      const color = colors[colorIx]

      if (color === 'default') {
        change = fg ? { fg: {} } : { bg: {} }
      } else
      if (color === 'extended') {
        // assumes 256 colors
        const color = params[2]
        change = fg ? { fg: { color } } : { bg: { color } }
      } else {
        change = fg ? {
          fg: { bright, color: colorIx }
        } : {
          bg: { bright, color: colorIx }
        }
      }
    } else {
      newFormat = {}
    }

    // This is a new object everytime, so we can reuse this.format
    this.format = { ...newFormat, ...change }
  }

  moveCursor (y, x) {
    log.info({ moveCursor: { x, y } })
    const cappedX = Math.max(Math.min(this.cursor.x + x, this.size.cols), 0)
    const cappedY = Math.max(Math.min(this.cursor.y + y, this.size.rows), 0)

    this.cursor = { x: cappedX, y: cappedY }
  }

  clearBuffer () {
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

    for (let i = 0; i < h; i++) {
      let line = Buffer.alloc(w, ' ')

      const bufY = i

      if (this.buffer[bufY]) {
        line = this.buffer[bufY].toString('utf8').slice(0, w)
        line = line + Buffer.alloc(w - line.length, ' ')
      }

      // TODO: allow programs to hide cursor
      if (i === this.cursor.y && isFocussed) {
        line = line.slice(0, this.cursor.x) + '_' + line.slice(this.cursor.x + 1)
      }

      let formats = this.formatBuffer[bufY] || []

      if (highlight) {
        formats = [{ start: 0, length: w, format: { bg: { color: 7 }, fg: { color: 8 } } }]
      }

      // TODO: Pointless k => k ?
      line = this.applyFormats(line, formats.map(k => k))

      lines.push(line)
    }

    return lines
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
      const startSeq = (...params) => '\u001b[' + params.join(';') + 'm'
      let res = ''

      if (!format) {
        return startSeq(0)
      }

      const invert = format.negative

      if (format.bg && format.bg.color) {
        res += startSeq(48, 5, ((invert && format.fg) ? format.fg : format.bg).color)
      }
      if (format.fg && format.fg.color) {
        res += startSeq(38, 5, ((invert && format.bg) ? format.bg : format.fg).color)
      }
      return res
    }

    return result
  }

  insertText (text) {
    // Inserting in top left 0,0
    //
    // this means we set the offset of the viewport
    // to the start of the buffer?
    //

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
    log.info({ data: data.toString('utf8') })

    const currentRest = this.rest || ''
    this.rest = ''

    const {
      outs: seqs,
      rest
    } = getCtlSeqs(currentRest + data.toString('utf8'))

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
