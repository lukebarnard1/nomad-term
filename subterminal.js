
const pty = require('node-pty');
const log = require('./log')
const os = require('os');

function uniqueId() {
    return Math.random().toString(36).slice(2);
}

function createSubTerminal(renderCb) {
    const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';
    const proc = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.env.HOME,
    });
    const st = new SubTerminal(
        proc.write.bind(proc),
        proc.resize.bind(proc),
        renderCb
    );
    proc.on('data', data => st.write(data));

    return st
}

// TODO: Make SubTerminal much easier to test
// TODO: Add tests for
//        - text buffer insertion
//        - scrolling
//        - clearing the screen
//        - inserting formats
// TODO: idea - store formatting with each line
class SubTerminal {
    constructor(writeProcCb, resizeCb, renderCb) {
        this.id = uniqueId();
        this.writeProcCb = writeProcCb
        this.resizeCb = resizeCb
        this.renderCb = () => renderCb(this.id);

        const w = 10000;
        const h = 10000;

        // Lines of the buffer
        this.buffer = {
            // 0: String
            // 2: String
        };

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
        };

        this.cursor = {
            x: 0,
            y: 0,
        };

        // Effective maximum size of viewport
        this.dimension = { w, h };
        this.size = { cols: w, rows: h};

        this.inputBuffer = Buffer.alloc(10000);
        this.inputBufferIx = 0;
    }

    writeToProc(data) {
        this.writeProcCb(data)
    }

    setDimension({w,h}) {
        this.dimension = {w, h}
    }

    // TODO: WRAPPING!
    resize(cols, rows) {
        if (this.size.cols === cols && this.size.rows === rows) return;

        this.size = { cols, rows };
        this.resizeCb(cols, rows);

        // After first resize, set default scroll margins
        // TODO: set size during creation
        if (!this._resized) {
            this.setScrollMargins()
            this._resized = true
        }
    }

    setCursor(y, x) {
        this.cursor = { x, y }

        log.info({cursor: this.cursor})
    }

    // Set the scrolling margins of the screen. Rows outside of this
    // region are not affected by scrolling.
    setScrollMargins(t=1, b=this.size.rows) {
        this.scrollMargins = { t: t - 1, b: b - 1 }
    }

    isWithinScrollMargins(i) {
        return i >= this.scrollMargins.t && i <= this.scrollMargins.b
    }

    getDeltaOutOfScrollMargins(i) {
        if (i > this.scrollMargins.b) {
            return i - this.scrollMargins.b
        } else if (i < this.scrollMargins.t) {
            return i - this.scrollMargins.t
        }
        return 0
    }

    // Scroll lines in the scroll region by d
    updateScrollRegion(d) {
        let newBuffer = {}
        let newFormatBuffer = {}
        for (let ix = 0; ix < this.size.rows; ix++) {
            if (this.isWithinScrollMargins(ix)) {
                newBuffer[ix] = this.buffer[ix + d] || ''
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
    deleteLines(n) {
        const save = this.scrollMargins.t
        this.scrollMargins.t = this.cursor.y
        this.updateScrollRegion(n)
        this.scrollMargins.t = save
    }

    // Insert n lines above the cursor
    // TODO: vim seems to set scroll region before
    // this to somehow allow for scrolling the region
    // down in order to insert blank lines. Might not
    // be true for other programs using this.
    insertLines(n) {
        this.updateScrollRegion(-n)
    }

    setFormat(params) {
        // Set the current parameters for the format of inserted text
        const newFormat = (params.length === 0) ? {} : this.format;

        let change = {
            4:  { underline: true },
            24: { underline: false },
            7:  { negative: true },
            27: { negative: false },
        }[params[0]];

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
            'default'   // resets to default
        ]

        // 30 - 39 foreground non-bold
        // 90 - 97 foreground bold
        // 40 - 49 background non-bold
        // 100 - 107 background bold
        let fg, bright, start;
        if (params[0] === 1) {
            fg = true
            bright = true
            start = 1
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
        }

        // This is a new object everytime, so we can reuse this.format
        this.format = {...newFormat, ...change}
    }

    moveCursor(y, x) {
        log.info({moveCursor: {x,y}})
        const cappedX = Math.max(Math.min(this.cursor.x + x, this.size.cols), 0);
        const cappedY = Math.max(Math.min(this.cursor.y + y, this.size.rows), 0);

        this.cursor = {x: cappedX, y: cappedY};
    }

    clearBuffer() {
        this.buffer = {};
        this.formatBuffer = {};
    }

    clearEntireLine() {
        const {x, y} = this.cursor;
        const bufY = y;

        this.buffer[bufY] = undefined
        this.formatBuffer[bufY] = undefined
    }

    clearLine(right) {
        const {x, y} = this.cursor;
        const bufY = y;

        if (!this.buffer[bufY]) return;
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

    clearScreen(down) {
        const {y} = this.cursor;
        const top = {};
        const formatTop = {};
        const keys = Object.keys(this.buffer);
        const highestIx = parseInt(keys[keys.length - 1])

        const clearStart = down ? y : 0
        const clearEnd = down ? highestIx : y

        for (let i = clearStart; i < clearEnd; i++) {
            top[i] = this.buffer[i];
            formatTop[i] = this.formatBuffer[i];
        }
        this.buffer = top;
        this.formatBuffer = formatTop;
    }

    newLine() {
        this.cursor.x = 0;
        this.cursor.y += 1;

        this.checkScroll();
    }

    checkScroll() {
        const d = this.getDeltaOutOfScrollMargins(this.cursor.y)
        if (d !== 0) {
            this.updateScrollRegion(d)
            this.cursor.y = this.cursor.y - d;
        }
    }

    getActionFor(data) {
        // TODO: Bit cumbersome to identify different
        // sequences as matches against different regexps.
        //
        // Probably better to reduce to { function, params }
        //
        // TODO:  do 7 and 8 need to be controlKeys?
        const patterns = [
            /(\u001b\[?=?)([0-9]*[0-9;]*)([ABCcDGgrsuPHfrMmtJKgnhLl=])/,
            /(\u001b)()([78ABCDEFGHIJK])/,
            /(\u001b[\(\)])([AB012])/,
            /(\u001b\[\?)([0-9]*[lh])/,
            /()()([\r\n\b\t])/,
            /(\u001b)(\>)/,

            // no idea what the below does
            /\u001b\[()()2\s*([0-9a-z])/,

            // BEL
            /\u0007()()()/
        ];

        const matches = patterns.map(
            p => data.toString('utf8').match(p)
        ).filter(m => m).sort((a, b) => {
            if (a.index === b.index) {
                return a[0].length > b[0].length ? -1 : 1;
            }
            if (a.index < b.index) {
                return -1;
            } else {
                return 1;
            }
        });

        const match = matches[0];

        return match ? {
            action: {
                type: 'CONTROL',
                match: match.slice(1),
                whole_match: match[0],
            },
            start: match.index,
            length: match[0].length
        } : {
            action: null,
            not_matching: data.toString('utf8'),
            offset: -1,
        }
    }

    reduceTerminalAction(action) {
        switch (action.type) {
            case 'TEXT':
                this.insertText(action.text);
                break;
            case 'CONTROL':
                const paramString = action.match[1]
                const params = paramString.length > 0
                    ? paramString.split(';').map((s) => parseInt(s))
                    : []
                const count = params[0] || 1;
                const controlKey = action.match[2];
                const csi = action.match[0];

                log.info({controlKey, whole_match: action.whole_match});

                if (controlKey === 'H' || controlKey === 'f') {
                    log.info({action})
                    if (action.match[1]) {
                        this.setCursor(params[0] - 1, params[1] - 1);
                    } else {
                        this.setCursor(0, 0);
                    }
                } else if (action.whole_match === '\u0007') {
                    // bell
                } else if (controlKey === '\r') {
                    this.cursor.x = 0;
                } else if (controlKey === '\n') {
                    this.newLine();
                } else if (controlKey === '\b') {
                    this.cursor.x -= 1;
                } else if (controlKey === '\t') {
                    const tabWidth = 8;
                    const x = tabWidth + this.cursor.x - (this.cursor.x % tabWidth);
                    this.setCursor(this.cursor.y, x);
                } else if (action.match[1] === '2' && controlKey === 'J') {
                    this.clearBuffer();
                    this.setCursor(0, 0);
                } else if (action.match[1] === '6' && controlKey === 'n') {
                    // what
                    this.setCursor(3, 3);
                } else if (controlKey && controlKey.match(/[ABCDEML]/)) {
                    // VT52 doesn't move scroll window
                    const capped = csi === "\u001b"
                    if (count === 0) count = 1
                    switch (controlKey) {
                        case 'A':
                            this.moveCursor(-count, 0);
                            break;
                        case 'B':
                            this.moveCursor(count, 0);
                            break;
                        case 'C':
                            this.moveCursor(0, count);
                            break;
                        case 'D':
                            this.moveCursor(0, -count);
                            break;
                        case 'E':
                            if (capped) {
                                this.setCursor(this.cursor.y + 1, 0)
                            }
                        case 'M':
                            if (capped) {
                                this.cursor = { x: this.cursor.x, y: this.cursor.y - 1 }
                                this.checkScroll()
                            } else {
                                this.deleteLines(count)
                            }
                            break;
                        case 'L':
                            if (!capped) {
                                this.insertLines(count)
                            }
                    }
                } else if (controlKey === 'K') {
                    switch (parseInt(params[0])) {
                        case 1:
                            this.clearLine(false);
                            break;
                        case 2:
                            this.clearEntireLine();
                            break;
                        case 0:
                        default:
                            this.clearLine(true);
                            break;
                    }
                } else if (controlKey === 'P') {
                    this.clearLine(true);
                } else if (controlKey === 'r') {
                    this.setScrollMargins(params[0], params[1]);
                } else if (controlKey === 'J') {
                    switch (parseInt(params[0])) {
                        case 1:
                            this.clearLine(false);
                            this.clearScreen(false);
                            break;
                        case 2:
                            this.clearBuffer();
                            break;
                        case 0:
                        default:
                            this.clearLine(true);
                            // TODO: node appears to do this to its detriment
                            this.clearScreen(true);
                            break;
                    }
                } else if (controlKey === 'G') {
                    this.setCursor(this.cursor.y, params[0] - 1);
                } else {
                    if (controlKey === 'm') {
                        this.setFormat(params)
                    } else {
                        log.info({unsupported: { action, controlKey, params}})
                    }
                }

                break;
        }
    }

    drawSubTerminal(w, h, {highlight, isFocussed}) {
        const lines = [];

        for (let i = 0; i < h; i++) {
            let line = Buffer.alloc(this.size.cols, ' ');

            let bufY = i;

            if (this.buffer[bufY]) {
                line = this.buffer[bufY].toString('utf8').slice(0, this.size.cols)
            }

            // TODO: allow programs to hide cursor
            if (i === this.cursor.y && isFocussed) {
                line = line.slice(0, this.cursor.x) + '_' + line.slice(this.cursor.x + 1);
            }

            let formats = this.formatBuffer[bufY] || []

            if (highlight) {
                formats = [{start: 0, length: this.size.cols, format: {bg: {color: 7}}}]
            }

            // TODO: Pointless k => k ?
            line = this.applyFormats(line, formats.map(k => k))

            lines.push(line);
        }

        return lines;
    }

    applyFormats(str, formats=[]) {
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

        function getFormatSeq(format) {
            const startSeq = (...params) => "\u001b[" + params.join(';') + "m"
            let res = ""

            if (!format) {
              return startSeq(0);
            }

            if (format.bg && format.bg.color) {
                res += startSeq(48, 5, format.bg.color)
            }
            if (format.fg && format.fg.color) {
                res += startSeq(38, 5, format.fg.color)
            }
            return res
        }

        return result
    }

    insertText(text) {
        // Inserting in top left 0,0
        //
         // this means we set the offset of the viewport
         // to the start of the buffer?
         //

         if (text.match(/\u001b/)) {
             log.error(new Error('insertText ESC ' + text));
             return
         }

         const bufX = this.cursor.x;
         const bufY = this.cursor.y;
         log.info({insertText: text, bufX, bufY});

         // text could include cariage returns
         //   \n moves down
         //   \r goes back to start

         try {
             // TODO: Is -bufX needed
             const t = text.slice(0, this.dimension.w - bufX);

             let oldLine = this.buffer[bufY] || Buffer.alloc(this.size.cols, ' ');

             if (bufX + t.length - oldLine.length > 0) {
                 oldLine = oldLine + Buffer.alloc(bufX + t.length - oldLine.length, ' ').toString('utf8')
             }

             const newLine = oldLine.slice(0, bufX) + t + oldLine.slice(bufX  + t.length)

             this.buffer[bufY] = newLine;

             if (t.length > 0) {
               // TODO indent...
                 this.addFormat(bufY, {
                     start: bufX,
                     length: t.length,
                     format: this.format
                 })
             }

             this.cursor.x += t.length;
         } catch (e) {
             log.info({ERROR: {m: e.message, s: e.stack.split('\n')} , bufX, bufY});
         }
    }

    addFormat(bufY, format) {
        this.formatBuffer[bufY] = reduceFormats(this.formatBuffer[bufY], format)
    }

    write(data) {
        let ix = this.inputBuffer.indexOf(0)

        this.inputBuffer.write(data, ix);

        ix = this.inputBuffer.indexOf(0)

        //if data consumable, consume it
        //
        // data is consumable if
        //    A there are no ESC
        // or B there are ESCs and there are actions for it

        let consume = false;

        const buffered = this.inputBuffer.slice(0, ix).toString();

        if (!buffered.match(/\u001b/)) {
            consume = true;
        } else {
            // Make sure not to chop any unfinished control sequences
            const escIx = this.inputBuffer.lastIndexOf("\u001b")
            const result = this.getActionFor(this.inputBuffer.slice(escIx));
            if (result.action) {
                consume = true;
            }
        }

        if (consume) {
            this.consume(this.inputBuffer.slice(0, ix));
            this.inputBuffer = Buffer.alloc(this.dimension.w);
        }
    }

    consume(data) {
        let offset = 0;
        let action;
        const results = [];
        let lim = 1000

        while (offset !== -1 && lim > 0) {
            const result = this.getActionFor(data.toString('utf8').slice(offset));
            if (!result.action) {
                results.push({
                    type: 'TEXT',
                    NO_ACTION: true,
                    text: data.toString('utf8').slice(offset)
                });
                break;
            }

            // Insert text
            //  if match start is greater than zero, add the text between 0
            //  and the start of the match
            if (result.start > 0) {
                results.push({
                    type: 'TEXT',
                    ACTION: true,
                    text: data.toString('utf8').slice(offset, offset + result.start)
                });
            }

            // Control sequence
            results.push(result.action);

            offset += result.start + result.length;
            lim--;
        }

        results.forEach(a => this.reduceTerminalAction(a));

        this.render();
    }

    render() {
        this.renderCb();
    }
}


function removeAdjacent(fs) {
    const hashes = fs.map(f => JSON.stringify(f.format))
    const before = fs.map(f => f)

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
function reduceFormats(formats=[], format) {
    if (!format) return formats;

    const within = (pos) => pos > format.start && pos < format.start + format.length

    const intersecting = (a, b) => {
        const sA = a.start
        const sB = b.start
        const fA = a.start + a.length
        const fB = b.start + b.length

        return sA > sB && sA < fB
            || sB > sA && sB < fA
            || fA > sB && fA < fB
            || fB > sA && fB < fA
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

        const startWithin = within(f.start)
        const endWithin = within(f.start + f.length)

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

            if (newLength > 0)
                fs.push({
                    start: newStart,
                    length: newLength,
                    format: f.format
                })
        }

        // f3
        if (endWithin || both) {
            newStart = f.start
            newLength = format.start - f.start

            if (newLength > 0)
                fs.push({
                    start: newStart,
                    length: newLength,
                    format: f.format
                })
        }
        return fs
    }).reduce((a,b) => a.concat(b), [])

    const result = [ ... nonIntersectingFormats, ... newIntersectingFormats, format].sort((a, b) => a.start - b.start)

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
module.exports = { createSubTerminal, reduceFormats }
