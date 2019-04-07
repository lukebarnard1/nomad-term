
const log = require('./log')

function uniqueId() {
    return Math.random().toString(36).slice(2);
}

module.exports = class SubTerminal {
    constructor(proc, cb) {
        this.id = uniqueId();
        this.proc = proc;

        this.renderCb = () => cb(this.id);

        // The last width x height characters are the viewport
        // 4 bytes text, 1 byte format
        const w = 10000;
        const h = 10000;

        // Lines of the buffer
        this.buffer = {
            // 0: String
            // 2: String
        };

        this.scrollOffset = 0;

        this.cursor = {
            x: 0,
            y: 0,
        };

        // Effective maximum size of viewport
        this.dimension = { w, h };
        this.size = { cols: w, rows: h};

        this.inputBuffer = Buffer.alloc(w);
        this.inputBufferIx = 0;
    }

    setDimension({w,h}) {
        this.dimension = {w, h}
    }

    resize(cols, rows) {
        //log.info({resize: { before: this.size}});
        if (this.size.cols === cols || this.size.rows === rows) return;
        this.size = { cols, rows };

        log.info({resize: this.size});
        this.proc.resize(cols, rows);
    }

    setCursor(y, x) {

        const cappedX = Math.max(Math.min(x, this.size.cols), 0);
        const cappedY = Math.max(Math.min(y, this.size.rows), 0);

        this.cursor = {x: cappedX, y: cappedY};

        log.info({cursor: this.cursor});

        this.checkScroll();
    }

    setScrollOffset(s) {
        log.info({scroll: s, set: true});
        this.scrollOffset = s;
        if (this.scrollOffset < 0) {
            this.scrollOffset = 0;
        }
    }

    moveCursor(y, x) {
        this.cursor.x += x;
        this.cursor.y += y;

        this.checkScroll();
    }

    clearBuffer() {
        const {w, h} = this.dimension;
        this.buffer = {};
    }

    clearLineRight() {
        const {x, y} = this.cursor;
        if (!this.buffer[y + this.scrollOffset]) return;
        this.buffer[y + this.scrollOffset] = this.buffer[y + this.scrollOffset].slice(0, this.cursor.x);
    }

    clearScreenDown() {
        const {x, y} = this.cursor;
        const top = {};
        const keys = Object.keys(this.buffer);
        const highestIx = parseInt(keys[keys.length - 1])
        for (let i = y + this.scrollOffset; i < highestIx; i++) {
            top[i] = this.buffer[i];
        }
        this.buffer = top;
    }

    newLine() {
        this.cursor.x = 0;
        this.cursor.y += 1;

        this.checkScroll();
    }

    checkScroll() {
        log.info({c: this.cursor, scroll: this.scrollOffset, checkScroll: true});
        if (this.cursor.y > this.size.rows - 1) {
            const d = (this.cursor.y - (this.size.rows - 1))
            log.info({scroll: this.scrollOffset, d, checkScrollChange: true, size: this.size});

            this.scrollOffset += d;

            this.cursor.y = this.size.rows - 1;
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
            /\u001b\[?=?()([0-9]*[0-9;]*)([ABCcDGgrsuPHfrMmtJKgnhl=])/,
            /\u001b()()([78])/,
            /\u001b()([\(\)][AB012])/,
            /\u001b\[\?()([0-9]*[lh])/,
            /()()([\r\n\b\t])/,

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
                const params = action.match[1].split(';').map((s) => parseInt(s));
                const count = params[0] || 1;
                const controlKey = action.match[2];

                log.info({controlKey, whole_match: action.whole_match});

                if (controlKey === 'H') {
                    // TODO: less is expecting a smaller viewport - how does size compare
                    // to the one we sent less (if any), could be the top and bottom border?
                    //
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
                } else if (controlKey && controlKey.match(/[ABCD]/)) {
                    if (count > 0) {
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
                        }
                    }
                    //TODO: If it's formatting ("m"), insert into a colour buffer
                    //and then use that when drawing the buffer. Bit shit but
                    //programs expect to be able to insert text at cursor locations
                    //with the current formatting.
                    //
                    //So actually it's more like the control sequence sets the current
                    //format and the text inserted via "insertText" "paints" onto a
                    //canvas.
                } else if (controlKey === 'K') {
                    this.clearLineRight();
                } else if (controlKey === 'P') {
                    this.clearLineRight();
                } else if (controlKey === 'r') {
                    // set top and bottom lines of view port
                    // really we can simplify and take the top
                    // and offset viewport by that in the buffer
                    log.info({scroll: 'r', r: true, params});

                    this.setScrollOffset((params[0] || 1) - 1);
                } else if (controlKey === 'M') {
                    this.setScrollOffset(this.scrollOffset - 1);
                } else if (controlKey === 'J' && params[0] == '0') {
                    this.clearLineRight();
                    // TODO: node appears to do this to its detriment
                    this.clearScreenDown();
                } else if (controlKey === 'G') {
                    this.setCursor(this.cursor.y, params[0] - 1);
                } else {
                    if (controlKey === 'm') {
                    } else {
                        log.info({unsupported: { action, controlKey, params}})
                    }
                }

                log.info({controlKey, count, whole_match: action.whole_match});

                break;
        }
    }

    // TODO: Scroll to latest
    // TODO: Formatting
    drawSubTerminal(w, h, isFocussed) {
        const lines = [];

        log.info({scroll: this.scrollOffset});

        log.info({size: this.size})

        for (let i = 0; i < h; i++) {
            let line = Buffer.alloc(this.size.cols, ' ');
            let bufY = this.scrollOffset + i;

            if (this.buffer[bufY]) {
                // We're writing 0s onto this - which terminates the thing.
                Buffer.from(this.buffer[bufY]).copy(line);
            }

            if (i === this.cursor.y && isFocussed) {
                line = line.slice(0, this.cursor.x) + '_' + line.slice(this.cursor.x + 1);
            }

            lines.push(line.toString());
        }

        return lines;
    }

    insertText(text) {
        // Inserting in top left 0,0
        //
         // this means we set the offset of the viewport
         // to the start of the buffer?
         //

         if (text.match(/\u001b/)) {
             log.error(new Error('insertText ESC ' + text));
         }

         // TODO: variable width character buffer
         //  - essentially: strings instead of a buffer
         //  - it won't that expensive to expose a bunch of string objects
         //  instead of lines in a buffer.

         const bufX = this.cursor.x;
         const bufY = this.cursor.y + this.scrollOffset;
         log.info({insertText: text, bufX, bufY});

         // text could include cariage returns
         //   \n moves down
         //   \r goes back to start

         try {
             // TODO: Is -bufX needed
             const t = text.slice(0, this.dimension.w - bufX);

             const oldLine = this.buffer[bufY] || Buffer.alloc(this.dimension.w, ' ');
             const newLine = oldLine.slice(0, bufX) + t + oldLine.slice(bufX  + t.length)

             this.buffer[bufY] = newLine;

             this.cursor.x += t.length;
         } catch (e) {
             log.info({ERROR: {m: e.message, s: e.stack.split('\n')} , bufX, bufY});
         }
     }

    write(data) {
        this.inputBuffer.write(data, this.inputBufferIndex);
        this.inputBufferIx += data.length;

        //if data consumable, consume it
        //
        // data is consumable if
        //    A there are no ESC
        // or B there are ESCs and there are actions for it

        let consume = false;

        const buffered = this.inputBuffer.slice(0, this.inputBufferIx).toString();

        if (!buffered.match(/\u001b/)) {
            consume = true;
            log.info({ consume, message: 'text to consume', t: buffered});
        } else {
            const result = this.getActionFor(this.inputBuffer);
            if (result.action) {
                consume = true;
            }
            log.info({ consume, message: 'action consume', len: buffered.length});
        }

        if (consume) {
            this.consume(this.inputBuffer.slice(0, this.inputBufferIx));
            this.inputBuffer = Buffer.alloc(this.dimension.w);
            this.inputBufferIx = 0;
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

