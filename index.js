
const { stdin, stdout } = process;

const reduce = (state={
  workspaces: [
    { shells: [], start_shell_count: 1, start_size_pct: 50, layout: 0, focussed_shell: 0 },
    { shells: [], start_shell_count: 1, start_size_pct: 50, layout: 0, focussed_shell: 0 },
  ],
  focussed_workspace: 0,
}, action) => {
    return {
        ...state,

        mode: reduceMode(state, action),
        workspaces: reduceWorkspaces(state, action),
        focussed_workspace: reduceFocussedWorkspace(state, action),
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
    const { shells, focussed_shell, start_size_pct } = state;

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
            shells: [newShell(), ...shells]
        },
        'CLOSE_FOCUSSED_SHELL': {
            shells: shells.filter((s, index) => index !== focussed_shell),
            focussed_shell: focussed_shell === 0 ? 0 : rotate(shells.length - 1, focussed_shell, -1),
        },
        'START_SIZE_CHANGE': {
            start_size_pct: limit(start_size_pct + action.direction * 10, 0, 100),
        },
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
            if (typeof action.destination === 'undefined' || action.type !== 'SHELL_WORKSPACE_MOVE') return workspace;
            if (typeof focussedWorkspace.shells[focussed_shell] === 'undefined') return workspace;
            if (index === focussed_workspace) {
                return {
                    ...workspace,
                    shells: workspace.shells.filter((s, i) => i !== focussed_shell)
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
    console.info(action);
    console.info();
    console.info(0, state.workspaces[0].shells);
    console.info(1, state.workspaces[1].shells);
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

        ',': {type: 'START_SHELL_COUNT_CHANGE', direction: +1},
        '.': {type: 'START_SHELL_COUNT_CHANGE', direction: -1},

        'Q': {type: 'QUIT'},
        'q': {type: 'RESTART'},

        // backspace
        '\u007f': {type: 'LAUNCH_SHELL'},
    }[key];
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
    }
}

function start() {
    //
    ////
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

    process.on('SIGINT', () => {
        console.info('shmonad interrupted');
        exit();
    });
    clearScreen();
}

start();

