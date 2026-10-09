/**
 * Shared UI helpers: escaping, formatting, toasts, modals, icons.
 */

/* ------------------------------------------------------------------ *
 * Escaping & DOM
 * ------------------------------------------------------------------ */

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape a value for safe use inside a Cytoscape data selector. */
export function escapeSelector(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function el(tag, attrs = {}, html = "") {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== null && value !== undefined && value !== false) {
      node.setAttribute(key, value === true ? "" : value);
    }
  }
  if (html) node.innerHTML = html;
  return node;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/* ------------------------------------------------------------------ *
 * Formatting
 * ------------------------------------------------------------------ */

export function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(ts) {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

export function initials(name) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function clampPercent(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function confidenceTier(pct) {
  const v = clampPercent(pct);
  if (v >= 75) return { key: "high", label: "Strong", color: "#22a06b" };
  if (v >= 50) return { key: "mid", label: "Moderate", color: "#d99a26" };
  return { key: "low", label: "Weak", color: "#dc4b4b" };
}

export function relationColor(conf) {
  const v = Number(conf);
  if (v >= 0.85) return "#4dc79a";
  if (v >= 0.7) return "#e6b455";
  return "#f07575";
}

export function pluralize(count, singular, plural) {
  return `${count} ${count === 1 ? singular : plural || `${singular}s`}`;
}

/* ------------------------------------------------------------------ *
 * Icons
 * ------------------------------------------------------------------ */

const ICONS = {
  dashboard: '<path d="M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z" fill="currentColor"/>',
  folder: '<path d="M4 7h16v13H4z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  plus: '<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" fill="none"/>',
  check: '<path d="m5 13 4.5 4.5L19 7" stroke="currentColor" stroke-width="2" fill="none"/>',
  lock: '<rect x="4" y="10" width="16" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8 10V7a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  flag: '<path d="M5 21V4h9l-1 3h6v8h-6l-1-3H5" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  alert: '<path d="M12 4 2.5 20h19L12 4Z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 10v4M12 17.2v.1" stroke="currentColor" stroke-width="1.8"/>',
  file: '<path d="M6 3h8l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M14 3v4h4" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  graph: '<circle cx="6" cy="18" r="2.6" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="18" cy="6" r="2.6" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="18" cy="18" r="2.6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m8.3 16.6 7.4-9.2M8.6 18h6.8" stroke="currentColor" stroke-width="1.6"/>',
  download: '<path d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14" stroke="currentColor" stroke-width="1.7" fill="none"/>',
  eye: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  clock: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 7v5l3.5 2" stroke="currentColor" stroke-width="1.7" fill="none"/>',
  user: '<circle cx="12" cy="8" r="3.6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M5 20a7 7 0 0 1 14 0" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  shield: '<path d="M12 3 20 6v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6l8-3Z" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  key: '<circle cx="8" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 12h8m-2 0v3m-2-3v2" stroke="currentColor" stroke-width="1.7" fill="none"/>',
  logout: '<path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h9" fill="none" stroke="currentColor" stroke-width="1.7"/>',
  search: '<circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="1.7"/>',
  info: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M12 11v5M12 8.2v.1" stroke="currentColor" stroke-width="1.8"/>',
  target: '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  route: '<circle cx="6" cy="6" r="2.6" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="18" cy="18" r="2.6" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M8.6 6H14a3.5 3.5 0 0 1 0 7H10a3.5 3.5 0 0 0 0 5h5.4" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  pdf: '<path d="M6 3h8l4 4v14H6z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M14 3v4h4" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M9 16h1.4a1.3 1.3 0 0 0 0-2.6H9v4m0-2.2h1.8a1.3 1.3 0 0 1 0 2.6H9" stroke="currentColor" stroke-width="1.3" fill="none"/>',
  link: '<path d="M10 13a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7L11 6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M14 11a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7L13 18" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 16V6a2 2 0 0 1 2-2h10" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  mail: '<path d="M3 6h18v12H3z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="m3 7 9 6 9-6" fill="none" stroke="currentColor" stroke-width="1.6"/>',
  archive: '<path d="M4 8h16v12H4z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M3 4h18v4H3z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M10 12h4" stroke="currentColor" stroke-width="1.7"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2" stroke="currentColor" stroke-width="1.7" fill="none"/>',
};

export function icon(name, cls = "") {
  const path = ICONS[name] || ICONS.info;
  return `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${path}</svg>`;
}

/* ------------------------------------------------------------------ *
 * Toasts
 * ------------------------------------------------------------------ */

export function toast(message, { type = "info", title = "", timeout = 4200 } = {}) {
  const host = document.getElementById("toast-host");
  if (!host) return;

  const iconName = type === "ok" ? "check" : type === "danger" ? "alert" : type === "warn" ? "alert" : "info";
  const node = el("div", { class: `toast toast--${type}` });
  node.innerHTML =
    `${icon(iconName, "toast__icon")}` +
    `<div class="grow">${title ? `<strong>${escapeHtml(title)}</strong>` : ""}` +
    `<p>${escapeHtml(message)}</p></div>`;

  host.appendChild(node);

  const remove = () => {
    node.classList.add("is-out");
    setTimeout(() => node.remove(), 220);
  };
  const timer = setTimeout(remove, timeout);
  node.addEventListener("click", () => {
    clearTimeout(timer);
    remove();
  });
}

/* ------------------------------------------------------------------ *
 * Modal
 * ------------------------------------------------------------------ */

let modalCloseHandler = null;

export function openModal({ title, body, onMount, width }) {
  const modal = document.getElementById("modal");
  const panel = modal.querySelector(".modal__panel");
  const bodyHost = document.getElementById("modal-body");

  document.getElementById("modal-title").textContent = title || "";
  bodyHost.innerHTML = "";
  if (typeof body === "string") bodyHost.innerHTML = body;
  else if (body instanceof Node) bodyHost.appendChild(body);

  if (width) panel.style.width = `min(${width}, 100%)`;
  else panel.style.width = "";

  modal.hidden = false;
  document.body.style.overflow = "hidden";

  const focusable = bodyHost.querySelector("input, select, textarea, button");
  if (focusable) setTimeout(() => focusable.focus(), 40);

  if (onMount) modalCloseHandler = onMount(bodyHost);
  return bodyHost;
}

export function closeModal() {
  const modal = document.getElementById("modal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  document.body.style.overflow = "";
  document.getElementById("modal-body").innerHTML = "";
  if (modalCloseHandler) {
    modalCloseHandler();
    modalCloseHandler = null;
  }
}

export function confirmDialog({ title, message, confirmLabel = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    const body = el("div");
    body.innerHTML = `<p class="soft" style="font-size:.86rem;line-height:1.65">${escapeHtml(message)}</p>`;

    const actions = el("div", {
      class: "row",
      style: "justify-content:flex-end;gap:9px;margin-top:20px",
    });
    const cancel = el("button", { class: "btn btn--ghost" }, "Cancel");
    const ok = el(
      "button",
      { class: `btn ${danger ? "btn--danger" : "btn--primary"}` },
      escapeHtml(confirmLabel)
    );
    actions.append(cancel, ok);
    body.appendChild(actions);

    openModal({ title, body, onMount: () => {
      cancel.addEventListener("click", () => {
        closeModal();
        resolve(false);
      });
      ok.addEventListener("click", () => {
        closeModal();
        resolve(true);
      });
    }});

    setTimeout(() => ok.focus(), 40);
  });
}

/* ------------------------------------------------------------------ *
 * Button busy state
 * ------------------------------------------------------------------ */

export function setBusy(button, busy, label) {
  if (!button) return;
  if (busy) {
    button.dataset.label = button.querySelector(".btn__label")?.textContent || button.textContent;
    button.setAttribute("aria-busy", "true");
    button.innerHTML = `<span class="spin"></span><span class="btn__label">${escapeHtml(
      label || "Working…"
    )}</span>`;
  } else {
    button.removeAttribute("aria-busy");
    const original = button.dataset.label;
    button.innerHTML = `<span class="btn__label">${escapeHtml(original || label || "Done")}</span>`;
    delete button.dataset.label;
  }
}

/* ------------------------------------------------------------------ *
 * Clipboard
 * ------------------------------------------------------------------ */

export async function copyText(value, successMessage = "Copied to clipboard.") {
  try {
    await navigator.clipboard.writeText(String(value));
    toast(successMessage, { type: "ok" });
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = String(value);
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    toast(ok ? successMessage : "Clipboard unavailable in this browser.", {
      type: ok ? "ok" : "warn",
    });
    return ok;
  }
}