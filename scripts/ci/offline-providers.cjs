// CI defense in depth: provider tests can stub fetch, but never call live providers.
const originalFetch = globalThis.fetch;
globalThis.fetch = function offlineProviders(input, ...args) {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (/(^|\.)(googleapis\.com|tavily\.com)$/.test(url.hostname)) {
    return Promise.reject(new Error('CI blocks live Gemini/Tavily HTTP calls'));
  }
  return originalFetch.call(this, input, ...args);
};
