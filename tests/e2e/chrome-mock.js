export function installChromeMock() {
  const noop = () => {};
  globalThis.chrome = {
    runtime: {
      lastError: null,
      sendMessage: (_msg, cb) => cb?.({ ok: true }),
      onMessage: { addListener: noop, removeListener: noop },
    },
    tabs: {
      query: async () => [{ id: 1, url: 'https://example.com/job' }],
      sendMessage: (_tabId, _msg, cb) => cb?.({ ok: true }),
    },
    scripting: {
      executeScript: async () => [],
    },
    storage: {
      local: {
        get: (_keys, cb) => {
          if (typeof cb === 'function') cb({});
          return Promise.resolve({});
        },
        set: (_value, cb) => {
          if (typeof cb === 'function') cb();
          return Promise.resolve();
        },
      },
    },
  };
}
