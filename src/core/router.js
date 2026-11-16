// Minimal hash router. Hash URLs work on GitHub Pages without a 404 fallback.

/**
 * @param {Record<string, (params: URLSearchParams) => void>} routes  keyed by path, e.g. "/beranda"
 * @param {string} fallback  path used when the hash is empty or unknown
 */
export function createRouter(routes, fallback) {
  function current() {
    const raw = location.hash.replace(/^#/, '') || fallback;
    const [path, query = ''] = raw.split('?');
    return { path: routes[path] ? path : fallback, params: new URLSearchParams(query) };
  }

  function render() {
    const { path, params } = current();
    routes[path](params);
  }

  window.addEventListener('hashchange', render);

  return {
    start: render,
    current,
    go(path) {
      location.hash = path;
    },
  };
}
