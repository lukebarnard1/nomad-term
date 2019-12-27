const {
  performance,
  PerformanceObserver
} = require('perf_hooks');

const log = require('./log')

const obs = new PerformanceObserver((list, observer) => {
  const entries = list.getEntries()
  log.info({
    perfEntries: entries
  });

  performance.clearMarks();
});
obs.observe({ entryTypes: ['measure'], buffered: true });

module.exports = {
  performance
}
