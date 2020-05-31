
module.exports = {
  updateCursor ({ x, y }, { cols, rows }, seq) {
    const { code, text, params = [1] } = seq
    // TODO: Test that default count is 1
    const count = params[0] || 1
    const tabWidth = 8

    if (text) {
      return { x: x + text.length, y }
    }

    switch (code) {
      case 'HVP':
      case 'CUP':
        return {
          y: (params[0] || 1) - 1,
          x: (params[1] || 1) - 1
        }
      case 'CR':
        return {
          y,
          x: 0
        }
      case 'HTS':
        return {
          y,
          x: tabWidth + x - (x % tabWidth)
        }
      case 'CNL':
        return {
          y: y + count,
          x: 0
        }
      case 'CHA':
        return {
          y,
          x: params[0] - 1
        }
      case 'NL':
        return {
          y: y + 1,
          x
        }
      case 'RI':
        return {
          y: y - 1,
          x
        }
      case 'BS':
        return {
          y,
          x: x - 1
        }
    }

    if (code === 'CUU' || code === 'CUD' || code === 'CUF' || code === 'CUB') {
      let dx = 0
      let dy = 0
      switch (code) {
        case 'CUU': dy = -count; break
        case 'CUD': dy = count; break
        case 'CUF': dx = count; break
        case 'CUB': dx = -count; break
      }
      return {
        x: Math.max(Math.min(x + dx, cols), 0),
        y: Math.max(Math.min(y + dy, rows), 0)
      }
    }

    return { y, x }
  }
}
