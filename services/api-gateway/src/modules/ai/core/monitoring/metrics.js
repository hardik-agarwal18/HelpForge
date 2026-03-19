const metricsStore = new Map();

export const incrementMetric = (name, value = 1) => {
  const current = metricsStore.get(name) || 0;
  const nextValue = current + value;
  metricsStore.set(name, nextValue);
  return nextValue;
};

export const getMetric = (name) => metricsStore.get(name) || 0;

export const resetMetrics = () => {
  metricsStore.clear();
};

export default {
  incrementMetric,
  getMetric,
  resetMetrics,
};
