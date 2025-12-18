
module.exports = {
  updateCursor ({ x, y, style }, { cols, rows }, seq) {
    const { code, text, params = [1] } = seq
    // TODO: Test that default count is 1
    const count = params[0] || 1
    const tabWidth = 8

    if (text) {
      return { x: x + text.length, y, style }
    }

    let update = {};

    switch (code) {
      case 'HVP':
      case 'CUP':
        update = {
          y: (params[0] || 1) - 1,
          x: (params[1] || 1) - 1
        }
        break
      case 'CR':
        update.x = 0;
        break
      case 'HTS':
        update.x = tabWidth + x - (x % tabWidth);
        break
      case 'CNL':
        update = {
          y: y + count,
          x: 0
        }
        break
      case 'CHA':
        update.x = params[0] - 1;
        break
      case 'NL':
        update.y = y + 1;
        break
      case 'RI':
        update.y = y - 1;
        break
      case 'BS':
        update.x = x - 1;
        break
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
      update.x = Math.max(Math.min(x + dx, cols), 0);
      update.y = Math.max(Math.min(y + dy, rows), 0);
    }

    switch (code) {
      case 'DECSCUSR':
        update.style = params[0] || 0;
      break;
    }

    return { y, x, style, ...update }
  }
}
