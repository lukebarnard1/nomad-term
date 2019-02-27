
const { stdin, stdout } = process;

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

function newShell() {
    return {
        id: uniqueId(),
    };
}

function reduceCurrentWorkspace(state, action) {
    const { shells, focussed_shell, start_size_pct, start_last_shell_index } = state;

    const rotatedTarget = action.direction
        ? rotate(shells.length, focussed_shell, action.direction)
        : 0;

    const newState = {
        'FOCUS_SHELL': { focussed_shell: rotatedTarget },
        'SWAP_SHELL': {
            shells: shells.map((s, index) =>
                ({
                    [focussed_shell]: shells[rotatedTarget],
                    [rotatedTarget]: shells[focussed_shell],
                }[index] || s),
            ),
            focussed_shell: rotatedTarget,
        },
        'LAUNCH_SHELL': {
            shells: [...shells, newShell()]
        },
        'CLOSE_FOCUSSED_SHELL': {
            // TODO: Update start_last_shell_index
            shells: shells.filter((s, index) => index !== focussed_shell),
            focussed_shell: focussed_shell === 0 ? 0 : rotate(shells.length - 1, focussed_shell, -1),
        },
        'START_SIZE_CHANGE': {
            start_size_pct: limit(start_size_pct + action.direction * 10, 0, 100),
        },
        'START_SHELL_INDEX_CHANGE': {
            start_last_shell_index: limit(start_last_shell_index + action.direction, 0, shells.length - 1)
        },
        'LAYOUT_ROTATE': {
            layout: rotate(3, state.layout, 1),
        }
    }[action.type] || {};

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
}

function clearScreen() {
    stdout.cursorTo(0,0);
    stdout.clearScreenDown();
    stdout.cursorTo(0,0);
}

function exit() {
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

function drawBox(x, y, w, h, isTop) {
    const viewX = limit(Math.floor(x * stdout.columns / 100), 0, stdout.columns)
    const viewY = limit(Math.floor(y * stdout.rows / 100), 0, stdout.rows)
    const viewW = limit(Math.floor(w * stdout.columns / 100), 0, stdout.columns)
    const viewH = limit(Math.floor(h * stdout.rows / 100), 0, stdout.rows)

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

function drawBoxesH(x, w, divisions) {
    const divisionH = Math.floor(100 / divisions);

    for (let i = 0; i < divisions; i++) {
        drawBox(x, i * divisionH, w, divisionH, i === 0);
    }
}

function render() {

    // Render Layout 0

    clearScreen();
    console.info(state);

    if (!state) return;

    const fw = state.workspaces[state.focussed_workspace];

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

    if (w !== 0) {
        drawBoxesH(0, w, startDivisions);
    }
    if (w !== 100) {
        drawBoxesH(w, 100 - w, endDivisions);
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

