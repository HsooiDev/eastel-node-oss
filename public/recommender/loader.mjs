import { mountAdmin, mountRecommender, mountSelection } from './ui.mjs?v=20261007c';

const mounted = new WeakMap();

function validLocale(value) {
  return typeof value === 'string' && ['en', 'ms', 'zh'].includes(value.toLowerCase()) ? value.toLowerCase() : undefined;
}

function pageIsPhp() {
  return typeof window !== 'undefined' && /\.php(?:$|[?#])/.test(window.location?.pathname ?? '');
}

function fallbackEndpoint(kind) {
  if (pageIsPhp()) return kind === 'admin' ? '/api/plan-recommender-admin.php' : '/api/plan-recommender.php';
  return kind === 'admin' ? '/api/admin/plan-recommender' : '/api/plan-recommender';
}

function fallbackOrderUrl(endpoint, locale) {
  return /\.php(?:$|[?#])/.test(String(endpoint)) ? '/order.html' : `/${locale || 'en'}/order`;
}

function queryLocale() {
  if (typeof window === 'undefined') return undefined;
  try {
    return validLocale(new URLSearchParams(window.location.search).get('lang'));
  } catch {
    return undefined;
  }
}

function localeFromPage({ preferStored = false } = {}) {
  const fromQuery = queryLocale();
  if (fromQuery) return fromQuery;
  const lang = validLocale(typeof document !== 'undefined' ? document.documentElement?.lang : undefined);
  if (lang && !preferStored) return lang;
  try {
    const stored = localStorage.getItem('eastel-lang');
    if (validLocale(stored)) return validLocale(stored);
  } catch {
    // Ignore unavailable browser storage.
  }
  if (lang) return lang;
  return undefined;
}

export function mountRecommenders(scope = (typeof document !== 'undefined' ? document : null)) {
  if (!scope || typeof scope.querySelectorAll !== 'function') return () => {};
  const cleanups = [];
  scope.querySelectorAll('[data-recommender="public"], [data-recommender="admin"], [data-recommender="selection"]').forEach((root) => {
    const previous = mounted.get(root);
    if (previous) previous();
    const kind = root.getAttribute('data-recommender');
    const endpoint = root.getAttribute('data-endpoint') || fallbackEndpoint(kind);
    const rootLocale = validLocale(root.getAttribute('data-locale'));
    const locale = kind === 'selection'
      ? localeFromPage({ preferStored: true }) || rootLocale
      : rootLocale || localeFromPage();
    let cleanup;
    if (kind === 'public') {
      cleanup = mountRecommender(root, {
        locale,
        endpoint,
        orderUrl: root.getAttribute('data-order-url') || fallbackOrderUrl(endpoint, locale),
      });
    } else if (kind === 'admin') {
      cleanup = mountAdmin(root, { endpoint });
    } else {
      cleanup = mountSelection(root, { locale, endpoint });
    }
    mounted.set(root, cleanup);
    cleanups.push(() => {
      cleanup();
      mounted.delete(root);
    });
  });
  return () => {
    while (cleanups.length) cleanups.pop()();
  };
}

function autoMount() {
  mountRecommenders(document);
}

if (typeof document !== 'undefined') {
  const languageTarget = document.documentElement;
  if (typeof MutationObserver === 'function' && languageTarget) {
    let previousLanguage = validLocale(languageTarget.lang);
    const observer = new MutationObserver(() => {
      const nextLanguage = validLocale(languageTarget.lang);
      if (!nextLanguage || nextLanguage === previousLanguage) return;
      previousLanguage = nextLanguage;
      window.dispatchEvent(new CustomEvent('languageChanged', { detail: { locale: nextLanguage } }));
    });
    observer.observe(languageTarget, { attributes: true, attributeFilter: ['lang'] });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', autoMount, { once: true });
  else autoMount();
  window.addEventListener('languageChanged', () => mountRecommenders(document));
  window.addEventListener('planRecommenderReady', () => mountRecommenders(document));
}
