
const { stdin, stdout } = process;
const fs = require('fs');
const path = require('path');

var stream = fs.createWriteStream(path.join(__dirname,'info.log'), {flags: 'a'});
const log = {
    info: (o) => stream.write(JSON.stringify(o) + '\n'),
    error: (e) => stream.write(JSON.stringify({
        message: e.message,
        stack: e.stack.split('\n')
    }) + '\n')
};

function initWorkspace() {
    return {
        focussed_shell: 0,
        layout: 0,
        scroll_position: 0,
        shells: [],
        start_last_shell_index: 0,
        start_size_pct: 50,
    };
}

const reduce = (state={
  mode: true,
  workspaces: [ initWorkspace(), initWorkspace() ],
  focussed_workspace: 0,
}, action) => {
    return {
        ...state,
        mode: reduceMode(state, action),
        workspaces: state.mode ? reduceWorkspaces(state, action) : state.workspaces,
        focussed_workspace: state.mode ? reduceFocussedWorkspace(state, action) : state.focussed_workspace,
    };
}

function reduceFocussedWorkspace({focussed_workspace}, action) {
    const result = {
        'CURRENT_WORKSPACE_SELECT': () => action.destination,
    }[action.type] || (() => focussed_workspace);

    return result();
}

function reduceMode({mode}, action) {
    return action.type === 'MODE_TOGGLE' ? !mode : mode;
}

function rotate(total, current, direction) {
    if (total === 0) return 0;
    return (total + current + direction) % total;
}

function limit(value, lower, upper) {
    if (value < lower) return lower;
    if (value > upper) return upper;
    return value;
}

function uniqueId() {
    return Math.random().toString(36).slice(2);
}

const child_process = require('child_process');

const stats = {};

class SubTerminal {
    constructor(proc) {
        this.id = uniqueId();
        this.proc = proc;

        // The last width x height characters are the viewport
        // 4 bytes text, 1 byte format
        const w = 10000;
        const h = 10000;
        this.buffer = Buffer.alloc(w * h, ' ');

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
        if (this.size.cols === cols || this.size.rows === rows) return;
        this.size = { cols, rows };

        log.info({resize: this.size});
        this.proc.resize(cols - 1, rows - 1);
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
        this.buffer = Buffer.alloc(w * h, ' ');
    }

    clearLineRight() {
        const {x, y} = this.cursor;
        this.insertText(Buffer.alloc(this.dimension.w - x, ' ').toString());
        this.setCursor(y, x);
    }

    clearScreenDown() {
        const {x, y} = this.cursor;
        this.buffer.copy(Buffer.alloc(this.dimension.w * (this.size.rows - y), ' '));
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

    reduce(action) {
        let handled = false;
        switch (action.type) {
            case 'TEXT':
                this.insertText(action.text);
                break;
            case 'CONTROL':
                const params = action.match[1].split(';').map((s) => parseInt(s));
                const count = params[0] || 1;
                const controlKey = action.match[2];
                if (controlKey === 'H') {
                    if (action.match[1]) {
                        this.setCursor(...params);
                    } else {
                        this.setCursor(0, 0);
                    }
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
                    log.info({r: true, params});

                    this.setScrollOffset(params[0] || 1);
                } else if (controlKey === 'M') {
                    this.setScrollOffset(this.scrollOffset - 1);
                } else if (controlKey === 'J' && params[0] == '0') {
                    this.clearLineRight();
                    this.clearScreenDown();
                } else if (controlKey === 'G') {
                    this.setCursor(this.cursor.y, params[0]);
                }

                log.info({controlKey, count, whole_match: action.whole_match});

                stats[controlKey] = typeof stats[controlKey] !== 'undefined'
                    ? stats[controlKey] + 1
                    : 0;

                log.info({stats});

                handled = true
                break;
        }
    }

    // TODO: Scroll to latest
    // TODO: Formatting
    drawSubTerminal(w, h, isFocussed) {
        const lines = [];

        log.info({scroll: this.scrollOffset});

        for (let i = 0; i < h; i++) {
            const start = (i + this.scrollOffset) * this.dimension.w;
            let line = this.buffer.slice(start, start + this.dimension.w).slice(0, w);

            if (i === this.cursor.y && isFocussed) {
                line = line.slice(0, this.cursor.x) + '_' + line.slice(this.cursor.x + 1);
            }

            lines.push(line);
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

        const bufX = this.cursor.x;
        const bufY = this.cursor.y + this.scrollOffset;
        log.info({insertText: text, bufX, bufY});

        const bufIx = bufX + bufY * this.dimension.w;

        if (bufIx > this.buffer.length) return;

        // text could include cariage returns
        //   \n moves down
        //   \r goes back to start

        try {
            const t = text.slice(0, this.dimension.w - bufX);

            this.buffer.write(t, bufIx);
            this.cursor.x += t.length;
        } catch (e) {
            log.info({e, bufIx, bufX, bufY});
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
            log.info({ consume, message: 'action consume', t: buffered, len: buffered.length});
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
            const result = this.getActionFor(data.slice(offset));
            if (!result.action) {
                results.push({
                    type: 'TEXT',
                    NO_ACTION: true,
                    text: data.slice(offset).toString('utf8')
                });
                break;
            }

            // Insert text
            if (result.start > 0) {
                results.push({
                    type: 'TEXT',
                    ACTION: true,
                    text: data.slice(offset, offset + result.start).toString('utf8')
                });
            }

            // Control sequence
            results.push(result.action);

            offset += result.start + result.length;
            lim--;
        }

        results.forEach(a => this.reduce(a));

        // TODO: Render only this sub terminal
        // ultra-TODO: render only bits of this sub terminal that changed
        render();
    }
}

var os = require('os');
var pty = require('node-pty');

var shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash';

function newShell() {

    // Fork a process
    //
    const proc = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: 80,
      rows: 30,
      cwd: process.env.HOME,
        //env: process.env
    });

    const st = new SubTerminal(proc);

    subTerminals[st.id] = st;
    proc.on('data', (data) => {
        st.write(data);
    });

    proc.on('close', () => {
        //st.write('\n\n\nprocess exited\n');
    });

    return { id: st.id };
}

function reduceCurrentWorkspace(state, action) {
    const { shells, focussed_shell, start_size_pct, start_last_shell_index } = state;

    const rotatedTarget = action.direction
        ? rotate(shells.length, focussed_shell, action.direction)
        : 0;

    let newState = {};

    switch (action.type) {
        case 'FOCUS_SHELL':
            newState = { focussed_shell: rotatedTarget };
            break;
        case 'SWAP_SHELL':
            newState = {
                shells: shells.map((s, index) =>
                    ({
                        [focussed_shell]: shells[rotatedTarget],
                        [rotatedTarget]: shells[focussed_shell],
                    }[index] || s),
                ),
                focussed_shell: rotatedTarget,
            };
            break;
        case 'LAUNCH_SHELL':
            newState = {
                shells: [...shells, newShell()]
            };
            break;
        case 'CLOSE_FOCUSSED_SHELL':
            newState = {
                // TODO: Update start_last_shell_index
                shells: shells.filter((s, index) => index !== focussed_shell),
                focussed_shell: focussed_shell === 0 ? 0 : rotate(shells.length - 1, focussed_shell, -1),
            };
            break;
        case 'START_SIZE_CHANGE':
            newState = {
                start_size_pct: limit(start_size_pct + action.direction * 10, 0, 100),
            };
            break;
        case 'START_SHELL_INDEX_CHANGE':
            newState = {
                start_last_shell_index: limit(start_last_shell_index + action.direction, 0, shells.length - 1)
            };
            break;
        case 'LAYOUT_ROTATE':
            newState = {
                layout: rotate(3, state.layout, 1),
            }
            break;
    }

    return {
        ...state,
        ...newState,
    }
}

function reduceWorkspaces(state, action) {
    const { workspaces, focussed_workspace } = state;

    const focussedWorkspace = workspaces[focussed_workspace];
    const { focussed_shell } = focussedWorkspace;

    let newWorkspaces = workspaces
        .map((workspace, index) => {
            // This complexity indicates this could be better...
            if (action.destination === focussed_workspace) return workspace;
            if (typeof action.destination === 'undefined' || action.type !== 'SHELL_WORKSPACE_MOVE') return workspace;
            if (typeof focussedWorkspace.shells[focussed_shell] === 'undefined') return workspace;
            if (index === focussed_workspace) {
                return {
                    ...workspace,
                    shells: workspace.shells.filter((s, i) => i !== focussed_shell),
                    focussed_shell: rotate(workspace.shells.length - 1, focussed_shell, -1),
                    start_last_shell_index: limit(workspace.start_last_shell_index, 0, workspace.shells.length - 1)
                }
            } else if (index === action.destination) {
                return {
                    ...workspace,
                    shells: [
                        ...workspace.shells,
                        focussedWorkspace.shells[focussed_shell]
                    ]
                }
            }
            return workspace;
        });

    return newWorkspaces.map(
        (workspace, index) => index === focussed_workspace
            ? reduceCurrentWorkspace(workspace, action)
            : workspace
    );
}
let state;
function applyAction(action) {
    //clearScreen();
    state = reduce(state, action);
}

let subTerminals = {};

function clearScreen() {
    stdout.cursorTo(0,0);
    stdout.clearScreenDown();
    stdout.cursorTo(0,0);
}

function exit() {
    clearScreen();
    console.info('shmonad exiting');
    process.exit();
}

function mapKeyToAction(key) {
    return {
        'm': {type: 'FOCUS_SHELL'},
        'k': {type: 'FOCUS_SHELL', direction: +1},
        'j': {type: 'FOCUS_SHELL', direction: -1},

        '\u000d': {type: 'SWAP_SHELL'},
        'K': {type: 'SWAP_SHELL', direction: +1},
        'J': {type: 'SWAP_SHELL', direction: -1},

        // shift-tab : ^[[Z
        '\u001b\u005bZ': {type: 'MODE_TOGGLE'},

        'C': {type: 'CLOSE_FOCUSSED_SHELL'},

        '!': {type: 'SHELL_WORKSPACE_MOVE', destination: 0},
        '@': {type: 'SHELL_WORKSPACE_MOVE', destination: 1},
        '£': {type: 'SHELL_WORKSPACE_MOVE', destination: 2},
        '$': {type: 'SHELL_WORKSPACE_MOVE', destination: 3},
        '%': {type: 'SHELL_WORKSPACE_MOVE', destination: 4},
        '^': {type: 'SHELL_WORKSPACE_MOVE', destination: 5},
        '&': {type: 'SHELL_WORKSPACE_MOVE', destination: 6},
        '*': {type: 'SHELL_WORKSPACE_MOVE', destination: 7},
        '(': {type: 'SHELL_WORKSPACE_MOVE', destination: 8},
        ')': {type: 'SHELL_WORKSPACE_MOVE', destination: 9},

        '1': {type: 'CURRENT_WORKSPACE_SELECT', destination: 0},
        '2': {type: 'CURRENT_WORKSPACE_SELECT', destination: 1},
        '3': {type: 'CURRENT_WORKSPACE_SELECT', destination: 2},
        '3': {type: 'CURRENT_WORKSPACE_SELECT', destination: 3},
        '4': {type: 'CURRENT_WORKSPACE_SELECT', destination: 4},
        '5': {type: 'CURRENT_WORKSPACE_SELECT', destination: 5},
        '6': {type: 'CURRENT_WORKSPACE_SELECT', destination: 6},
        '7': {type: 'CURRENT_WORKSPACE_SELECT', destination: 7},
        '8': {type: 'CURRENT_WORKSPACE_SELECT', destination: 8},
        '9': {type: 'CURRENT_WORKSPACE_SELECT', destination: 9},

        // space
        '\u0020': {type: 'LAYOUT_ROTATE'},

        'l': {type: 'START_SIZE_CHANGE', direction: +1},
        'h': {type: 'START_SIZE_CHANGE', direction: -1},

        ',': {type: 'START_SHELL_INDEX_CHANGE', direction: +1},
        '.': {type: 'START_SHELL_INDEX_CHANGE', direction: -1},

        'Q': {type: 'QUIT'},
        'q': {type: 'RESTART'},

        // backspace
        '\u007f': {type: 'LAUNCH_SHELL'},
    }[key];
}

function startEffects(action) {
    // Anything that affects state as a side-effect
    //  - program
    //  - child processes
    //
    // These will in turn generate actions that can alter
    // state.
}

const VIEW_FRAME = {
    CORNER: {
        T: { L: '\u250c', R: '\u2510' },
        B: { L: '\u2514', R: '\u2518' },
    },
    EDGE: { V: '\u2502', H: '\u2500' },
    POINT: {
        V: {
            R: '\u2502',
            L: '\u2502',
            //R: '\u2523', L: '\u252b'
        },
        H: { T: '\u253b', B: '\u2533' },
        M: '\u254b',
    }
};

function drawEdgeH(x, y, w, top, join) {
    const corner = join
        ? VIEW_FRAME.POINT.V
        : (top ? VIEW_FRAME.CORNER.T : VIEW_FRAME.CORNER.B);

    let c;
    for (let i = 0; i < w; i++) {
        c = VIEW_FRAME.EDGE.H;
        if (i === 0) {
            c = corner.L;
        } else if (i === w - 1) {
            c = corner.R;
        }
        stdout.cursorTo(x + i, y);
        stdout.write(c);
    }
}

function viewTransform(c) {
    const space = {
        x: stdout.columns,
        y: stdout.rows,
        y2: stdout.rows,
        w: stdout.columns,
        h: stdout.rows,
    };
    const transform = (k, v) => limit(Math.floor(v * space[k] / 100), 0, space[k]);
    const transformed = Object.keys(c)
        .map((k) => ({[k]: transform(k, c[k])}))
        .reduce((t, n) => ({...t, ...n}), {});
    return transformed;
}


// TODO: Indicate selected shell somehow
function drawBox(x, y, w, h, isTop) {
    const { x: viewX, y: viewY, w: viewW, h: viewH } = viewTransform({x, y, w, h});

    let c;
    for (let i = 0; i < (viewH - 1); i++) {
        stdout.cursorTo(viewX, viewY + 1 + i);
        stdout.write(VIEW_FRAME.EDGE.V);
        stdout.cursorTo(viewX + viewW - 1, viewY + 1 + i);
        stdout.write(VIEW_FRAME.EDGE.V);
    }

    drawEdgeH(viewX, viewY, viewW, true, !isTop);
    drawEdgeH(viewX, viewY + viewH, viewW, false);
}


// TODO: This should allow for scrolling though the buffer
// with a simple line offset. The offset is controlled by
// either control sequences from the program. If the program
// outputs anything, the scroll is reset to the bottom-most
// position (offset 0), effectively showing the user the most
// up-to-date "view" or "viewport" of the buffer. This means
// that if the program doesn't give any new output when the
// user scrolls, the offset should increase. This is down to
// the simulated terminal.
function drawBuffer(x, y, w, h, shell_id) {
    let i = 0;
    let prevI = 0;
    let line = 1;

    const st = subTerminals[shell_id];
    const fw = state.workspaces[state.focussed_workspace];

    const isFocussed = state.mode > 0 && fw.shells && fw.shells.length && shell_id === fw.shells[fw.focussed_shell].id;

    const lines = st.drawSubTerminal(w - 2, h - 1, isFocussed);

    // This is a side-effect, TODO - move this somewhere else
    st.resize(w - 2, h - 1);

    if (isFocussed) {
        stdout.write('\u001b[7m');
    }

    lines[lines.length - 1] = shell_id + lines[lines.length - 1].slice(10);

    lines.forEach((l) => {
        stdout.cursorTo(x, y + line);
        // TODO: the sub terminal should be able to emit control
        // sequences, and as such might need more than "w"
        // easy way would be to draw the box second
        stdout.write(l.slice(0, w - 2));

        line++;
    });

    stdout.write('\u001b[m');
}

function drawBoxesH(x, w, h, shells) {
    if (shells.length === 0) return;

    const divisions = shells.length;
    const divisionH = Math.floor(h / divisions);

    drawBox(x, 0, w, h, true);

    const { h: totalViewH } = viewTransform({h});

    let viewY = 0;
    for (let i = 0; i < divisions; i++) {
        const y = (i + 1) * divisionH;
        const h = divisionH;
        const {
            x: viewX,
            y: newViewY,
            w: viewW,
        } = viewTransform({x, y, w});

        let viewH = newViewY - viewY;

        if (i === divisions - 1) {
            viewH = totalViewH - viewY - 1;
        }

        if (i > 0) {
            drawEdgeH(viewX, viewY, viewW, false, true);
        }

        drawBuffer(viewX + 1, viewY, viewW, viewH, shells[i].id);

        viewY = newViewY;
    }
}

function render() {

    // Render Layout 0

    if (!state) return;

    const fw = state.workspaces[state.focussed_workspace];

    stdout.cursorTo(1, 1);

    const startDivisions = fw.start_last_shell_index + 1;
    const endDivisions = fw.shells.length - startDivisions;

    let w = 0;

    if (endDivisions === 0) {
        w = 100;
    } else if (startDivisions === 0) {
        w = 0;
    } else {
        w = fw.start_size_pct;
    }

    const h = 100;

    if (w !== 0) {
        drawBoxesH(0, w, h, fw.shells.slice(0, startDivisions));
    }
    if (w !== 100) {
        drawBoxesH(w, 100 - w - 1, h, fw.shells.slice(fw.start_last_shell_index + 1));
    }
}

function onData(data) {
    const fc = data[0];

    const action = mapKeyToAction(data);
    if (action) {
        // Stateful actions
        applyAction(action);
        render();

        log.info({state, action});

        switch (action.type) {
            case 'QUIT':
                exit();
                break;
            case 'RESTART':
                log.info({unimplemented: 'RESTART'});
                break;
        }
    }

    if (!(state && state.mode)) {
        const fw = state.workspaces[state.focussed_workspace];

        const shell_id = fw.shells[fw.focussed_shell].id;
        subTerminals[shell_id].proc.write(data);
        render();
    }

    startEffects(action);
}

function start() {
    //////////////////////////////////////////////////////////////
    //
    // shmonad.js
    //
    // i like xmonad, ok.
    //
    //////////////////////////////////////////////////////////////
    //
    // 1. View based on state. Assume empty buffers in each pane.
    // 2. Plain text buffering into panes, scrolling to old output.
    // 3. Handling certain colour control sequences
    // 4. Handling control sequences that alter cursor position,
    //    pinning the viewport to the most recent panes-worth of
    //    output when handling them.
    //
    //
    stdin.setRawMode(true);
    stdin.on('data', onData);
    stdout.on('resize', () => {
        // Send all terminals SIGWINCH
        //

        render();
    });

    process.on('SIGINT', () => {
        exit();
    });

    clearScreen();
    render();
}

start();

