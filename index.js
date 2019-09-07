
const { stdin, stdout } = process;

const { createSubTerminal } = require('./subterminal')
const log = require('./log')

function initWorkspace(shells=[]) {
    return {
        focussed_shell: 0,
        layout: 0,
        scroll_position: 0,
        shells,
        start_last_shell_index: 0,
        start_size_pct: 50,
    };
}

const reduce = (state={
  mode: true,
  workspaces: [ initWorkspace() ],
  focussed_workspace: 0,
}, action) => {
    return {
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

function newShell() {
    const st = createSubTerminal(drawBuffer);

    subTerminals[st.id] = st;

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
                shells: [...shells, newShell()],
                focussed_shell: shells.length
            };
            break;
        case 'CLOSE_FOCUSSED_SHELL':
            newState = {
                shells:
                  shells.length === 1
                    ? [newShell()]
                    : shells.filter((s, index) => index !== focussed_shell),
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

    // Selecting an empty workspace populates it with a shell
    if (action.type === 'CURRENT_WORKSPACE_SELECT' && !newWorkspaces[action.destination]) {
        newWorkspaces[action.destination] = initWorkspace([newShell()])
    }

    return newWorkspaces.map(
        (workspace, index) => index === focussed_workspace
            ? reduceCurrentWorkspace(workspace, action)
            : workspace
    );
}

let state;
function applyAction(action) {
    log.info({willApply: action})
    state = reduce(state, action);

    // Render borders, set sub terminal areas
    render()
    // Render all sub terminals
    Object.keys(subTerminals).forEach(drawBuffer)
}

let subTerminals = {};

function clearScreen() {
    stdout.cursorTo(0,0);
    stdout.clearScreenDown();
    stdout.cursorTo(0,0);
}

function exit() {
    clearScreen();
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

// TODO: User-controlled buffer scrolling
function drawBuffer(shell_id) {
    if (!areas[shell_id]) return;

    const {x, y, w, h} = areas[shell_id];
    let i = 0;
    let prevI = 0;
    let line = 1;

    const st = subTerminals[shell_id];
    const fw = state.workspaces[state.focussed_workspace];

    const isFocussed = fw.shells && fw.shells.length && shell_id === fw.shells[fw.focussed_shell].id;
    const highlight = state.mode > 0 && isFocussed

    const lines = st.drawSubTerminal(w - 2, h - 1, {isFocussed, highlight});

    lines.forEach((l) => {
        stdout.cursorTo(x, y + line);
        stdout.write('\u001b[m');
        stdout.write(Buffer.alloc(w - 2, ' '));

        stdout.cursorTo(x, y + line);
        stdout.write(l);

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

        setBufferArea(viewX + 1, viewY, viewW, viewH, shells[i].id);

        viewY = newViewY;
    }
}

let areas = {};

function setBufferArea(x, y, w, h, id) {
    areas[id] = {x, y, w, h}
    log.info({areas})

    // This is a side-effect, TODO - move this somewhere else
    subTerminals[id].resize(w - 2, h - 1);
}

function render() {

    // Render Layout 0

    if (!state) return;

    const fw = state.workspaces[state.focussed_workspace];

    stdout.cursorTo(1, 1);

    const startIndex = limit(fw.start_last_shell_index, 0, fw.shells.length - 1)

    const startDivisions = startIndex + 1;
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

    // Reset all buffer areas
    areas = {}

    if (w !== 0) {
        drawBoxesH(0, w, h, fw.shells.slice(0, startDivisions));
    }
    if (w !== 100) {
        drawBoxesH(w, 100 - w, h, fw.shells.slice(startDivisions));
    }
}

function onData(data) {
    const fc = data[0];

    const action = mapKeyToAction(data);
    if (action) {
        // Stateful actions
        applyAction(action);

        log.info({state, action});

        switch (action.type) {
            case 'QUIT':
                if (state && state.mode) {
                  exit();
                }
                break;
            case 'RESTART':
                log.info({unimplemented: 'RESTART'});
                break;
        }
    }

    if (!(state && state.mode)) {
        const fw = state.workspaces[state.focussed_workspace];

        // TODO: This is a potential attack vector - if an attacking program
        // can control which shell is focussed, it could potentially redirect
        // user input to another shell, e.g. when the user is entering a password
        //
        // One mitigation would be to reduce the posibility of other state changing
        // when state.mode is enabled. This is currently done explicitly for each
        // part of reduced state
        const shell_id = fw.shells[fw.focussed_shell].id;
        subTerminals[shell_id].writeToProc(data);
    }
}

function start() {
    //////////////////////////////////////////////////////////////
    //
    // nomad-term
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
    stdin.setRawMode(true);
    stdin.on('data', onData);
    stdout.on('resize', () => {
        render();
    });

    process.on('SIGINT', () => {
        exit();
    });

    clearScreen();
    // TODO: hide cursor ESC [ ? 25 l

    applyAction({
        type: 'LAUNCH_SHELL'
    });
}

start();

