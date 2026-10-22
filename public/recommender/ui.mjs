import { availablePlan, recommend, validateCatalogue } from './engine.mjs';
import { COPY } from './copy.mjs';

const LOCALES = new Set(['en', 'ms', 'zh']);
const NOOP = () => {};

// Order-page details for official one-time passes. Monthly recommendations
// continue to use the admin-managed catalogue; SIM checkout fees are separate.
const ORDER_PASSES = new Map([
  ['ezday', { id: 'ezday', name: 'EZDAY', price: 3, dataGB: 5, validityDays: 1 }],
  ['ezweek', { id: 'ezweek', name: 'EZWEEK', price: 7, dataGB: 10, validityDays: 7 }],
  ['ez365d', { id: 'ez365d', name: 'EZ365D', price: 240, dataGB: 240, validityDays: 365 }],
]);

const ADMIN_COPY = {
  title: 'Plan catalogue',
  intro: 'Manage the plans used by the public recommender. Available plans can be recommended; Coming Soon and Inactive plans are excluded. Shared hotspot uses the same local data allowance. The SIM purchase fee is separate.',
  loading: 'Loading plan catalogue…',
  saving: 'Saving…',
  saved: 'Plan catalogue saved.',
  unavailable: 'Plan catalogue is unavailable. Please try again.',
  saveFailed: 'Could not save the plan catalogue. Please try again.',
  retry: 'Retry',
  add: 'Add plan',
  save: 'Save catalogue',
  remove: 'Remove',
  empty: 'No plans configured. Add a plan to begin.',
  id: 'ID',
  name: 'Name',
  price: 'Price (RM)',
  dataGB: 'Phone data (GB)',
  hotspotGB: 'Hotspot (GB)',
  hotspotMode: 'Hotspot mode',
  roamingGB: 'Roaming (GB)',
  validityDays: 'Validity (days)',
  status: 'Status',
  shared: 'Shared',
  separate: 'Separate',
  available: 'Available',
  comingSoon: 'Coming Soon',
  inactive: 'Inactive',
  newPlan: 'New plan',
  removePlan: 'Remove plan',
};

const PLAN_FIELDS = [
  'id', 'name', 'price', 'dataGB', 'hotspotGB', 'hotspotMode', 'roamingGB', 'validityDays', 'status',
];
const NUMERIC_PLAN_FIELDS = new Set(['price', 'dataGB', 'hotspotGB', 'roamingGB', 'validityDays']);
const PUBLIC_INPUT_MAX = Object.freeze({ dataGB: 1000, hotspotGB: 1000, roamingGB: 100, budget: 1000, minValidityDays: 366 });

function isLocale(value) {
  return typeof value === 'string' && LOCALES.has(value.toLowerCase());
}

function resolveLocale(preferred) {
  if (isLocale(preferred)) return preferred.toLowerCase();
  if (typeof document !== 'undefined' && isLocale(document.documentElement?.lang)) {
    return document.documentElement.lang.toLowerCase();
  }
  try {
    const stored = localStorage.getItem('eastel-lang');
    if (isLocale(stored)) return stored.toLowerCase();
  } catch {
    // Storage can be unavailable in privacy-restricted browsers.
  }
  return 'en';
}

function getCopy(locale) {
  return COPY[resolveLocale(locale)] ?? COPY.en;
}

function makeElement(tag, className = '', text = undefined) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}

function clearChildren(node) {
  while (node?.firstChild) node.removeChild(node.firstChild);
}

function listen(disposers, target, eventName, handler, options) {
  if (!target || typeof target.addEventListener !== 'function') return;
  target.addEventListener(eventName, handler, options);
  disposers.push(() => target.removeEventListener(eventName, handler, options));
}

function fill(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  ));
}

function formatQuantity(value) {
  if (!Number.isFinite(value)) return '0';
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(6)));
}

function formatMoney(value) {
  return Number(value).toFixed(2);
}

function numberFromInput(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function isValidMoney(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000000 &&
    Math.abs(value * 100 - Math.round(value * 100)) < 0.000001;
}

function defaultEndpoint(kind, supplied) {
  if (typeof supplied === 'string' && supplied.trim()) return supplied;
  const php = typeof window !== 'undefined' && /\.php(?:$|[?#])/.test(window.location?.pathname ?? '');
  if (kind === 'admin') return php ? '/api/plan-recommender-admin.php' : '/api/admin/plan-recommender';
  return php ? '/api/plan-recommender.php' : '/api/plan-recommender';
}

function defaultOrderUrl(endpoint, locale) {
  if (/\.php(?:$|[?#])/.test(String(endpoint))) return '/order.html';
  return `/${resolveLocale(locale)}/order`;
}

function requestOptions(signal) {
  const options = {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
  };
  if (signal) options.signal = signal;
  return options;
}

async function readJsonResponse(response) {
  let data = null;
  try {
    data = await response.json();
  } catch {
    throw new Error('Invalid server response.');
  }
  if ((response && response.ok === false) || !data || data.status !== 'success') {
    const message = data && typeof data.message === 'string' ? data.message : 'Request failed.';
    throw new Error(message);
  }
  return data;
}

async function fetchCatalogue(endpoint, signal) {
  const response = await fetch(endpoint, requestOptions(signal));
  const data = await readJsonResponse(response);
  if (!validateCatalogue(data.catalogue)) throw new Error('Invalid plan catalogue.');
  return data;
}

function apiMessage(target, text, retryLabel, retryAction, isError = true) {
  clearChildren(target);
  const box = makeElement('div', `plan-recommender-message${isError ? ' is-error' : ' is-success'}`);
  box.setAttribute('role', isError ? 'alert' : 'status');
  const message = makeElement('p', 'plan-recommender-message-text', text);
  box.appendChild(message);
  if (retryAction) {
    const retry = makeElement('button', 'plan-recommender-link', retryLabel || 'Retry', retryLabel || 'Retry');
    retry.type = 'button';
    listen([], retry, 'click', retryAction);
    // The listener above intentionally has its own lifetime: the button is removed with this message.
    box.appendChild(retry);
  }
  target.appendChild(box);
  return box;
}

function appendPlansLink(container, label, href) {
  if (!container || !label || !href) return;
  const link = makeElement('a', 'plan-recommender-link', label);
  link.href = href;
  container.appendChild(link);
}

function setupMount(root, id = '') {
  if (!root || typeof document === 'undefined' || typeof root.appendChild !== 'function') {
    return null;
  }
  const hadClass = Boolean(root.classList?.contains('plan-recommender'));
  root.classList?.add('plan-recommender');
  const section = makeElement('section', 'plan-recommender-widget');
  if (id) section.id = id;
  root.appendChild(section);
  const disposers = [];
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let active = true;
  const cleanup = () => {
    if (!active) return;
    active = false;
    controller?.abort();
    while (disposers.length) disposers.pop()();
    if (section.parentNode) section.parentNode.removeChild(section);
    if (!hadClass) root.classList?.remove('plan-recommender');
  };
  return { section, disposers, controller, cleanup, isActive: () => active };
}

function orderLink(orderUrl, planId, locale) {
  const raw = String(orderUrl || '');
  const params = { plan: planId, lang: resolveLocale(locale) };
  try {
    const base = document.baseURI || window.location.href;
    const url = new URL(raw, base);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    return url.toString();
  } catch {
    const hashIndex = raw.indexOf('#');
    const beforeHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
    const hash = hashIndex >= 0 ? raw.slice(hashIndex) : '';
    const separator = beforeHash.includes('?') ? (beforeHash.endsWith('?') || beforeHash.endsWith('&') ? '' : '&') : '?';
    return `${beforeHash}${separator}plan=${encodeURIComponent(planId)}&lang=${encodeURIComponent(params.lang)}${hash}`;
  }
}

function plansLink(root, endpoint, locale) {
  const explicit = root.getAttribute?.('data-plans-url') || root.dataset?.plansUrl;
  if (explicit) return String(explicit).replace('{locale}', resolveLocale(locale));
  const suffix = /\.php(?:$|[?#])/.test(String(endpoint)) ? '.php' : '';
  return `/${resolveLocale(locale)}/plans${suffix}#plan-recommender`;
}

function createNumberField(parent, name, label, value, index, { step = '0.01', min = '0', max = '1000000', required = true } = {}) {
  const field = makeElement('div', 'plan-recommender-field');
  const id = `plan-recommender-${name}-${index}`;
  const labelNode = makeElement('label', 'plan-recommender-label', label);
  labelNode.htmlFor = id;
  const input = makeElement('input', 'plan-recommender-input');
  input.type = 'number';
  input.id = id;
  input.name = name;
  input.value = String(value);
  input.min = min;
  input.max = max;
  input.step = step;
  input.inputMode = step === '1' ? 'numeric' : 'decimal';
  input.required = required;
  input.setAttribute('aria-required', String(required));
  input.autocomplete = 'off';
  field.append(labelNode, input);
  parent.appendChild(field);
  return input;
}

function renderPlanDetails(container, plan, copy, needs = null) {
  const list = makeElement('ul', 'plan-recommender-details');
  const dataNeed = needs ? formatQuantity(needs.dataGB) : formatQuantity(plan.dataGB);
  const hotspotNeed = needs ? formatQuantity(needs.hotspotGB) : formatQuantity(plan.hotspotGB);
  const roamingNeed = needs ? formatQuantity(needs.roamingGB) : formatQuantity(plan.roamingGB);
  const hotspotSpecified = !needs || needs.hotspotSpecified !== false;
  const roamingSpecified = !needs || needs.roamingSpecified !== false;
  const dataText = needs
    ? fill(copy.dataReason, { need: dataNeed, quota: formatQuantity(plan.dataGB) })
    : fill(copy.includedData, { quota: formatQuantity(plan.dataGB) });
  const hotspotText = needs
    ? fill(copy.hotspotReason, { need: hotspotNeed, quota: formatQuantity(plan.hotspotGB) })
    : fill(copy.includedHotspot, { quota: formatQuantity(plan.hotspotGB) });
  const details = [dataText];
  if (hotspotSpecified) {
    details.push(hotspotText);
    if (plan.hotspotMode === 'shared') {
      const combinedNeed = needs ? formatQuantity(needs.dataGB + needs.hotspotGB) : formatQuantity(plan.dataGB);
      details.push(needs
        ? fill(copy.shared, { quota: formatQuantity(plan.dataGB), need: combinedNeed })
        : fill(copy.includedShared, { quota: formatQuantity(plan.dataGB) }));
    } else {
      details.push(copy.separate);
    }
  } else {
    details.push(fill(copy.optionalHotspot, { quota: formatQuantity(plan.hotspotMode === 'shared' ? plan.dataGB : plan.hotspotGB) }));
  }
  details.push(roamingSpecified
    ? (needs
      ? fill(copy.roamingReason, { need: roamingNeed, quota: formatQuantity(plan.roamingGB) })
      : fill(copy.includedRoaming, { quota: formatQuantity(plan.roamingGB) }))
    : fill(copy.optionalRoaming, { quota: formatQuantity(plan.roamingGB) }));
  details.push(needs
    ? fill(copy.validityReason, { days: plan.validityDays, need: needs.minValidityDays })
    : fill(copy.includedValidity, { days: plan.validityDays }));
  details.forEach((text) => list.appendChild(makeElement('li', '', text)));
  container.appendChild(list);
}

function renderClosestReasons(container, recommendation, needs, copy) {
  const plan = recommendation.plan;
  const gaps = recommendation.gaps;
  if (!plan || !gaps) return;
  const list = makeElement('ul', 'plan-recommender-closest-reasons');
  const addReason = (template, values) => list.appendChild(makeElement('li', '', fill(template, values)));
  if (gaps.sharedDataGB > 0) {
    addReason(copy.closestShared, {
      gap: formatQuantity(gaps.sharedDataGB),
      need: formatQuantity(needs.dataGB + needs.hotspotGB),
      quota: formatQuantity(plan.dataGB),
    });
  } else {
    if (gaps.dataGB > 0) {
      addReason(copy.closestData, {
        gap: formatQuantity(gaps.dataGB),
        need: formatQuantity(needs.dataGB),
        quota: formatQuantity(plan.dataGB),
      });
    }
    if (gaps.hotspotGB > 0) {
      addReason(copy.closestHotspot, {
        gap: formatQuantity(gaps.hotspotGB),
        need: formatQuantity(needs.hotspotGB),
        quota: formatQuantity(plan.hotspotGB),
      });
    }
  }
  if (gaps.roamingGB > 0) {
    addReason(copy.closestRoaming, {
      gap: formatQuantity(gaps.roamingGB),
      need: formatQuantity(needs.roamingGB),
      quota: formatQuantity(plan.roamingGB),
    });
  }
  if (gaps.validityDays > 0) {
    addReason(copy.closestValidity, {
      gap: formatQuantity(gaps.validityDays),
      need: formatQuantity(needs.minValidityDays),
      quota: formatQuantity(plan.validityDays),
    });
  }
  if (list.children.length) container.appendChild(list);
}

function renderPublicResult(container, recommendation, needs, copy, locale, orderUrl, plansUrl) {
  clearChildren(container);
  if (!recommendation.plan) {
    const message = makeElement('div', 'plan-recommender-result is-error');
    message.setAttribute('role', 'alert');
    message.appendChild(makeElement('p', '', recommendation.status === 'no_match' ? copy.noAvailable : copy.unavailable));
    appendPlansLink(message, copy.viewPlans, plansUrl);
    container.appendChild(message);
    return;
  }

  const plan = recommendation.plan;
  const isClosest = recommendation.status === 'no_match';
  const isOverBudget = recommendation.status === 'over_budget';
  const card = makeElement('article', `plan-recommender-result${isOverBudget ? ' is-over-budget' : ''}${isClosest ? ' is-closest' : ''}`);
  card.dataset.status = recommendation.status;
  card.setAttribute('aria-live', 'polite');
  card.appendChild(makeElement('h3', 'plan-recommender-result-title', isClosest ? copy.noMatch : isOverBudget ? copy.over : copy.match));
  if (isClosest) {
    card.appendChild(makeElement('p', 'plan-recommender-closest-intro', copy.closestReason));
    renderClosestReasons(card, recommendation, needs, copy);
  }
  const planHeading = makeElement('div', 'plan-recommender-plan-heading');
  planHeading.appendChild(makeElement('strong', 'plan-recommender-plan-name', plan.name));
  planHeading.appendChild(makeElement('span', 'plan-recommender-plan-price', fill(copy.price, {
    price: formatMoney(plan.price), days: plan.validityDays,
  })));
  card.appendChild(planHeading);
  renderPlanDetails(card, plan, copy, needs);
  const budgetText = isOverBudget
    ? fill(copy.extra, { amount: formatMoney(recommendation.shortfall) })
    : fill(copy.budgetReason, { price: formatMoney(plan.price), budget: formatMoney(needs.budget) });
  card.appendChild(makeElement('p', 'plan-recommender-budget', budgetText));
  const actionLabel = isClosest
    ? (isOverBudget ? copy.chooseClosestOver : copy.chooseClosest)
    : (isOverBudget ? copy.chooseOver : copy.choose);
  const action = makeElement('a', `plan-recommender-action${isOverBudget ? ' is-over-budget' : ''}`, actionLabel);
  action.href = orderLink(orderUrl, plan.id, locale);
  card.appendChild(action);
  card.appendChild(makeElement('p', 'plan-recommender-disclaimer', copy.disclaimer));
  container.appendChild(card);
}

function buildNeeds(form, inputs) {
  const values = {};
  let valid = true;
  Object.entries(inputs).forEach(([name, input]) => {
    const value = numberFromInput(input.value);
    const optional = name === 'hotspotGB' || name === 'roamingGB';
    const max = PUBLIC_INPUT_MAX[name] ?? 1000000;
    const isDays = name === 'minValidityDays';
    const acceptable = (optional && value === null) || (value !== null && value >= (isDays ? 1 : 0) && value <= max &&
      (!isDays || Number.isInteger(value)));
    // Keep the explicit money check separate so the expression stays readable and strict.
    const finalAcceptable = acceptable && (optional && value === null || name !== 'budget' || isValidMoney(value));
    input.setAttribute('aria-invalid', finalAcceptable ? 'false' : 'true');
    if (!finalAcceptable) valid = false;
    values[name] = value;
  });
  if (!valid) return null;
  return {
    dataGB: values.dataGB,
    hotspotGB: values.hotspotGB ?? 0,
    roamingGB: values.roamingGB ?? 0,
    budget: values.budget,
    minValidityDays: values.minValidityDays,
    hotspotSpecified: values.hotspotGB !== null,
    roamingSpecified: values.roamingGB !== null,
  };
}

export function mountRecommender(root, options = {}) {
  const mount = setupMount(root, 'plan-recommender');
  if (!mount) return NOOP;
  const locale = resolveLocale(options.locale);
  const copy = getCopy(locale);
  const endpoint = defaultEndpoint('public', options.endpoint);
  const orderUrl = options.orderUrl || defaultOrderUrl(endpoint, locale);
  const plansUrl = plansLink(root, endpoint, locale);
  const section = mount.section;
  const title = makeElement('h2', 'plan-recommender-title', copy.title);
  const intro = makeElement('p', 'plan-recommender-intro', copy.intro);
  const form = makeElement('form', 'plan-recommender-form');
  form.noValidate = true;
  const fields = makeElement('div', 'plan-recommender-fields');
  const inputs = {
    dataGB: createNumberField(fields, 'dataGB', copy.data, 0, 'data', { step: '10', max: '1000' }),
    hotspotGB: createNumberField(fields, 'hotspotGB', copy.hotspot, '', 'hotspot', { step: '10', max: '1000', required: false }),
    roamingGB: createNumberField(fields, 'roamingGB', copy.roaming, '', 'roaming', { step: '1', max: '100', required: false }),
    budget: createNumberField(fields, 'budget', copy.budget, 100, 'budget', { step: '1', max: '1000' }),
    minValidityDays: createNumberField(fields, 'minValidityDays', copy.days, 30, 'days', { step: '1', min: '1', max: '366' }),
  };
  const period = makeElement('p', 'plan-recommender-period', copy.period);
  const submit = makeElement('button', 'plan-recommender-submit', copy.find);
  submit.type = 'submit';
  const status = makeElement('div', 'plan-recommender-status');
  status.setAttribute('aria-live', 'polite');
  const results = makeElement('div', 'plan-recommender-results');
  form.append(fields, period, submit);
  section.append(title, intro, form, status, results);

  let sequence = 0;
  let pendingController = null;
  const clearRecommendation = () => {
    sequence += 1;
    pendingController?.abort();
    pendingController = null;
    submit.disabled = false;
    clearChildren(status);
    clearChildren(results);
  };
  const setStatus = (message, isError = false, retryAction = null) => {
    if (!message) {
      clearChildren(status);
      return;
    }
    apiMessage(status, message, copy.retry, retryAction, isError);
  };
  const showUnavailable = () => {
    const message = apiMessage(status, copy.unavailable, copy.retry, submitForm, true);
    appendPlansLink(message, copy.viewPlans, plansUrl);
  };
  const submitForm = async () => {
    clearRecommendation();
    const needs = buildNeeds(form, inputs);
    if (!needs) {
      setStatus(copy.invalid, true);
      return;
    }
    const requestId = sequence;
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    pendingController = controller;
    submit.disabled = true;
    setStatus(copy.loading);
    try {
      const data = await fetchCatalogue(endpoint, controller?.signal);
      if (!mount.isActive() || requestId !== sequence) return;
      const recommendation = recommend(data.catalogue, needs);
      if (recommendation.status === 'invalid') {
        showUnavailable();
      } else {
        renderPublicResult(results, recommendation, needs, copy, locale, orderUrl, plansUrl);
        clearChildren(status);
      }
    } catch (error) {
      if (!mount.isActive() || requestId !== sequence || error?.name === 'AbortError') return;
      showUnavailable();
    } finally {
      if (mount.isActive() && requestId === sequence) {
        pendingController = null;
        submit.disabled = false;
      }
    }
  };
  listen(mount.disposers, form, 'submit', (event) => {
    event.preventDefault();
    void submitForm();
  });
  Object.values(inputs).forEach((input) => {
    listen(mount.disposers, input, 'input', () => {
      clearRecommendation();
      input.setAttribute('aria-invalid', 'false');
    });
  });
  return mount.cleanup;
}

function newPlanId(plans) {
  let index = 1;
  while (plans.some((plan) => plan.id === `new-plan-${index}`)) index += 1;
  return `new-plan-${index}`;
}

function serializeAdminPlan(plan) {
  const result = {};
  PLAN_FIELDS.forEach((field) => {
    result[field] = NUMERIC_PLAN_FIELDS.has(field) ? numberFromInput(String(plan[field] ?? '')) : String(plan[field] ?? '');
  });
  return result;
}

function renderAdminRows(tbody, catalogue, update, remove) {
  clearChildren(tbody);
  if (!catalogue?.plans?.length) {
    const row = makeElement('tr', 'plan-recommender-empty-row');
    const cell = makeElement('td', '', ADMIN_COPY.empty);
    cell.colSpan = PLAN_FIELDS.length + 1;
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }
  catalogue.plans.forEach((plan, index) => {
    const row = makeElement('tr', 'plan-recommender-admin-row');
    const control = (field) => {
      const cell = makeElement('td', 'plan-recommender-admin-cell');
      const label = makeElement('label', 'plan-recommender-sr-only', ADMIN_COPY[field]);
      const id = `plan-admin-${field}-${index}`;
      label.htmlFor = id;
      let input;
      if (field === 'hotspotMode' || field === 'status') {
        input = makeElement('select', 'plan-recommender-admin-input');
        const values = field === 'hotspotMode'
          ? [['shared', ADMIN_COPY.shared], ['separate', ADMIN_COPY.separate]]
          : [['available', ADMIN_COPY.available], ['coming_soon', ADMIN_COPY.comingSoon], ['inactive', ADMIN_COPY.inactive]];
        values.forEach(([value, text]) => {
          const option = makeElement('option', '', text);
          option.value = value;
          input.appendChild(option);
        });
        input.value = String(plan[field]);
      } else {
        input = makeElement('input', 'plan-recommender-admin-input');
        input.type = NUMERIC_PLAN_FIELDS.has(field) ? 'number' : 'text';
        if (NUMERIC_PLAN_FIELDS.has(field)) {
          input.step = field === 'validityDays' ? '1' : '0.01';
          input.min = field === 'validityDays' ? '1' : '0';
          input.max = field === 'validityDays' ? '366' : '1000000';
          input.inputMode = field === 'validityDays' ? 'numeric' : 'decimal';
        } else {
          input.maxLength = field === 'id' ? 40 : 80;
        }
        input.value = String(plan[field] ?? '');
      }
      input.id = id;
      input.name = field;
      input.setAttribute('aria-label', ADMIN_COPY[field]);
      listen([], input, 'input', () => update(index, field, input.value));
      listen([], input, 'change', () => update(index, field, input.value));
      cell.append(label, input);
      return cell;
    };
    PLAN_FIELDS.forEach((field) => row.appendChild(control(field)));
    const actionCell = makeElement('td', 'plan-recommender-admin-cell plan-recommender-admin-actions');
    const removeButton = makeElement('button', 'plan-recommender-link', ADMIN_COPY.remove);
    removeButton.type = 'button';
    removeButton.setAttribute('aria-label', `${ADMIN_COPY.removePlan}: ${plan.name || plan.id || index + 1}`);
    listen([], removeButton, 'click', () => remove(index));
    actionCell.appendChild(removeButton);
    row.appendChild(actionCell);
    tbody.appendChild(row);
  });
}

export function mountAdmin(root, options = {}) {
  const mount = setupMount(root, 'plan-recommender-admin');
  if (!mount) return NOOP;
  const endpoint = defaultEndpoint('admin', options.endpoint);
  const section = mount.section;
  const title = makeElement('h2', 'plan-recommender-title', ADMIN_COPY.title);
  const intro = makeElement('p', 'plan-recommender-intro', ADMIN_COPY.intro);
  const status = makeElement('div', 'plan-recommender-status');
  status.setAttribute('aria-live', 'polite');
  const form = makeElement('form', 'plan-recommender-admin-form');
  const editor = makeElement('fieldset', 'plan-recommender-editor');
  const tableWrap = makeElement('div', 'plan-recommender-table-wrap');
  const table = makeElement('table', 'plan-recommender-admin-table');
  const thead = makeElement('thead');
  const headerRow = makeElement('tr');
  PLAN_FIELDS.forEach((field) => headerRow.appendChild(makeElement('th', '', ADMIN_COPY[field])));
  headerRow.appendChild(makeElement('th', '', ''));
  thead.appendChild(headerRow);
  const tbody = makeElement('tbody');
  table.append(thead, tbody);
  tableWrap.appendChild(table);
  const actions = makeElement('div', 'plan-recommender-admin-toolbar');
  const addButton = makeElement('button', 'plan-recommender-link', ADMIN_COPY.add);
  addButton.type = 'button';
  const saveButton = makeElement('button', 'plan-recommender-submit', ADMIN_COPY.save);
  saveButton.type = 'submit';
  actions.append(addButton, saveButton);
  editor.append(tableWrap, actions);
  form.appendChild(editor);
  section.append(title, intro, status, form);

  let catalogue = null;
  let csrfToken = '';
  let pendingController = null;
  let saving = false;
  const setEditorDisabled = (disabled) => {
    editor.disabled = disabled;
    editor.querySelectorAll?.('input, select, button').forEach((control) => {
      control.disabled = disabled;
    });
  };
  const setStatus = (message, kind = 'neutral', retryAction = null) => {
    if (!message) {
      clearChildren(status);
      return;
    }
    const retryLabel = ADMIN_COPY.retry;
    apiMessage(status, message, retryLabel, retryAction, kind === 'error');
  };
  const update = (index, field, value) => {
    if (saving || !catalogue?.plans[index]) return;
    catalogue.plans[index][field] = NUMERIC_PLAN_FIELDS.has(field) ? numberFromInput(value) : value;
    clearChildren(status);
  };
  const remove = (index) => {
    if (saving || !catalogue) return;
    catalogue.plans.splice(index, 1);
    renderAdminRows(tbody, catalogue, update, remove);
    setEditorDisabled(false);
    clearChildren(status);
  };
  const render = () => {
    renderAdminRows(tbody, catalogue, update, remove);
    setEditorDisabled(editor.disabled || saving);
  };

  const load = async () => {
    pendingController?.abort();
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    pendingController = controller;
    setStatus(ADMIN_COPY.loading);
    setEditorDisabled(true);
    try {
      const data = await fetchCatalogue(endpoint, controller?.signal);
      if (!mount.isActive() || pendingController !== controller) return;
      catalogue = {
        version: 1,
        plans: data.catalogue.plans.map((plan) => serializeAdminPlan(plan)),
      };
      csrfToken = typeof data.csrf_token === 'string' ? data.csrf_token : csrfToken;
      render();
      clearChildren(status);
    } catch (error) {
      if (!mount.isActive() || error?.name === 'AbortError') return;
      catalogue = null;
      render();
      setStatus(ADMIN_COPY.unavailable, 'error', load);
    } finally {
      if (mount.isActive() && pendingController === controller) {
        pendingController = null;
        setEditorDisabled(false);
      }
    }
  };

  const save = async () => {
    if (!catalogue || saving) return;
    saving = true;
    setEditorDisabled(true);
    setStatus(ADMIN_COPY.saving);
    const payload = {
      version: 1,
      plans: catalogue.plans.map((plan) => serializeAdminPlan(plan)),
    };
    try {
      const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
      if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
      const response = await fetch(endpoint, {
        ...requestOptions(),
        method: 'POST',
        headers,
        body: JSON.stringify({ catalogue: payload }),
      });
      const data = await readJsonResponse(response);
      if (!validateCatalogue(data.catalogue)) throw new Error('Invalid server response.');
      catalogue = {
        version: 1,
        plans: data.catalogue.plans.map((plan) => serializeAdminPlan(plan)),
      };
      if (typeof data.csrf_token === 'string') csrfToken = data.csrf_token;
      render();
      setStatus(ADMIN_COPY.saved, 'success');
    } catch (error) {
      setStatus(typeof error?.message === 'string' && error.message !== 'Request failed.' ? error.message : ADMIN_COPY.saveFailed, 'error', save);
    } finally {
      saving = false;
      if (mount.isActive()) {
        setEditorDisabled(false);
      }
    }
  };

  listen(mount.disposers, addButton, 'click', () => {
    if (saving || !catalogue) return;
    catalogue.plans.push({
      id: newPlanId(catalogue.plans), name: ADMIN_COPY.newPlan, price: 0, dataGB: 0,
      hotspotGB: 0, hotspotMode: 'separate', roamingGB: 0, validityDays: 30, status: 'inactive',
    });
    render();
    clearChildren(status);
  });
  listen(mount.disposers, form, 'submit', (event) => {
    event.preventDefault();
    void save();
  });
  void load();
  return mount.cleanup;
}

function selectionPlanId() {
  if (typeof window === 'undefined') return '';
  try {
    return (new URLSearchParams(window.location.search).get('plan') || '').toLowerCase();
  } catch {
    return '';
  }
}

function renderSelection(container, plan, copy, locale, endpoint, root) {
  clearChildren(container);
  if (!plan) {
    const message = makeElement('div', 'plan-recommender-result is-no-match');
    message.setAttribute('role', 'alert');
    message.appendChild(makeElement('p', '', copy.selectionInvalid));
    const link = makeElement('a', 'plan-recommender-action', copy.change);
    link.href = plansLink(root, endpoint, locale);
    message.appendChild(link);
    container.appendChild(message);
    return;
  }
  const card = makeElement('article', 'plan-recommender-result plan-recommender-selection');
  const heading = makeElement('h3', 'plan-recommender-result-title', copy.selected);
  card.appendChild(heading);
  const planHeading = makeElement('div', 'plan-recommender-plan-heading');
  planHeading.appendChild(makeElement('strong', 'plan-recommender-plan-name', plan.name));
  planHeading.appendChild(makeElement('span', 'plan-recommender-plan-price', fill(copy.price, {
    price: formatMoney(plan.price), days: plan.validityDays,
  })));
  card.appendChild(planHeading);
  if (ORDER_PASSES.has(plan.id)) {
    const details = makeElement('ul', 'plan-recommender-reasons');
    details.appendChild(makeElement('li', '', fill(copy.includedData, { quota: plan.dataGB })));
    details.appendChild(makeElement('li', '', locale === 'zh' ? '语音通话：30 分钟。' : locale === 'ms' ? 'Panggilan suara: 30 minit.' : 'Voice calls: 30 minutes.'));
    details.appendChild(makeElement('li', '', fill(copy.includedValidity, { days: plan.validityDays })));
    card.appendChild(details);
  } else {
    renderPlanDetails(card, plan, copy);
  }
  card.appendChild(makeElement('p', 'plan-recommender-disclaimer', copy.disclaimer));
  const link = makeElement('a', 'plan-recommender-action', copy.change);
  link.href = plansLink(root, endpoint, locale);
  card.appendChild(link);
  const hidden = makeElement('input');
  hidden.type = 'hidden';
  hidden.name = 'selected_plan';
  hidden.value = plan.id;
  card.appendChild(hidden);
  container.appendChild(card);
}

export function mountSelection(root, options = {}) {
  const mount = setupMount(root, 'plan-selection');
  if (!mount) return NOOP;
  const endpoint = defaultEndpoint('public', options.endpoint);
  const section = mount.section;
  const title = makeElement('h2', 'plan-recommender-title');
  const status = makeElement('div', 'plan-recommender-status');
  status.setAttribute('aria-live', 'polite');
  const content = makeElement('div', 'plan-recommender-results');
  section.append(title, status, content);
  let locale = resolveLocale(options.locale);
  let currentPlan = null;
  let requestSequence = 0;
  let pendingController = null;
  let selectionLoading = false;

  const renderCurrent = () => {
    const copy = getCopy(locale);
    title.textContent = copy.selected;
    renderSelection(content, currentPlan, copy, locale, endpoint, root);
  };
  const load = async () => {
    const id = selectionPlanId();
    requestSequence += 1;
    pendingController?.abort();
    currentPlan = null;
    selectionLoading = Boolean(id);
    if (!id) {
      selectionLoading = false;
      section.hidden = true;
      clearChildren(status);
      clearChildren(content);
      title.textContent = '';
      pendingController = null;
      return;
    }
    section.hidden = false;
    if (ORDER_PASSES.has(id)) {
      currentPlan = ORDER_PASSES.get(id);
      selectionLoading = false;
      clearChildren(status);
      pendingController = null;
      renderCurrent();
      return;
    }
    const requestId = requestSequence;
    title.textContent = getCopy(locale).selected;
    clearChildren(content);
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    pendingController = controller;
    const copy = getCopy(locale);
    apiMessage(status, copy.loading, '', null, false);
    try {
      const data = await fetchCatalogue(endpoint, controller?.signal);
      if (!mount.isActive() || requestId !== requestSequence) return;
      currentPlan = availablePlan(data.catalogue, id);
      selectionLoading = false;
      clearChildren(status);
      renderCurrent();
    } catch (error) {
      if (!mount.isActive() || requestId !== requestSequence || error?.name === 'AbortError') return;
      selectionLoading = false;
      apiMessage(status, copy.unavailable, copy.retry, load, true);
      clearChildren(content);
    } finally {
      if (mount.isActive() && requestId === requestSequence) {
        pendingController = null;
        selectionLoading = false;
      }
    }
  };
  const onLanguageChanged = (event) => {
    const detail = event?.detail;
    const candidate = typeof detail === 'string' ? detail : detail?.locale || detail?.lang;
    locale = resolveLocale(candidate);
    if (section.hidden) return;
    if (selectionLoading) {
      title.textContent = getCopy(locale).selected;
      apiMessage(status, getCopy(locale).loading, '', null, false);
      return;
    }
    renderCurrent();
  };
  const onPopState = () => { void load(); };
  if (typeof document !== 'undefined') listen(mount.disposers, document, 'languageChanged', onLanguageChanged);
  if (typeof window !== 'undefined') {
    listen(mount.disposers, window, 'languageChanged', onLanguageChanged);
    listen(mount.disposers, window, 'popstate', onPopState);
  }
  void load();
  return mount.cleanup;
}
