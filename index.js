#!/usr/bin/env node

const { stdin, stdout } = process

const { createSubTerminal } = require('./subterminal')
const log = require('./log')

const { performance } = require('./perf')

function initWorkspace (shells = []) {
  return {
    focussed_shell: 0,
    layout: 0,
    scroll_position: 0,
    shells,
    start_last_shell_index: 0,
    start_size_pct: 50
  }
}

const reduce = (state = {
  mode: true,
  show_help: false,
  workspaces: [initWorkspace()],
  focussed_workspace: 0
}, action) => {
  return {
    mode: reduceMode(state, action),
    workspaces: state.mode ? reduceWorkspaces(state, action) : state.workspaces,
    focussed_workspace: state.mode ? reduceFocussedWorkspace(state, action) : state.focussed_workspace,
    show_help:
      state.mode
        ? (
          action.type === 'HELP_TOGGLE'
            ? !state.show_help
            : state.show_help
        )
        : state.show_help
  }
}

function reduceFocussedWorkspace ({ focussed_workspace }, action) {
  const result = {
    CURRENT_WORKSPACE_SELECT: () => action.destination
  }[action.type] || (() => focussed_workspace)

  return result()
}

function reduceMode ({ mode }, action) {
  return action.type === 'MODE_TOGGLE' ? !mode : mode
}

function rotate (total, current, direction) {
  if (total === 0) return 0
  return (total + current + direction) % total
}

function limit (value, lower, upper) {
  if (value < lower) return lower
  if (value > upper) return upper
  return value
}

function newShell () {
  const sts = createSubTerminal(drawBuffer)

  sts.forEach(st => {
    subTerminals[st.id] = st
  })

  return sts.map(st => ({ id: st.id }))
}

function reduceCurrentWorkspace (state, action) {
  const { shells, focussed_shell, start_size_pct, start_last_shell_index } = state

  const rotatedTarget = action.direction
    ? rotate(shells.length, focussed_shell, action.direction)
    : 0

  let newState = {}

  switch (action.type) {
    case 'FOCUS_SHELL':
      newState = { focussed_shell: rotatedTarget }
      break
    case 'SWAP_SHELL':
      newState = {
        shells: shells.map((s, index) =>
          ({
            [focussed_shell]: shells[rotatedTarget],
            [rotatedTarget]: shells[focussed_shell]
          }[index] || s)
        ),
        focussed_shell: rotatedTarget
      }
      break
    case 'LAUNCH_SHELL':
      newState = {
        shells: [...shells, ...newShell()],
        focussed_shell: shells.length
      }
      break
    case 'CLOSE_FOCUSSED_SHELL':
      newState = {
        shells:
                  shells.length === 1
                    ? [...newShell()]
                    : shells.filter((s, index) => index !== focussed_shell),
        focussed_shell: focussed_shell === 0 ? 0 : rotate(shells.length - 1, focussed_shell, -1)
      }
      break
    case 'START_SIZE_CHANGE':
      newState = {
        start_size_pct: limit(start_size_pct + action.direction * 10, 0, 100)
      }
      break
    case 'START_SHELL_INDEX_CHANGE':
      newState = {
        start_last_shell_index: limit(start_last_shell_index + action.direction, 0, shells.length - 1)
      }
      break
    case 'LAYOUT_ROTATE':
      newState = {
        layout: rotate(2, state.layout, 1)
      }
      break
  }

  return {
    ...state,
    ...newState
  }
}

function reduceWorkspaces (state, action) {
  const { workspaces, focussed_workspace } = state

  const focussedWorkspace = workspaces[focussed_workspace]
  const { focussed_shell } = focussedWorkspace

  const newWorkspaces = workspaces
    .map((workspace, index) => {
      // This complexity indicates this could be better...
      if (action.destination === focussed_workspace) return workspace
      if (typeof action.destination === 'undefined' || action.type !== 'SHELL_WORKSPACE_MOVE') return workspace
      if (typeof focussedWorkspace.shells[focussed_shell] === 'undefined') return workspace
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
      return workspace
    })

  // Selecting an empty workspace populates it with a shell
  if (action.type === 'CURRENT_WORKSPACE_SELECT' && !newWorkspaces[action.destination]) {
    newWorkspaces[action.destination] = initWorkspace([...newShell()])
  }

  return newWorkspaces.map(
    (workspace, index) => index === focussed_workspace
      ? reduceCurrentWorkspace(workspace, action)
      : workspace
  )
}

let state
function applyAction (action) {
  log.info({ willApply: action })
  state = reduce(state, action)

  // Render borders, set sub terminal areas
  render()
}

const subTerminals = {}

function clearScreen () {
  stdout.write('\u001b[2J\u001b[H')
}

function exit () {
  clearScreen()
  // Show the cursor
  stdout.write('\u001b[?25h')
  // Normal buffer
  stdout.write('\u001b[?47l')
  // Disable mouse tracking
  stdout.write('\u001b[?1000l')

  process.exit()
}

function mapKeyToAction (key) {
  return {
    m: { type: 'FOCUS_SHELL' },
    k: { type: 'FOCUS_SHELL', direction: +1 },
    j: { type: 'FOCUS_SHELL', direction: -1 },

    '\u000d': { type: 'SWAP_SHELL' },
    K: { type: 'SWAP_SHELL', direction: +1 },
    J: { type: 'SWAP_SHELL', direction: -1 },

    // shift-tab : ^[[Z
    '\u001b\u005bZ': { type: 'MODE_TOGGLE' },

    H: { type: 'HELP_TOGGLE' },

    C: { type: 'CLOSE_FOCUSSED_SHELL' },

    '!': { type: 'SHELL_WORKSPACE_MOVE', destination: 0 },
    '@': { type: 'SHELL_WORKSPACE_MOVE', destination: 1 },
    '£': { type: 'SHELL_WORKSPACE_MOVE', destination: 2 },
    $: { type: 'SHELL_WORKSPACE_MOVE', destination: 3 },
    '%': { type: 'SHELL_WORKSPACE_MOVE', destination: 4 },
    '^': { type: 'SHELL_WORKSPACE_MOVE', destination: 5 },
    '&': { type: 'SHELL_WORKSPACE_MOVE', destination: 6 },
    '*': { type: 'SHELL_WORKSPACE_MOVE', destination: 7 },
    '(': { type: 'SHELL_WORKSPACE_MOVE', destination: 8 },
    ')': { type: 'SHELL_WORKSPACE_MOVE', destination: 9 },

    1: { type: 'CURRENT_WORKSPACE_SELECT', destination: 0 },
    2: { type: 'CURRENT_WORKSPACE_SELECT', destination: 1 },
    3: { type: 'CURRENT_WORKSPACE_SELECT', destination: 2 },
    4: { type: 'CURRENT_WORKSPACE_SELECT', destination: 3 },
    5: { type: 'CURRENT_WORKSPACE_SELECT', destination: 4 },
    6: { type: 'CURRENT_WORKSPACE_SELECT', destination: 5 },
    7: { type: 'CURRENT_WORKSPACE_SELECT', destination: 6 },
    8: { type: 'CURRENT_WORKSPACE_SELECT', destination: 7 },
    9: { type: 'CURRENT_WORKSPACE_SELECT', destination: 8 },
    0: { type: 'CURRENT_WORKSPACE_SELECT', destination: 9 },

    // space
    '\u0020': { type: 'LAYOUT_ROTATE' },

    l: { type: 'START_SIZE_CHANGE', direction: +1 },
    h: { type: 'START_SIZE_CHANGE', direction: -1 },

    ',': { type: 'START_SHELL_INDEX_CHANGE', direction: +1 },
    '.': { type: 'START_SHELL_INDEX_CHANGE', direction: -1 },

    Q: { type: 'QUIT' },
    q: { type: 'RESTART' },

    // backspace
    '\u007f': { type: 'LAUNCH_SHELL' }
  }[key]
}
const VIEW_FRAME = {
  CORNER: {
    T: { L: '\u250c', R: '\u2510' },
    B: { L: '\u2514', R: '\u2518' }
  },
  EDGE: { V: '\u2502', H: '\u2500' },
  POINT: {
    V: {
      R: '\u2502',
      L: '\u2502'
      // R: '\u2523', L: '\u252b'
    },
    H: { T: '\u253b', B: '\u2533' },
    M: '\u254b'
  }
}

function drawEdgeH (x, y, w, top, join) {
  const corner = join
    ? VIEW_FRAME.POINT.V
    : (top ? VIEW_FRAME.CORNER.T : VIEW_FRAME.CORNER.B)

  let c
  for (let i = 0; i < w; i++) {
    c = VIEW_FRAME.EDGE.H
    if (i === 0) {
      c = corner.L
    } else if (i === w - 1) {
      c = corner.R
    }
    stdout.cursorTo(x + i, y)
    stdout.write(c)
  }
}

function viewTransform (c) {
  const space = {
    x: stdout.columns,
    y: stdout.rows,
    y2: stdout.rows,
    w: stdout.columns,
    h: stdout.rows
  }
  const transform = (k, v) => limit(Math.floor(v * space[k] / 100), 0, space[k])
  const transformed = Object.keys(c)
    .map((k) => ({ [k]: transform(k, c[k]) }))
    .reduce((t, n) => ({ ...t, ...n }), {})
  return transformed
}

function drawBox (x, y, w, h, isTop) {
  const { x: viewX, y: viewY, w: viewW, h: viewH } = viewTransform({ x, y, w, h })

  drawBoxView(viewX, viewY, viewW, viewH, { isTop })
}

function wrapLine (s, w) {
  if (s.length < w) return [s]
  if (w <= 0) return [s]

  const res = []
  let rest = s

  while (rest.length > w) {
    let wrapPoint = rest.slice(0, w).lastIndexOf(' ') + 1
    if (wrapPoint <= 0) {
      wrapPoint = rest.length
    }
    const l = rest.slice(0, wrapPoint)
    rest = rest.slice(wrapPoint)
    res.push(l)
  }
  res.push(rest)
  return res
}

function drawBoxView (viewX, viewY, viewW, viewH, { isTop, lines, shouldWrap = true }) {
  const [x, y, w, h] = [viewX, viewY, viewW, viewH].map(Math.round)
  for (let i = 0; i < (h - 1); i++) {
    stdout.cursorTo(x, y + 1 + i)
    stdout.write(VIEW_FRAME.EDGE.V)
    stdout.cursorTo(x + w - 1, y + 1 + i)
    stdout.write(VIEW_FRAME.EDGE.V)
  }

  drawEdgeH(x, y, w, true, !isTop)
  drawEdgeH(x, y + h, w, false)

  if (lines) {
    const blankLine = Array(w - 2).fill(' ').join('')

    let wrappedLines = shouldWrap
      ? lines
        .map(l => wrapLine(l, w - 6))
        .reduce((ls, acc) => ls.concat(acc), [])
      : lines

    if (wrappedLines.length > h - 1) {
      wrappedLines[h - 2] = '...'
    }

    if (wrappedLines.length < h - 1) {
      wrappedLines = wrappedLines.concat(Array((h - 1) - wrappedLines.length).fill(''))
    }

    const blob = wrappedLines.slice(0, h - 1).map(
      (l, ix) =>
        '\u001b[' + [y + 2 + ix, x + 2].join(';') + 'H' + blankLine +
        '\u001b[' + [y + 2 + ix, x + 4].join(';') + 'H' + l
    ).join('')

    stdout.write(blob)
  }
}

const prevLines = {}
function lineHasChanged (y, x, l) {
  if (!prevLines[y]) return true
  if (!prevLines[y][x]) return true
  return prevLines[y][x] !== l
}

function recordLines (y, lines) {
  lines.forEach((l, ix) => {
    prevLines[y + ix] = l
  })
}

const help = [
  '',
  'welcome to nomad :)',
  '',
  'nomad-term is a terminal multiplexer that provides a similar interface to the tiling window manager, xmonad. It uses node-pty to fork each child process within a virtual pseudoterminal, maintaining an in-memory visual representation of program output.',
  '',
  '',
  'controls',
  '----',
  '',
  'shift-tab      toggle between input/movement',
  'backspace      create a new terminal',
  'Q              quit nomad',
  'H              toggle help',
  '',
  '',
  'movement',
  '----',
  '',
  'j              select next terminal',
  'k              select previous terminal',
  'shift-j        swap current terminal with next terminal',
  'shift-k        swap current terminal with previous terminal',
  'shift-c        close selected terminal',
  'h              decrease main terminal size',
  'l              increase main terminal size',
  ',              increase number of primary terminals',
  '.              decrease number of secondary terminals',
  '␣ (space)      select next layout: normal / full',
  '[0-9]          select workspace 0 - 9',
  'shift-[0-9]    move selected terminal to workspace 0 - 9'
]

// TODO: User-controlled buffer scrolling
function drawBuffer (shell_id) {
  if (!areas[shell_id]) return

  const { x, y, w, h } = areas[shell_id]

  const st = subTerminals[shell_id]
  const fw = state.workspaces[state.focussed_workspace]

  const isFocussed = fw.shells && fw.shells.length && shell_id === fw.shells[fw.focussed_shell].id
  const showGuide = state.mode > 0 && isFocussed

  performance.mark('mark1')
  const lines = st.drawSubTerminal(w - 2, h - 1, { isFocussed, highlight: false })
  performance.mark('mark2')
  performance.measure('DRAW_SUB_TERMINAL', 'mark1', 'mark2')

  const blob = lines.map(
    (l, ix) =>
      lineHasChanged(y, x, l)
        ? '\u001b[' + [y + 2 + ix, x + 1].join(';') + 'H' + l
        : ''
  ).join('')

  stdout.write(blob)

  recordLines(y, lines)

  if (showGuide) {
    drawGuide(x, y, w, h)
  }

  performance.mark('mark3')
  performance.measure('OUTPUT_LINES', 'mark2', 'mark3')
}

function drawGuide (x, y, w, h) {
  const fw = state.workspaces[state.focussed_workspace]
  if (state.show_help) {
    const hbY = Math.round(y + h * 0.05)
    const hbW = Math.max(Math.round(2 * w / 3), 64)
    const hbX = Math.round(x + w / 2 - hbW / 2)
    const hbH = Math.min(Math.round(h - h * 0.1), 45)
    const helpBoxRect = [hbX, hbY, hbW, hbH]

    drawBoxView(...helpBoxRect, { isTop: true, lines: help })

    stdout.cursorTo(hbX + 2, hbY)
    stdout.write(
      ' nomad - help // space:' + (state.focussed_workspace + 1) +
      ' term:' + (fw.focussed_shell + 1) +
      ' view:' + ({ 0: 'normal', 1: 'full' }[fw.layout]) + ' '
    )

    stdout.cursorTo(hbX + hbW - 21, hbY)
    stdout.write('(press H to toggle)')
  } else {
    const hbW = Math.min(Math.max(Math.round(w * 0.6), w - 5), 40)
    const hbH = h < 10 ? 5 : 7

    const hbX = Math.round(x + w * 0.5 - hbW / 2)
    const hbY = Math.round(y + h * 0.5 - hbH / 2)

    const lines = hbH === 7 ? [
      '',
      'help    H   select  jk (^ to move)',
      'quit    Q   new     backspace',
      'close   C   toggle  ^-tab',
      'resize  hl  layout  . ␣ ,'
    ] : [
      '',
      'help   H, quit  Q, select [^]jk',
      'close  C, new  <-, toggle  ^-tab'
    ]

    const helpBoxRect = [hbX, hbY, hbW, hbH]

    drawBoxView(...helpBoxRect, { isTop: true, lines, shouldWrap: false })

    stdout.cursorTo(hbX + 2, hbY)
    stdout.write(
      ' nomad // ' + (state.focussed_workspace + 1) +
      ':' + (fw.focussed_shell + 1) +
      ' // ' + ({ 0: 'normal', 1: 'full' }[fw.layout]) + ' '
    )
  }
}

function drawBoxesH (x, w, h, shells) {
  if (shells.length === 0) return

  const divisions = shells.length
  const divisionH = Math.floor(h / divisions)

  drawBox(x, 0, w, h, true)

  const { h: totalViewH } = viewTransform({ h })

  let viewY = 0
  for (let i = 0; i < divisions; i++) {
    const y = (i + 1) * divisionH
    const {
      x: viewX,
      y: newViewY,
      w: viewW
    } = viewTransform({ x, y, w })

    let viewH = newViewY - viewY

    if (i === divisions - 1) {
      viewH = totalViewH - viewY - 1
    }

    if (i > 0) {
      drawEdgeH(viewX, viewY, viewW, false, true)
    }

    setBufferArea(viewX + 1, viewY, viewW, viewH, shells[i].id)

    viewY = newViewY
  }
}

let areas = {}

function setBufferArea (x, y, w, h, id) {
  areas[id] = { x, y, w, h }
  log.info({ areas })

  if (!subTerminals[id]) return
  // This is a side-effect, TODO - move this somewhere else
  subTerminals[id].resize(w - 2, h - 1)
  subTerminals[id].render()
}

function render () {
  // Render Layout 0

  if (!state) return

  const fw = state.workspaces[state.focussed_workspace]

  stdout.cursorTo(1, 1)

  // TODO: Column layout
  if (fw.layout === 1) {
    renderFullScreen(fw)
  } else if (fw.layout === 0) {
    renderTwoPanes(fw)
  }
}

function renderFullScreen (fw) {
  const { x: viewX, y: viewY, w: viewW, h: viewH } =
    viewTransform({ x: 0, y: 0, w: 100, h: 100 })

  const shellId = fw.shells[fw.focussed_shell].id

  // TODO: eugh. Should reset this more carefully
  areas = {}
  setBufferArea(viewX + 1, viewY, viewW, viewH - 1, shellId)
  drawBuffer(shellId)
  drawBox(0, 0, 100, 100, true)
}

function renderTwoPanes (fw) {
  const startIndex = limit(fw.start_last_shell_index, 0, fw.shells.length - 1)
  const startDivisions = startIndex + 1
  const endDivisions = fw.shells.length - startDivisions

  let w = 0

  if (endDivisions === 0) {
    w = 100
  } else if (startDivisions === 0) {
    w = 0
  } else {
    w = fw.start_size_pct
  }

  const h = 100

  // Reset all buffer areas
  areas = {}

  if (w !== 0) {
    drawBoxesH(0, w, h, fw.shells.slice(0, startDivisions))
  }
  if (w !== 100) {
    drawBoxesH(w, 100 - w, h, fw.shells.slice(startDivisions))
  }

  // Render all sub terminals
  Object.keys(subTerminals).forEach(drawBuffer)
}

function onData (data) {
  const action = mapKeyToAction(data)
  if (action) {
    // Stateful actions
    applyAction(action)

    log.info({ state, action })

    switch (action.type) {
      // Don't send the escape sequence to the program, otherwise
      // it could cause unexpected results with it
      case 'MODE_TOGGLE':
        return
      case 'QUIT':
        if (state && state.mode) {
          exit()
        }
        break
      case 'RESTART':
        log.info({ unimplemented: 'RESTART' })
        break
    }
  }

  if (!(state && state.mode)) {
    const fw = state.workspaces[state.focussed_workspace]

    // TODO: This is a potential attack vector - if an attacking program
    // can control which shell is focussed, it could potentially redirect
    // user input to another shell, e.g. when the user is entering a password
    //
    // One mitigation would be to reduce the posibility of other state changing
    // when state.mode is enabled. This is currently done explicitly for each
    // part of reduced state
    const focussedShell = fw.shells[fw.focussed_shell]
    const focussedShellId = focussedShell && focussedShell.id
    subTerminals[focussedShellId] && subTerminals[focussedShellId].writeToProc(data)
  }
}

function start () {
  /// ///////////////////////////////////////////////////////////
  //
  // nomad-term
  //
  // i like xmonad, ok.
  //
  /// ///////////////////////////////////////////////////////////
  //
  // 1. View based on state. Assume empty buffers in each pane.
  // 2. Plain text buffering into panes, scrolling to old output.
  // 3. Handling certain colour control sequences
  // 4. Handling control sequences that alter cursor position,
  //    pinning the viewport to the most recent panes-worth of
  //    output when handling them.
  //
  stdin.setRawMode(true)
  stdin.on('data', onData)

  let resizeTimeout
  stdout.on('resize', () => {
    clearScreen()

    if (resizeTimeout) clearTimeout(resizeTimeout)
    resizeTimeout = setTimeout(() => render(), 200)
  })

  process.on('SIGINT', () => {
    exit()
  })

  clearScreen()

  // Hide cursor
  stdout.write('\u001b[?25l')

  // Alt buffer
  stdout.write('\u001b[?47h')

  // Enable mouse tracking
  stdout.write('\u001b[?1000h')

  applyAction({
    type: 'LAUNCH_SHELL'
  })
}

start()
