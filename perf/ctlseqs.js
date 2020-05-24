const {
  performance,
  PerformanceObserver
} = require('perf_hooks')

const obs = new PerformanceObserver((list, observer) => {
  const entries = list.getEntries()
  console.info(entries.map(({ name, duration }) => ({ name, duration })))

  performance.clearMarks()
})
obs.observe({ entryTypes: ['measure'], buffered: true })

const measureFn = (fn, name) => {
  performance.mark('mark1')
  fn()
  performance.mark('mark2')
  performance.measure(name, 'mark1', 'mark2')
}

const { getCtlSeqs } = require('../ctlseqs.js')

const seqs = '\u001b7\u001b[?47h\u001b[?1h\u001b=\u001b[H\u001b[2J\u001b[?2004h\u001b[?1004h\u001b[8;59;189t\u001b[r\u001b[1;1H\u001b[m\u001b[38;5;252m\u001b[48;5;237m'

const d = new Array(10000000).fill(seqs)

const s = [300, 500, 1000, 2000, 5000].map(
  n => d.slice(0, n).join('')
)

// ~300ms (before)
// ~75ms
measureFn(() => {
  console.info(getCtlSeqs(s[0]).outs.length)
}, '300n arbitrary sequences')

// ~60ms
measureFn(() => {
  console.info(getCtlSeqs(s[1]).outs.length)
}, '1000n arbitrary sequences')

// ~70ms
measureFn(() => {
  console.info(getCtlSeqs(s[2]).outs.length)
}, '100000n arbitrary sequences')

// ~150ms
measureFn(() => {
  console.info(getCtlSeqs(s[3]).outs.length)
}, '1000000n arbitrary sequences')

// ~850ms
measureFn(() => {
  console.info(getCtlSeqs(s[4]).outs.length)
}, '10000000n arbitrary sequences')
