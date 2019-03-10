
const { stdin, stdout } = process;
const fs = require('fs');
const path = require('path');

var stream = fs.createWriteStream(path.join(__dirname,'info.log'), {flags: 'a'});
const log = { info: (o) => stream.write(JSON.stringify(o) + '\n') };

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

class SubTerminal {
    constructor(proc) {
        this.id = uniqueId();
        this.proc = proc;

        // The last width x height characters are the viewport
        // 4 bytes text, 1 byte format
        const w = 10000;
        const h = 10000;
        this.buffer = Buffer.alloc(w * h, ' ');

        this.cursor = {
            x: 0,
            y: 0,
        };

        // Effective maximum size of viewport
        this.dimension = { w, h };
    }

    setDimension({w,h}) {
        this.dimension = {w, h}
    }

    resize() {
        // Send 28 signal to process
        //
        this.proc.kill(28);
    }

    setCursor(y, x) {
        log.info({cursor: '', x, y});
        this.cursor = {x, y};
    }

    clearBuffer() {
        const {w, h} = this.dimension;
        this.buffer = Buffer.alloc(w * h, ' ');
    }

    getActionFor(data) {
        // TODO: Bit cumbersome to identify different
        // sequences as matches against different regexps.
        //
        // Probably better to reduce to { function, params }
        const patterns = [
            /\u001b\[()([0-9;]*)([Hfrmt])/,
            /\u001b\[()([0-9]*)([ABCD])/,
            /\u001b\[()([123567])([JKgnhl])/,
            /\u001b\[()()([JKcgrsu])/,
            /\u001b()([78DHMc=])/,
            /\u001b()([\(\)][AB012])/,
            /\u001b\[\?()([0-9]*[lh])/,
            /()()([\r\n])/,

            // no idea what the below does
            /\u001b\[()()2\s*([0-9a-z])/
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
                if (action.match[2] === 'H') {
                    if (action.match[1]) {
                        this.setCursor(...params);
                    } else {
                        this.setCursor(0, 0);
                    }
                } else if (action.match[2] === '\r') {
                    this.cursor.x = 0;
                } else if (action.match[2] === '\n') {
                    this.cursor.x = 0;
                    this.cursor.y += 1;
                } else if (action.match[1] === '2' && action.match[2] === 'J') {
                    this.clearBuffer();
                    this.setCursor(0, 0);
                } else if (action.match[1] === '6' && action.match[2] === 'n') {
                    this.setCursor(3, 3);
                    this.insertText(':D');
                }
                handled = true
                break;
        }

        log.info(action);
    }

    // TODO: Accept offsets into the terminal
    //   TODO: Scroll to latest
    // TODO: Formatting
    drawSubTerminal(w, h) {
        const lines = [];

        for (let i = 0; i < h; i++) {
            const start = i * this.dimension.w;
            lines.push(this.buffer.slice(start, start + this.dimension.w));
        }

        return lines;
    }

    insertText(text) {
        // Inserting in top left 0,0
        //
        // this means we set the offset of the viewport
        // to the start of the buffer?

        const bufX = this.cursor.x;
        const bufY = this.cursor.y;
        //log.info({insertText: text, bufX, bufY});

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
                    //data: data.slice(offset).toString('utf8'),
                    text: data.slice(offset, offset + result.start).toString('utf8')
                });
            }

            // Control sequence
            results.push(result.action);

            offset += result.start + result.length;
            lim--;
        }

        results.forEach(a => this.reduce(a));
    }
}

function newShell() {

    // Fork a process
    //
    //const proc = child_process.spawn('vim');
    // TODO: Do this inside SubTerminal
    const proc = child_process.spawn('vim')

    const st = new SubTerminal(proc);

    subTerminals[st.id] = st;

    proc.stdout.on('data', (data) => {
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
    clearScreen();
    state = reduce(state, action);
    log.info(action);
}

let subTerminals = {};

function resizeSubTerminals() {
    // Assume every terminal has changed size
    Object.values(subTerminals).forEach((st) => st.resize());
}

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

    const lines = subTerminals[shell_id].drawSubTerminal(w - 2, h - 1);

    lines.forEach((l) => {
        stdout.cursorTo(x, y + line);
        stdout.write(l.slice(0, w - 2));

        line++;
    });
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

    clearScreen();

    if (!state) return;

    const fw = state.workspaces[state.focussed_workspace];

    stdout.cursorTo(1, 1);
    //   console.info(state);
    //   console.info({l: fw.shells.map(k => k.id)});

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

    if (fc === 3) {
        exit();
    } else {

        const action = mapKeyToAction(data);
        if (action) {
            applyAction(action);
        }

        if (!(state && state.mode)) {
            Object.values(subTerminals)[0].proc.stdin.write(data);
        }

        startEffects(action);

        render();
    }
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

        resizeSubTerminals();

        render();
    });

    process.on('SIGINT', () => {
        console.info('shmonad interrupted');
        exit();
    });

    clearScreen();
    render();
}

start();

