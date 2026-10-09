/**
 * Application entry point — session bootstrap, hash router, shell chrome.
 */

import {
  isAuthenticated,
  getSession,
  signOut,
  getProfile,
  getCases,
  ensureSeedData,
  getPrefs,
} from "./store.js";
import {
  escapeHtml,
  initials,
  formatDateTime,
  relativeTime,
  icon,
  toast,
  closeModal,
  $, $$,
} from "./ui.js";

import { renderLogin } from "./views/login.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderCases } from "./views/cases.js";
import { renderAnalysis } from "./views/analysis.js";
import { renderCaseFile } from "./views/casefile.js";
import { renderReports } from "./views/reports.js";
import { renderSettings, setSettingsRerender } from "./views/settings.js";

const ROUTES = {
  "#/dashboard": { title: "Dashboard", sub: "Operational overview", view: renderDashboard },
  "#/cases": { title: "Cases", sub: "Investigation files", view: renderCases },
  "#/analysis": { title: "New Investigation", sub: "Case intake & analysis", view: renderAnalysis },
  "#/reports": { title: "Reports", sub: "Generated documentation", view: renderReports },
  "#/settings": { title: "Settings", sub: "Account & terminal preferences", view: renderSettings },
};

const DEFAULT_ROUTE = "#/dashboard";

let teardown = null;
let clockTimer = null;
let activeGraph = null;

/* ------------------------------------------------------------------ *
 * Boot
 * ------------------------------------------------------------------ */

function boot() {
  wireShellChrome();

  if (isAuthenticated()) {
    enterApp(getSession());
  } else {
    showLogin();
  }

  window.addEventListener("hashchange", handleRoute);
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      closeSidebar();
    }
  });
}

function showLogin() {
  const shell = $("#app-shell");
  shell.hidden = true;
  shell.classList.remove("nav-open");
  stopClock();
  document.body.dataset.view = "login";

  renderLogin({
    onSuccess: (session) => {
      ensureSeedData();
      enterApp(session);
    },
  });
}

function enterApp(session) {
  const login = $("#login-screen");
  login.hidden = true;
  $("#app-shell").hidden = false;
  document.body.dataset.view = "app";
  document.body.dataset.contrast = getPrefs().contrast || "standard";

  applyIdentity(session);

  if (!location.hash || !isKnownRoute(location.hash)) {
    location.hash = DEFAULT_ROUTE;
  }
  handleRoute();

  toast(`Active session · ${session.rank} ${session.name}`, {
    type: "info",
    title: "Authenticated",
    timeout: 3200,
  });
}

function isKnownRoute(hash) {
  const base = hash.split("?")[0];
  return (
    Boolean(ROUTES[base]) ||
    base.startsWith("#/case/") ||
    base.startsWith("#/settings/")
  );
}

/* ------------------------------------------------------------------ *
 * Router
 * ------------------------------------------------------------------ */

function handleRoute() {
  if (!isAuthenticated()) {
    showLogin();
    return;
  }

  const raw = location.hash || DEFAULT_ROUTE;
  const [path, query] = raw.split("?");
  const params = Object.fromEntries(new URLSearchParams(query || ""));
  const root = $("#view-root");

  // Tear down the previous view (timers, graph instances, listeners).
  if (typeof teardown === "function") {
    try {
      teardown();
    } catch (err) {
      console.warn("View teardown failed", err);
    }
  }
  teardown = null;

  highlightNav(path);
  startClock();

  // Case detail: #/case/<id>
  if (path.startsWith("#/case/")) {
    const id = decodeURIComponent(path.replace("#/case/", ""));
    setChrome("Case File", id);
    teardown = renderCaseFile({ navigate, id }) || null;
    return;
  }

  // Settings sub-tabs: #/settings/<tab> -> the settings view handles the tab.
  const isSettings = path === "#/settings" || path.startsWith("#/settings/");

  const route = ROUTES[path] || (isSettings ? ROUTES["#/settings"] : null) || ROUTES[DEFAULT_ROUTE];
  if (!ROUTES[path] && !isSettings) {
    history.replaceState(null, "", DEFAULT_ROUTE);
  }

  setChrome(route.title, route.sub);
  root.scrollTop = 0;
  window.scrollTo({ top: 0 });

  activeGraph = null;

  try {
    teardown = route.view({ navigate, params }) || null;
  } catch (err) {
    console.error("View render failed", err);
    root.innerHTML = `
      <div class="page">
        <section class="panel"><div class="panel__body">
          <div class="alert alert--danger">
            <span class="alert__icon">${icon("alert")}</span>
            <div class="alert__body">
              <div class="alert__title">Unable to render this view</div>
              <div class="muted" style="font-size:.82rem">${escapeHtml(err.message)}</div>
            </div>
          </div>
        </div></section>
      </div>`;
  }
}

function setChrome(title, sub) {
  document.getElementById("page-title").textContent = title;
  document.getElementById("page-sub").textContent = sub;
  document.title = `${title} · Sentinel ACI`;
}

function navigate(hash) {
  if (location.hash === hash) handleRoute();
  else location.hash = hash;
}

function highlightNav(path) {
  $$(".nav__item").forEach((item) => {
    const route = item.dataset.route;
    const isActive =
      route === path ||
      (path.startsWith("#/case/") && route === "#/cases") ||
      (path.startsWith("#/settings/") && route === "#/settings");
    item.classList.toggle("is-active", isActive);
  });
}

/* ------------------------------------------------------------------ *
 * Shell chrome
 * ------------------------------------------------------------------ */

function applyIdentity(session) {
  const profile = getProfile();
  const name = session?.name || profile.name;

  $("#side-name").textContent = name;
  $("#side-rank").textContent = session?.rank || profile.rank;
  $("#side-avatar").textContent = initials(name);

  const foot = $("#foot-session");
  if (foot && session) {
    foot.textContent = `Session ${formatDateTime(session.signedInAt)}`;
  }

  const count = getCases().length;
  $("#nav-case-count").textContent = count;
}

function wireShellChrome() {
  // Sidebar toggle (mobile)
  $("#sidebar-open").addEventListener("click", openSidebar);
  $("#sidebar-close").addEventListener("click", closeSidebar);
  $("#sidebar-scrim").addEventListener("click", closeSidebar);

  // Close the drawer after navigating on small screens
  $$(".nav__item").forEach((link) =>
    link.addEventListener("click", () => {
      if (window.matchMedia("(max-width: 860px)").matches) closeSidebar();
    })
  );

  // Sign out
  $("#logout-btn").addEventListener("click", () => {
    signOut();
    closeSidebar();
    teardown = null;
    location.hash = "";
    showLogin();
    toast("Signed out. Session terminated.", { type: "warn", title: "Goodbye" });
  });

  // Global case search
  wireGlobalSearch();

  // Modal backdrop / close affordances
  $$("[data-close-modal]").forEach((el) => el.addEventListener("click", closeModal));
}

function wireGlobalSearch() {
  const input = $("#global-search");
  const results = $("#global-search-results");
  if (!input) return;

  let activeIndex = -1;
  let items = [];

  const close = () => {
    results.hidden = true;
    activeIndex = -1;
  };

  const run = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) return close();

    items = getCases()
      .filter((c) =>
        [c.id, c.title, c.summary]
          .filter(Boolean)
          .some((f) => String(f).toLowerCase().includes(q))
      )
      .slice(0, 8);

    if (!items.length) {
      results.innerHTML = `<div class="search-hit" style="cursor:default"><span>No matching case records</span></div>`;
      results.hidden = false;
      return;
    }

    results.innerHTML = items
      .map(
        (c, i) => `
        <button class="search-hit" data-index="${i}">
          <strong>${escapeHtml(c.title || "Untitled")}</strong>
          <span>${escapeHtml(c.id)} — ${escapeHtml((c.summary || "").slice(0, 60))}…</span>
          <div class="search-hit__meta">
            <span class="badge badge--${escapeHtml(c.status)}">${escapeHtml(c.status)}</span>
            <span class="faint">${escapeHtml(relativeTime(c.updatedAt || c.createdAt))}</span>
          </div>
        </button>`
      )
      .join("");

    results.hidden = false;
    activeIndex = -1;

    $$(".search-hit[data-index]", results).forEach((btn) => {
      btn.addEventListener("click", () => {
        const c = items[Number(btn.dataset.index)];
        input.value = "";
        close();
        navigate(`#/case/${encodeURIComponent(c.id)}`);
      });
    });
  };

  let debounce;
  input.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(run, 140);
  });

  input.addEventListener("focus", () => {
    if (input.value.trim()) run();
  });

  input.addEventListener("keydown", (e) => {
    const hits = $$(".search-hit[data-index]", results);
    if (!hits.length || results.hidden) return;

    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      activeIndex =
        e.key === "ArrowDown"
          ? (activeIndex + 1) % hits.length
          : (activeIndex - 1 + hits.length) % hits.length;
      hits.forEach((h, i) => h.classList.toggle("is-active", i === activeIndex));
      hits[activeIndex].scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = hits[Math.max(0, activeIndex)];
      if (target) target.click();
    } else if (e.key === "Escape") {
      input.value = "";
      close();
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".topbar__search")) close();
  });
}

function openSidebar() {
  $("#app-shell").classList.add("nav-open");
  $("#sidebar-scrim").hidden = false;
}

function closeSidebar() {
  $("#app-shell").classList.remove("nav-open");
  $("#sidebar-scrim").hidden = true;
}

/* ------------------------------------------------------------------ *
 * Clock
 * ------------------------------------------------------------------ */

function startClock() {
  stopClock();
  tickClock();
  clockTimer = setInterval(tickClock, 1000);
}

function stopClock() {
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = null;
}

function tickClock() {
  const node = $("#clock");
  if (!node) return;
  const now = new Date();
  node.querySelector("strong").textContent = now.toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  node.querySelector("span").textContent = now.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/* ------------------------------------------------------------------ *
 * Init
 * ------------------------------------------------------------------ */

setSettingsRerender(() => handleRoute());
boot();

// Expose a small handle for debugging in the console.
window.SentinelACI = {
  navigate,
  refresh: handleRoute,
  get cases() {
    return getCases();
  },
  get graph() {
    return activeGraph ? activeGraph.cy : null;
  },
  get graphView() {
    return activeGraph;
  },
  setGraph(instance) {
    activeGraph = instance;
  },
};