import {
  applySuggestion,
  currentSuggestProvider,
  fetchSuggestions,
  SUGGEST_PROVIDER_LABEL,
  syncSuggestEngineCookie,
} from "./autocomplete";
import {
  loadBangMapForTrigger,
  loadHotBangMap,
  prefetchFullBangMap,
} from "./bangs-loader";
import {
  applyCustomBangs,
  displayBangTemplate,
  loadCustomBangs,
  normalizeBangTemplate,
  previewBangRedirect,
  saveCustomBangs,
  validateBangInput,
} from "./custom-bangs";
import {
  canResolveWithMap,
  withPrefsOverlays,
  INLINE_HOT_MAP,
} from "../shared/hot-redirect";
import {
  type Bang,
  ensureEssentialBangs,
  extractBangTrigger,
  extractSnapTriggers,
  getBangPrefix,
  getDefaultBangTrigger,
  matchBang,
  resolveBangRedirectUrl,
  setBangPrefix,
  setDefaultBangTrigger,
} from "./redirect";
import {
  getSearxInstanceHost,
  SEARX_INSTANCES,
  searxInstanceLabel,
  setSearxInstanceHost,
  syncSearxInstanceCookie,
} from "./searx-instances";
import {
  isKnownSearxHost,
  parseSearxHostInput,
  searxSearchTemplate,
} from "../shared/searx";
import {
  buildShareHash,
  decodeSharePayload,
  encodeSharePayload,
  extractShareFromHash,
  normalizeBangPrefix,
  sharePrefsEqual,
  summarizeSharePrefs,
  type ShareablePrefs,
} from "../shared/share-prefs";
import { recordBangUsage, syncPrefsToIdb } from "./prefs-sync";
import {
  clearHistory,
  isHistoryEnabled,
  loadHistory,
  pushHistory,
  setHistoryEnabled,
} from "./search-history";
import "./fonts.css";
import "./global.css";

function usageTriggerForQuery(query: string): string {
  const snaps = extractSnapTriggers(query);
  if (snaps?.length) return snaps[0]!;
  return (
    matchBang(query, bangMap, getBangPrefix())?.trigger ??
    extractBangTrigger(query, getBangPrefix()) ??
    getDefaultBangTrigger()
  );
}

function resolveOptions() {
  return { bangPrefix: getBangPrefix() };
}

/** Clipboard API needs secure context; fall back for http / older browsers. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through
  }

  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

type SearchEngine = { t: string; label: string; domain: string };

const SEARCH_ENGINES: SearchEngine[] = [
  { t: "g", label: "Google", domain: "www.google.com" },
  { t: "gweb", label: "Google (Bez slopu)", domain: "www.google.com" },
  { t: "ddg", label: "DuckDuckGo", domain: "duckduckgo.com" },
  { t: "b", label: "Bing", domain: "www.bing.com" },
  { t: "searx", label: "SearxNG", domain: "search.rhscz.eu" },
  { t: "kagi", label: "Kagi", domain: "kagi.com" },
  { t: "mojeek", label: "Mojeek", domain: "www.mojeek.com" },
  { t: "seznam", label: "Seznam", domain: "www.seznam.cz" },
  { t: "sp", label: "Startpage", domain: "www.startpage.com" },
  { t: "brave", label: "Brave Search", domain: "search.brave.com" },
  { t: "yandex", label: "Yandex", domain: "yandex.com" },
  { t: "qwant", label: "Qwant", domain: "www.qwant.com" },
  { t: "ecosia", label: "Ecosia", domain: "www.ecosia.org" },
  { t: "swisscows", label: "Swisscows", domain: "swisscows.com" },
  { t: "yep", label: "Yep", domain: "yep.com" },
  { t: "y", label: "Yahoo", domain: "search.yahoo.com" },
];

let bangMap = new Map<string, Bang>();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function iconUrl(domain: string): string {
  return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
}

function siteOrigin(): string {
  return window.location.origin;
}

function siteSearchUrl(): string {
  return `${siteOrigin()}?q=%s`;
}

function siteSuggestUrl(): string {
  return `${siteOrigin()}/ac?q=%s`;
}

function enginesForPicker(currentDefault: string): SearchEngine[] {
  const customWithLabels = loadCustomBangs().map((bang) => ({
    t: bang.t,
    label: bang.s?.trim() || bang.t,
    domain: bang.d || "duckduckgo.com",
  }));

  const customTriggers = new Set(customWithLabels.map((e) => e.t));
  const options = [
    ...customWithLabels,
    ...SEARCH_ENGINES.filter((e) => !customTriggers.has(e.t)),
  ];

  if (currentDefault && !options.some((e) => e.t === currentDefault)) {
    const fallback = bangMap.get(currentDefault);
    options.unshift({
      t: currentDefault,
      label: fallback?.s || fallback?.d || currentDefault,
      domain: fallback?.d || "duckduckgo.com",
    });
  }
  return options;
}

function engineByTrigger(
  trigger: string,
  engines: SearchEngine[],
): SearchEngine {
  return (
    engines.find((e) => e.t === trigger) ?? {
      t: trigger,
      label: trigger,
      domain: "duckduckgo.com",
    }
  );
}

function engineDropdownHtml(currentDefault: string): string {
  const engines = enginesForPicker(currentDefault);
  const selected = engineByTrigger(currentDefault, engines);
  const searxHost = getSearxInstanceHost();
  const showSearx = currentDefault === "searx" || currentDefault === "searxng";

  return `
    <div class="engine-bar">
      <span class="engine-select-label">Přes</span>
      <div class="engine-dropdown" data-engine-dropdown>
        <button
          type="button"
          class="engine-dropdown-trigger"
          aria-haspopup="listbox"
          aria-expanded="false"
          aria-controls="engine-menu"
          id="engine-trigger"
        >
          <img class="engine-icon" src="${escapeHtml(iconUrl(selected.domain))}" alt="" width="18" height="18" />
          <span class="engine-dropdown-label" data-engine-label>${escapeHtml(selected.label)}</span>
          <svg class="engine-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <ul id="engine-menu" class="engine-dropdown-menu" role="listbox" hidden>
          ${engines
            .map((engine) => {
              const isSelected = engine.t === currentDefault;
              return `
                <li role="option" aria-selected="${isSelected ? "true" : "false"}">
                  <button
                    type="button"
                    class="engine-dropdown-option${isSelected ? " is-selected" : ""}"
                    data-bang="${escapeHtml(engine.t)}"
                    data-label="${escapeHtml(engine.label)}"
                    data-domain="${escapeHtml(engine.domain)}"
                  >
                    <img class="engine-icon" src="${escapeHtml(iconUrl(engine.domain))}" alt="" width="18" height="18" loading="lazy" />
                    <span class="engine-option-text">
                      <span class="engine-option-name">${escapeHtml(engine.label)}</span>
                      <span class="engine-option-bang">!${escapeHtml(engine.t)}</span>
                    </span>
                  </button>
                </li>
              `;
            })
            .join("")}
        </ul>
      </div>
      <p id="default-bang-status" class="default-bang-status sr-only" role="status"></p>
    </div>

    <div class="searx-picker${showSearx ? "" : " is-hidden"}" data-searx-picker ${showSearx ? "" : "hidden"}>
      <span class="engine-select-label">Instance</span>
      <div class="engine-dropdown" data-searx-dropdown>
        <button
          type="button"
          class="engine-dropdown-trigger"
          aria-haspopup="listbox"
          aria-expanded="false"
          aria-controls="searx-menu"
          id="searx-trigger"
        >
          <img class="engine-icon" src="${escapeHtml(iconUrl(searxHost))}" alt="" width="18" height="18" data-searx-icon />
          <span class="engine-dropdown-label" data-searx-label>${escapeHtml(
            searxInstanceLabel(searxHost),
          )}</span>
          <svg class="engine-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <ul id="searx-menu" class="engine-dropdown-menu engine-dropdown-menu--wide" role="listbox" hidden>
          ${SEARX_INSTANCES.map((instance) => {
            const isSelected = instance.host === searxHost;
            return `
              <li role="option" aria-selected="${isSelected ? "true" : "false"}">
                <button
                  type="button"
                  class="engine-dropdown-option${isSelected ? " is-selected" : ""}"
                  data-searx-host="${escapeHtml(instance.host)}"
                >
                  <img class="engine-icon" src="${escapeHtml(iconUrl(instance.host))}" alt="" width="18" height="18" loading="lazy" />
                  <span class="engine-option-text">
                    <span class="engine-option-name"><span class="engine-option-region">${escapeHtml(instance.region)}</span> ${escapeHtml(instance.host)}</span>
                  </span>
                </button>
              </li>
            `;
          }).join("")}
          <li class="searx-custom" role="presentation">
            <div class="searx-custom-form" data-searx-custom-form>
              <label class="searx-custom-label" for="searx-custom-input">Vlastní instance</label>
              <div class="searx-custom-row">
                <input
                  id="searx-custom-input"
                  class="searx-custom-input"
                  type="text"
                  name="host"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="searx.example.com"
                  value="${escapeHtml(isKnownSearxHost(searxHost) ? "" : searxHost)}"
                  data-searx-custom-input
                />
                <button type="button" class="searx-custom-save" data-searx-custom-save>Použít</button>
              </div>
              <p class="searx-custom-hint">Hostname stačí — cesta za lomítkem se ořízne automaticky</p>
            </div>
          </li>
        </ul>
      </div>
    </div>
  `;
}

function customBangsListHtml(custom: Bang[]): string {
  if (!custom.length) return "";
  return `
    <ul class="bang-list">
      ${custom
        .map((bang) => {
          const shown = displayBangTemplate(bang.u);
          const preview =
            previewBangRedirect(bang.u, "kočky") ?? `https://${bang.d}`;
          const name = bang.s?.trim() && bang.s.trim() !== bang.t ? bang.s.trim() : "";
          return `
        <li>
          <div class="bang-list-main">
            <code>${escapeHtml(getBangPrefix())}${escapeHtml(bang.t)}</code>
            ${name ? `<span class="bang-list-name">${escapeHtml(name)}</span>` : ""}
            <span class="bang-list-url" title="${escapeHtml(shown)}">${escapeHtml(shown)}</span>
          </div>
          <span class="bang-list-preview" title="${escapeHtml(preview)}">!${escapeHtml(bang.t)} kočky → ${escapeHtml(preview)}</span>
          <button type="button" class="bang-list-remove" data-bang="${escapeHtml(bang.t)}" aria-label="Smazat ${escapeHtml(getBangPrefix())}${escapeHtml(bang.t)}">×</button>
        </li>
      `;
        })
        .join("")}
    </ul>
  `;
}

function domainFromBangUrl(url: string): string {
  try {
    const cleaned = normalizeBangTemplate(url).replace(
      /\{\{\{s\}\}\}/g,
      "query",
    );
    if (cleaned.startsWith("/")) return "";
    return new URL(cleaned).hostname;
  } catch {
    return "";
  }
}

function goToSearch(query: string) {
  const url = resolveBangRedirectUrl(
    query,
    bangMap,
    getDefaultBangTrigger(),
    resolveOptions(),
  );
  if (!url) return false;
  pushHistory(query);
  void recordBangUsage(usageTriggerForQuery(query));
  // replace — avoid flooding tab/history with intermediate search URLs (#68)
  window.location.replace(url);
  return true;
}

function applySearxOverride(map: Map<string, Bang>): Map<string, Bang> {
  const host = getSearxInstanceHost();
  const next = new Map(map);
  for (const t of ["searx", "searxng"]) {
    next.set(t, {
      t,
      d: host,
      u: searxSearchTemplate(host),
      s: "SearxNG",
    });
  }
  // Keep picker icon domain in sync when searx is selected in UI separately
  return next;
}

function refreshBangMap(base: Map<string, Bang>) {
  bangMap = applySearxOverride(
    applyCustomBangs(ensureEssentialBangs(base), loadCustomBangs()),
  );
}

function currentShareablePrefs(): Omit<ShareablePrefs, "v"> {
  return {
    defaultBang: getDefaultBangTrigger(),
    customBangs: loadCustomBangs(),
    customSearxUrl: getSearxInstanceHost(),
    bangPrefix: getBangPrefix(),
  };
}

function clearShareHash(): void {
  history.replaceState(
    null,
    "",
    window.location.pathname + window.location.search,
  );
}

function peekSharePrefs(): ShareablePrefs | null {
  const raw = extractShareFromHash(window.location.hash);
  if (!raw) return null;
  return decodeSharePayload(raw);
}

async function applySharePrefs(prefs: ShareablePrefs): Promise<void> {
  setDefaultBangTrigger(prefs.defaultBang);
  setBangPrefix(prefs.bangPrefix);
  saveCustomBangs(prefs.customBangs);
  if (prefs.customSearxUrl) {
    setSearxInstanceHost(prefs.customSearxUrl);
  }
  await syncPrefsToIdb({
    defaultBang: prefs.defaultBang,
    customBangs: prefs.customBangs,
    customSearxUrl: prefs.customSearxUrl || getSearxInstanceHost(),
    bangPrefix: prefs.bangPrefix,
  });
}

function shareImportBannerHtml(prefs: ShareablePrefs): string {
  const current: ShareablePrefs = { v: 1, ...currentShareablePrefs() };
  const same = sharePrefsEqual(current, prefs);
  if (same) {
    return `
      <aside class="share-import" role="status" data-share-import>
        <p class="share-import-title">Toto nastavení už máš</p>
        <p class="share-import-summary">${escapeHtml(summarizeSharePrefs(prefs))}</p>
        <div class="share-import-actions">
          <button type="button" class="share-import-btn" data-share-dismiss>Zavřít</button>
        </div>
      </aside>
    `;
  }
  return `
    <aside class="share-import" role="dialog" aria-labelledby="share-import-title" data-share-import>
      <p class="share-import-title" id="share-import-title">Importovat nastavení?</p>
      <p class="share-import-summary">${escapeHtml(summarizeSharePrefs(prefs))}</p>
      <p class="share-import-hint">Přepíše výchozí vyhledávač, vlastní bangy a znak bangu v tomto prohlížeči.</p>
      <div class="share-import-actions">
        <button type="button" class="share-import-btn" data-share-dismiss>Zrušit</button>
        <button type="button" class="share-import-btn" data-share-backup>Zálohovat a přepsat</button>
        <button type="button" class="share-import-btn share-import-btn--primary" data-share-apply>Přepsat</button>
      </div>
      <p class="bang-status" data-share-import-status role="status"></p>
    </aside>
  `;
}

function renderLanding(
  baseMap: Map<string, Bang>,
  options: { pendingShare?: ShareablePrefs | null; flash?: string } = {},
) {
  refreshBangMap(baseMap);
  const app = document.querySelector<HTMLDivElement>("#app")!;
  const currentDefault = getDefaultBangTrigger();
  const bangPrefix = getBangPrefix();
  syncSuggestEngineCookie(currentDefault);
  const suggestLabel =
    SUGGEST_PROVIDER_LABEL[currentSuggestProvider(currentDefault)] ??
    "DuckDuckGo";
  const custom = loadCustomBangs();
  const historyOn = isHistoryEnabled();
  const history = historyOn ? loadHistory() : [];
  const pendingShare =
    options.pendingShare !== undefined
      ? options.pendingShare
      : peekSharePrefs();

  app.innerHTML = `
    <div class="page">
      <div class="content-container">
        <header class="brand">
          <img class="logo" src="/logo.svg" alt="" width="92" height="92" />
          <h1 class="brand-title"><span>SmirkHat</span> Search</h1>
        </header>

        ${pendingShare ? shareImportBannerHtml(pendingShare) : ""}

        <form class="search-form" action="/" method="get">
          <label class="sr-only" for="search-q">Hledaný výraz</label>
          <div class="search-box">
            <div class="search-row">
              <input
                id="search-q"
                name="q"
                type="search"
                class="search-input"
                placeholder="${escapeHtml(bangPrefix)}gh · smirkhat ${escapeHtml(bangPrefix)}gh · @w"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off"
                spellcheck="false"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded="false"
                aria-controls="search-suggestions"
                autofocus
              />
              <button class="search-button" type="submit" aria-label="Hledat">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/>
                  <path d="M20 20l-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
            <ul
              id="search-suggestions"
              class="suggestions"
              role="listbox"
              hidden
            >            </ul>
          </div>
        </form>

        ${engineDropdownHtml(currentDefault)}

        <details class="settings-panel">
          <summary class="settings-summary">Nastavení</summary>
          <div class="settings-body">
            <section class="settings-section" aria-labelledby="settings-bangs-heading">
              <h2 class="settings-heading" id="settings-bangs-heading">Vlastní bangy</h2>
              <form class="bang-add" autocomplete="off">
                <div class="bang-add-row">
                  <input name="s" class="bang-add-input bang-add-s" placeholder="Název" maxlength="64" spellcheck="false" aria-label="Název vyhledávače" data-bang-s />
                  <label class="bang-add-trigger">
                    <span class="bang-add-bang">${escapeHtml(bangPrefix)}</span>
                    <input name="t" class="bang-add-input bang-add-t" placeholder="gh" maxlength="32" spellcheck="false" required aria-label="Zkratka bangu" data-bang-t />
                  </label>
                </div>
                <div class="bang-add-row bang-add-row--url">
                  <input name="u" class="bang-add-input bang-add-u" placeholder="https://smht.eu?q=%s" spellcheck="false" required aria-label="URL šablona s %s" data-bang-u />
                  <button class="bang-add-submit" type="submit">Přidat</button>
                </div>
              </form>
              <p class="bang-preview" data-bang-preview hidden>
                <span class="bang-preview-query" data-bang-preview-query></span>
                <span class="bang-preview-arrow" aria-hidden="true">→</span>
                <span class="bang-preview-url" data-bang-preview-url></span>
              </p>
              <p class="bang-status" role="status"></p>
              <div data-custom-list>
                ${customBangsListHtml(custom)}
              </div>
            </section>

            <section class="settings-section" aria-labelledby="settings-browser-heading">
              <h2 class="settings-heading" id="settings-browser-heading">Prohlížeč</h2>
              <p class="settings-note">
                Návrhy v adresním řádku: <span data-suggest-label>${suggestLabel}</span>
              </p>
              <label class="settings-label" for="site-search-url">Vyhledávání</label>
              <div class="url-container">
                <input
                  id="site-search-url"
                  type="text"
                  class="url-input"
                  data-copy-target
                  data-site-search-url
                  value="${escapeHtml(siteSearchUrl())}"
                  readonly
                  aria-label="URL vlastního vyhledávače"
                />
                <button class="copy-button" type="button" aria-label="Kopírovat URL vyhledávání">
                  <img src="/clipboard.svg" alt="" />
                </button>
              </div>
              <label class="settings-label" for="site-suggest-url">Autocomplete</label>
              <div class="url-container">
                <input
                  id="site-suggest-url"
                  type="text"
                  class="url-input"
                  data-copy-target
                  data-site-suggest-url
                  value="${escapeHtml(siteSuggestUrl())}"
                  readonly
                  aria-label="URL autocomplete"
                />
                <button class="copy-button" type="button" aria-label="Kopírovat URL autocomplete">
                  <img src="/clipboard.svg" alt="" />
                </button>
              </div>
              <p class="settings-note settings-note--muted">
                Chrome / Edge: Nastavení → Vyhledávač → Přidat. Firefox nabídne OpenSearch sám.
              </p>
            </section>

            <section class="settings-section" aria-labelledby="settings-more-heading">
              <h2 class="settings-heading" id="settings-more-heading">Další</h2>
              <div class="settings-field">
                <label class="settings-label" for="bang-prefix-input">Znak bangu</label>
                <div class="prefix-row">
                  <input
                    id="bang-prefix-input"
                    type="text"
                    maxlength="1"
                    class="bang-prefix-input"
                    value="${escapeHtml(bangPrefix)}"
                    aria-label="Znak bangu"
                    data-bang-prefix
                  />
                  <span class="settings-hint">např. ! $ / # — ne @</span>
                </div>
              </div>
              <div class="settings-field">
                <span class="settings-label" id="history-label">Historie</span>
                <label class="history-toggle">
                  <input type="checkbox" data-history-enabled ${historyOn ? "checked" : ""} aria-describedby="history-label" />
                  Ukládat poslední hledání (jen lokálně)
                </label>
                <div class="history-list" data-history-list ${historyOn && history.length ? "" : "hidden"}>
                  ${
                    history.length
                      ? `<ul>${history
                          .slice(0, 12)
                          .map(
                            (e) =>
                              `<li><button type="button" class="history-item" data-history-q="${escapeHtml(e.q)}">${escapeHtml(e.q)}</button></li>`,
                          )
                          .join("")}</ul>
                         <button type="button" class="settings-btn" data-history-clear>Smazat historii</button>`
                      : `<p class="settings-note settings-note--muted">Zatím prázdná</p>`
                  }
                </div>
              </div>
              <div class="settings-field">
                <span class="settings-label">Sdílení</span>
                <button type="button" class="settings-btn" data-share-settings>Kopírovat odkaz na nastavení</button>
                <p class="bang-status" data-share-status role="status"></p>
              </div>
              <p class="settings-note settings-note--muted">
                Bangy: <code>${escapeHtml(bangPrefix)}gh q</code> i <code>q ${escapeHtml(bangPrefix)}gh</code> · snapy: <code>@w q</code>
              </p>
            </section>
          </div>
        </details>
      </div>
      <footer class="footer">
        Hostuje
        <a href="https://smirkhat.org" target="_blank" rel="noopener noreferrer">SmirkHat.org</a>
        <span class="footer-sep" aria-hidden="true">·</span>
        <a href="https://github.com/SmirkHat/search" target="_blank" rel="noopener noreferrer">Zdrojový kód</a>
      </footer>
    </div>
  `;

  const searchForm = app.querySelector<HTMLFormElement>(".search-form")!;
  const searchInput = app.querySelector<HTMLInputElement>("#search-q")!;
  const suggestionsList = app.querySelector<HTMLUListElement>(
    "#search-suggestions",
  )!;

  let activeSuggestion = -1;
  let currentSuggestions: string[] = [];
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  let abortController: AbortController | undefined;

  const hideSuggestions = () => {
    suggestionsList.hidden = true;
    suggestionsList.innerHTML = "";
    currentSuggestions = [];
    activeSuggestion = -1;
    searchInput.setAttribute("aria-expanded", "false");
  };

  const renderSuggestions = (items: string[]) => {
    currentSuggestions = items;
    activeSuggestion = -1;
    if (!items.length) {
      hideSuggestions();
      return;
    }

    suggestionsList.innerHTML = items
      .map(
        (item, index) => `
          <li role="option" id="suggestion-${index}" data-index="${index}">
            <button type="button" class="suggestion-item">${escapeHtml(item)}</button>
          </li>
        `,
      )
      .join("");
    suggestionsList.hidden = false;
    searchInput.setAttribute("aria-expanded", "true");
  };

  const setActiveSuggestion = (index: number) => {
    const options = suggestionsList.querySelectorAll<HTMLLIElement>("li");
    activeSuggestion = index;
    options.forEach((option, i) => {
      option.classList.toggle("is-active", i === index);
      if (i === index) {
        searchInput.setAttribute("aria-activedescendant", option.id);
      }
    });
    if (index < 0) searchInput.removeAttribute("aria-activedescendant");
  };

  const scheduleSuggestions = () => {
    window.clearTimeout(debounceTimer);
    abortController?.abort();
    const q = searchInput.value;
    if (!q.trim()) {
      hideSuggestions();
      return;
    }

    debounceTimer = setTimeout(async () => {
      abortController = new AbortController();
      try {
        const items = await fetchSuggestions(
          q,
          abortController.signal,
          getDefaultBangTrigger(),
        );
        if (searchInput.value !== q) return;
        renderSuggestions(items.slice(0, 8));
      } catch (error) {
        if ((error as Error).name !== "AbortError") hideSuggestions();
      }
    }, 180);
  };

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    hideSuggestions();
    const q = searchInput.value.trim();
    if (!q) {
      searchInput.focus();
      return;
    }
    if (!goToSearch(q)) {
      searchInput.focus();
    }
  });

  searchInput.addEventListener("input", scheduleSuggestions);
  searchInput.addEventListener("keydown", (event) => {
    if (suggestionsList.hidden || !currentSuggestions.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestion((activeSuggestion + 1) % currentSuggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestion(
        activeSuggestion <= 0
          ? currentSuggestions.length - 1
          : activeSuggestion - 1,
      );
    } else if (event.key === "Enter" && activeSuggestion >= 0) {
      event.preventDefault();
      searchInput.value = applySuggestion(
        searchInput.value,
        currentSuggestions[activeSuggestion]!,
      );
      hideSuggestions();
      goToSearch(searchInput.value);
    } else if (event.key === "Escape") {
      hideSuggestions();
    }
  });

  suggestionsList.addEventListener("mousedown", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      ".suggestion-item",
    );
    if (!button) return;
    event.preventDefault();
    const li = button.closest("li");
    const index = Number(li?.dataset.index ?? -1);
    const suggestion = currentSuggestions[index];
    if (!suggestion) return;
    searchInput.value = applySuggestion(searchInput.value, suggestion);
    hideSuggestions();
    goToSearch(searchInput.value);
  });

  document.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    if (!target.closest(".search-box")) {
      hideSuggestions();
    }
    if (!target.closest("[data-engine-dropdown]")) {
      closeDropdown(app.querySelector("[data-engine-dropdown]"));
    }
    if (!target.closest("[data-searx-dropdown]")) {
      closeDropdown(app.querySelector("[data-searx-dropdown]"));
    }
  });

  const defaultStatus = app.querySelector<HTMLParagraphElement>(
    "#default-bang-status",
  )!;
  const searxPicker = app.querySelector<HTMLElement>("[data-searx-picker]")!;
  syncSearxInstanceCookie();

  function closeDropdown(root: Element | null) {
    if (!root) return;
    const trigger = root.querySelector<HTMLButtonElement>(
      ".engine-dropdown-trigger",
    );
    const menuEl = root.querySelector<HTMLElement>(".engine-dropdown-menu");
    if (trigger) trigger.setAttribute("aria-expanded", "false");
    if (menuEl) menuEl.hidden = true;
  }

  function toggleDropdown(root: Element) {
    const trigger = root.querySelector<HTMLButtonElement>(
      ".engine-dropdown-trigger",
    )!;
    const menu = root.querySelector<HTMLElement>(".engine-dropdown-menu")!;
    const open = trigger.getAttribute("aria-expanded") === "true";
    for (const other of app.querySelectorAll(".engine-dropdown")) {
      if (other !== root) closeDropdown(other);
    }
    trigger.setAttribute("aria-expanded", open ? "false" : "true");
    menu.hidden = open;
  }

  function setSearxPickerVisible(visible: boolean) {
    searxPicker.hidden = !visible;
    searxPicker.classList.toggle("is-hidden", !visible);
  }

  function selectEngine(trigger: string, label: string, domain: string) {
    if (trigger === "searx" || trigger === "searxng") {
      refreshBangMap(baseMap);
    }

    if (!bangMap.get(trigger)) {
      defaultStatus.textContent = "Vybraný vyhledávač není dostupný.";
      defaultStatus.dataset.state = "error";
      return;
    }

    setDefaultBangTrigger(trigger);
    syncSuggestEngineCookie(trigger);
    void syncPrefsToIdb({ defaultBang: trigger });
    setSearxPickerVisible(trigger === "searx" || trigger === "searxng");

    const engineRoot = app.querySelector("[data-engine-dropdown]")!;
    const labelEl = engineRoot.querySelector<HTMLElement>("[data-engine-label]")!;
    const iconEl = engineRoot.querySelector<HTMLImageElement>(
      ".engine-dropdown-trigger .engine-icon",
    )!;
    labelEl.textContent = label;
    iconEl.src = iconUrl(domain);

    for (const option of engineRoot.querySelectorAll<HTMLButtonElement>(
      ".engine-dropdown-option",
    )) {
      const selected = option.dataset.bang === trigger;
      option.classList.toggle("is-selected", selected);
      option
        .closest("li")
        ?.setAttribute("aria-selected", selected ? "true" : "false");
    }

    const suggestName =
      SUGGEST_PROVIDER_LABEL[currentSuggestProvider(trigger)] ?? "DuckDuckGo";
    const suggestLabelEl =
      app.querySelector<HTMLElement>("[data-suggest-label]");
    if (suggestLabelEl) suggestLabelEl.textContent = suggestName;

    defaultStatus.textContent = `Uloženo: ${label} (!${trigger}) · návrhy: ${suggestName}`;
    defaultStatus.dataset.state = "ok";
    closeDropdown(engineRoot);
  }

  function selectSearxHost(host: string) {
    if (!setSearxInstanceHost(host)) {
      defaultStatus.textContent = "Neplatný hostname Searx instance.";
      defaultStatus.dataset.state = "error";
      return;
    }
    void syncPrefsToIdb({ customSearxUrl: host });
    refreshBangMap(baseMap);

    const searxRoot = app.querySelector("[data-searx-dropdown]")!;
    const labelEl = searxRoot.querySelector<HTMLElement>("[data-searx-label]")!;
    const iconEl = searxRoot.querySelector<HTMLImageElement>("[data-searx-icon]")!;
    const customInput = searxRoot.querySelector<HTMLInputElement>(
      "[data-searx-custom-input]",
    );
    labelEl.textContent = searxInstanceLabel(host);
    iconEl.src = iconUrl(host);
    if (customInput) {
      customInput.value = isKnownSearxHost(host) ? "" : host;
    }

    for (const option of searxRoot.querySelectorAll<HTMLButtonElement>(
      "[data-searx-host]",
    )) {
      const selected = option.dataset.searxHost === host;
      option.classList.toggle("is-selected", selected);
      option
        .closest("li")
        ?.setAttribute("aria-selected", selected ? "true" : "false");
    }

    defaultStatus.textContent = `SearxNG instance: ${searxInstanceLabel(host)}`;
    defaultStatus.dataset.state = "ok";
    closeDropdown(searxRoot);
  }

  app
    .querySelector("[data-engine-dropdown] .engine-dropdown-trigger")!
    .addEventListener("click", (event) => {
      event.preventDefault();
      toggleDropdown(app.querySelector("[data-engine-dropdown]")!);
    });

  app
    .querySelector("[data-searx-dropdown] .engine-dropdown-trigger")!
    .addEventListener("click", (event) => {
      event.preventDefault();
      toggleDropdown(app.querySelector("[data-searx-dropdown]")!);
    });

  app
    .querySelector("[data-engine-dropdown] .engine-dropdown-menu")!
    .addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        ".engine-dropdown-option",
      );
      if (!button?.dataset.bang) return;
      selectEngine(
        button.dataset.bang,
        button.dataset.label ?? button.dataset.bang,
        button.dataset.domain ?? "duckduckgo.com",
      );
    });

  app
    .querySelector("[data-searx-dropdown] .engine-dropdown-menu")!
    .addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        "[data-searx-host]",
      );
      if (!button?.dataset.searxHost) return;
      selectSearxHost(button.dataset.searxHost);
    });

  const applyCustomSearxHost = () => {
    const input = app.querySelector<HTMLInputElement>(
      "[data-searx-custom-input]",
    )!;
    const parsed = parseSearxHostInput(input.value);
    if (!parsed) {
      defaultStatus.textContent =
        "Zadej platný hostname (např. searx.example.com).";
      defaultStatus.dataset.state = "error";
      return;
    }
    input.value = parsed;
    selectSearxHost(parsed);
  };

  app
    .querySelector("[data-searx-custom-save]")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      applyCustomSearxHost();
    });

  app
    .querySelector<HTMLInputElement>("[data-searx-custom-input]")
    ?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      applyCustomSearxHost();
    });

  const searxCustomInput = app.querySelector<HTMLInputElement>(
    "[data-searx-custom-input]",
  );
  const stripSearxPathInPlace = () => {
    if (!searxCustomInput) return;
    const parsed = parseSearxHostInput(searxCustomInput.value);
    if (parsed && parsed !== searxCustomInput.value.trim()) {
      searxCustomInput.value = parsed;
    }
  };
  searxCustomInput?.addEventListener("paste", () => {
    requestAnimationFrame(stripSearxPathInPlace);
  });
  searxCustomInput?.addEventListener("blur", stripSearxPathInPlace);
  searxCustomInput?.addEventListener("change", stripSearxPathInPlace);

  for (const icon of app.querySelectorAll<HTMLImageElement>(".engine-icon")) {
    icon.addEventListener("error", () => {
      icon.style.opacity = "0.3";
    });
  }

  const customForm = app.querySelector<HTMLFormElement>(".bang-add")!;
  const customStatus = app.querySelector<HTMLParagraphElement>(".bang-status")!;
  const customList = app.querySelector<HTMLDivElement>("[data-custom-list]")!;
  const bangTInput = app.querySelector<HTMLInputElement>("[data-bang-t]")!;
  const bangUInput = app.querySelector<HTMLInputElement>("[data-bang-u]")!;
  const bangPreview = app.querySelector<HTMLParagraphElement>(
    "[data-bang-preview]",
  )!;
  const bangPreviewQuery = app.querySelector<HTMLElement>(
    "[data-bang-preview-query]",
  )!;
  const bangPreviewUrl = app.querySelector<HTMLElement>(
    "[data-bang-preview-url]",
  )!;

  const updateBangPreview = () => {
    const t = bangTInput.value.trim().replace(/^!/, "").toLowerCase() || "…";
    const u = bangUInput.value.trim();
    const preview = previewBangRedirect(u, "kočky");
    if (!u || !preview) {
      bangPreview.hidden = true;
      return;
    }
    bangPreviewQuery.innerHTML = `<code>!${escapeHtml(t)}</code> kočky`;
    bangPreviewUrl.textContent = preview;
    bangPreview.hidden = false;
  };

  bangTInput.addEventListener("input", updateBangPreview);
  bangUInput.addEventListener("input", updateBangPreview);
  bangUInput.addEventListener("paste", () => {
    requestAnimationFrame(updateBangPreview);
  });

  const rerenderCustomList = () => {
    const next = loadCustomBangs();
    customList.innerHTML = customBangsListHtml(next);
    refreshBangMap(baseMap);
    refreshEngineMenu();
  };

  function refreshEngineMenu() {
    const current = getDefaultBangTrigger();
    const engines = enginesForPicker(current);
    const menu = app.querySelector("#engine-menu");
    if (!menu) return;
    menu.innerHTML = engines
      .map((engine) => {
        const isSelected = engine.t === current;
        return `
          <li role="option" aria-selected="${isSelected ? "true" : "false"}">
            <button
              type="button"
              class="engine-dropdown-option${isSelected ? " is-selected" : ""}"
              data-bang="${escapeHtml(engine.t)}"
              data-label="${escapeHtml(engine.label)}"
              data-domain="${escapeHtml(engine.domain)}"
            >
              <img class="engine-icon" src="${escapeHtml(iconUrl(engine.domain))}" alt="" width="18" height="18" loading="lazy" />
              <span class="engine-option-text">
                <span class="engine-option-name">${escapeHtml(engine.label)}</span>
                <span class="engine-option-bang">!${escapeHtml(engine.t)}</span>
              </span>
            </button>
          </li>
        `;
      })
      .join("");

    const selected = engineByTrigger(current, engines);
    const engineRoot = app.querySelector("[data-engine-dropdown]");
    const labelEl = engineRoot?.querySelector<HTMLElement>("[data-engine-label]");
    const iconEl = engineRoot?.querySelector<HTMLImageElement>(
      ".engine-dropdown-trigger .engine-icon",
    );
    if (labelEl) labelEl.textContent = selected.label;
    if (iconEl) iconEl.src = iconUrl(selected.domain);

    for (const icon of menu.querySelectorAll<HTMLImageElement>(".engine-icon")) {
      icon.addEventListener("error", () => {
        icon.style.opacity = "0.3";
      });
    }
  }

  customForm.addEventListener("submit", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const fd = new FormData(customForm);
    const t = String(fd.get("t") ?? "")
      .trim()
      .replace(/^!/, "")
      .toLowerCase();
    const name = String(fd.get("s") ?? "").trim() || t;
    const u = normalizeBangTemplate(String(fd.get("u") ?? ""));
    const d = domainFromBangUrl(u);
    const error = validateBangInput({ t, u, d });
    if (error) {
      customStatus.textContent = error;
      customStatus.dataset.state = "error";
      return;
    }

    try {
      const next = loadCustomBangs().filter((b) => b.t !== t);
      next.push({ t, u, d, s: name });
      saveCustomBangs(next);
      void syncPrefsToIdb({ customBangs: next });
      refreshBangMap(baseMap);
      customForm.reset();
      bangPreview.hidden = true;
      customStatus.textContent = `!${t} uložen`;
      customStatus.dataset.state = "ok";
      rerenderCustomList();
    } catch {
      customStatus.textContent = "Ukládání selhalo (prohlížeč blokuje úložiště).";
      customStatus.dataset.state = "error";
    }
  });

  customList.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      ".bang-list-remove",
    );
    if (!button?.dataset.bang) return;
    const next = loadCustomBangs().filter((b) => b.t !== button.dataset.bang);
    saveCustomBangs(next);
    void syncPrefsToIdb({ customBangs: next });
    refreshBangMap(baseMap);
    rerenderCustomList();
    customStatus.textContent = `!${button.dataset.bang} smazán`;
    customStatus.dataset.state = "ok";
  });

  for (const copyButton of app.querySelectorAll<HTMLButtonElement>(
    ".copy-button",
  )) {
    const row = copyButton.closest(".url-container");
    const urlInput = row?.querySelector<HTMLInputElement>("[data-copy-target]");
    const copyIcon = copyButton.querySelector("img");
    if (!urlInput || !copyIcon) continue;

    copyButton.addEventListener("click", async () => {
      if (await copyText(urlInput.value)) {
        copyIcon.src = "/clipboard-check.svg";
        setTimeout(() => {
          copyIcon.src = "/clipboard.svg";
        }, 2000);
      } else {
        urlInput.select();
      }
    });
  }

  const prefixInput = app.querySelector<HTMLInputElement>("[data-bang-prefix]");
  prefixInput?.addEventListener("change", () => {
    const next = normalizeBangPrefix(prefixInput.value);
    if (!next) {
      prefixInput.value = getBangPrefix();
      defaultStatus.textContent = "Neplatný znak bangu (zkus ! $ / #).";
      defaultStatus.dataset.state = "error";
      return;
    }
    setBangPrefix(next);
    void syncPrefsToIdb({ bangPrefix: next });
    defaultStatus.textContent = `Znak bangu: ${next}`;
    defaultStatus.dataset.state = "ok";
    renderLanding(baseMap);
  });

  const historyToggle = app.querySelector<HTMLInputElement>(
    "[data-history-enabled]",
  );
  historyToggle?.addEventListener("change", () => {
    setHistoryEnabled(!!historyToggle.checked);
    renderLanding(baseMap);
  });

  app.querySelector("[data-history-clear]")?.addEventListener("click", () => {
    clearHistory();
    renderLanding(baseMap);
  });

  app.querySelector("[data-history-list]")?.addEventListener("click", (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "[data-history-q]",
    );
    if (!btn?.dataset.historyQ) return;
    searchInput.value = btn.dataset.historyQ;
    searchInput.focus();
    goToSearch(btn.dataset.historyQ);
  });

  const shareStatus = app.querySelector<HTMLElement>("[data-share-status]");
  app.querySelector("[data-share-settings]")?.addEventListener("click", async () => {
    try {
      const payload = encodeSharePayload(currentShareablePrefs());
      const url = `${siteOrigin()}/${buildShareHash(payload)}`;
      if (!(await copyText(url))) {
        throw new Error("Prohlížeč neumožnil zkopírovat odkaz (zkus HTTPS).");
      }
      if (shareStatus) {
        shareStatus.textContent = "Odkaz zkopírován";
        shareStatus.dataset.state = "ok";
      }
    } catch (error) {
      if (shareStatus) {
        shareStatus.textContent =
          error instanceof Error ? error.message : "Kopírování selhalo";
        shareStatus.dataset.state = "error";
      }
    }
  });

  const importStatus = app.querySelector<HTMLElement>(
    "[data-share-import-status]",
  );

  const dismissShareImport = () => {
    clearShareHash();
    renderLanding(baseMap, { pendingShare: null });
  };

  app.querySelector("[data-share-dismiss]")?.addEventListener("click", () => {
    dismissShareImport();
  });

  const commitIncomingShare = async (backup: boolean) => {
    if (!pendingShare) return;
    if (backup) {
      try {
        const payload = encodeSharePayload(currentShareablePrefs());
        const url = `${siteOrigin()}/${buildShareHash(payload)}`;
        if (!(await copyText(url))) {
          throw new Error("Zálohu se nepodařilo zkopírovat.");
        }
      } catch (error) {
        if (importStatus) {
          importStatus.textContent =
            error instanceof Error
              ? `${error.message} Zkus znovu, nebo zvol Přepsat.`
              : "Záloha selhala — zkus znovu, nebo zvol Přepsat.";
          importStatus.dataset.state = "error";
        }
        return;
      }
    }
    await applySharePrefs(pendingShare);
    clearShareHash();
    refreshBangMap(baseMap);
    renderLanding(baseMap, {
      pendingShare: null,
      flash: backup
        ? "Záloha zkopírována · nastavení ze sdíleného odkazu načteno"
        : "Nastavení ze sdíleného odkazu načteno",
    });
  };

  app.querySelector("[data-share-backup]")?.addEventListener("click", () => {
    void commitIncomingShare(true);
  });
  app.querySelector("[data-share-apply]")?.addEventListener("click", () => {
    void commitIncomingShare(false);
  });

  if (options.flash) {
    const status = app.querySelector<HTMLElement>("#default-bang-status");
    if (status) {
      status.textContent = options.flash;
      status.dataset.state = "ok";
    }
  }
}

/** Sync redirect from inlined hot map — no catalog await (SPA fallback). */
function trySyncHotRedirect(query: string): string | null {
  const bangPrefix = getBangPrefix();
  const map = withPrefsOverlays(INLINE_HOT_MAP, {
    customBangs: loadCustomBangs(),
    customSearxUrl: getSearxInstanceHost(),
  });
  if (!canResolveWithMap(query, map, bangPrefix)) return null;
  const url = resolveBangRedirectUrl(
    query,
    map,
    getDefaultBangTrigger(),
    resolveOptions(),
  );
  if (!url) return null;
  // Own a copy — never expose the shared INLINE_HOT_MAP to later SPA mutations.
  bangMap = map === INLINE_HOT_MAP ? new Map(map) : map;
  return url;
}

async function boot() {
  const app = document.querySelector<HTMLDivElement>("#app")!;
  const query =
    new URL(window.location.href).searchParams.get("q")?.trim() ?? "";

  // Don't silently overwrite prefs during a search redirect.
  if (query && peekSharePrefs()) {
    clearShareHash();
  }

  // Fast path: common bangs / default search without waiting on IDB/network.
  if (query) {
    const syncUrl = trySyncHotRedirect(query);
    if (syncUrl) {
      void syncPrefsToIdb();
      pushHistory(query);
      void recordBangUsage(usageTriggerForQuery(query));
      window.location.replace(syncUrl);
      return;
    }
  }

  let baseMap: Map<string, Bang>;
  try {
    if (!query) {
      baseMap = await loadHotBangMap();
      prefetchFullBangMap();
    } else {
      const customTriggers = loadCustomBangs().map((b) => b.t);
      baseMap = await loadBangMapForTrigger(
        extractBangTrigger(query, getBangPrefix()),
        customTriggers,
      );
    }
  } catch {
    app.innerHTML = `
      <div class="page">
        <div class="content-container">
          <h1>SmirkHat Search</h1>
          <p class="tagline">Nepodařilo se načíst katalog bangů.</p>
        </div>
      </div>
    `;
    return;
  }

  refreshBangMap(baseMap);

  // Mirror prefs for Service Worker / Edge 302 (IDB + cookies).
  void syncPrefsToIdb();

  if (!query) {
    renderLanding(baseMap);
    return;
  }

  const searchUrl = resolveBangRedirectUrl(
    query,
    bangMap,
    getDefaultBangTrigger(),
    resolveOptions(),
  );
  if (!searchUrl) {
    renderLanding(baseMap);
    return;
  }
  pushHistory(query);
  void recordBangUsage(usageTriggerForQuery(query));
  window.location.replace(searchUrl);
}

boot();
