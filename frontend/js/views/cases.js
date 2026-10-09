/**
 * Cases section — status tabs, search/sort filters, case card grid.
 */

import {
  getCases,
  getMetrics,
  STATUS,
  STATUS_LABEL,
  cycleStatus,
  deleteCase,
} from "../store.js";
import {
  escapeHtml,
  formatDate,
  clampPercent,
  confidenceTier,
  icon,
  toast,
  confirmDialog,
  $, $$,
} from "../ui.js";

const FILTERS = {
  search: "",
  type: "all",
  sort: "updated",
};

export function renderCases({ navigate, params }) {
  const initialStatus = params?.status || "all";
  const root = $("#view-root");

  root.innerHTML = `
    <div class="page">
      <header class="page__head">
        <div>
          <p class="eyebrow">Case management</p>
          <h2 style="font-size:1.2rem;margin-top:4px">Investigation files</h2>
          <p>All case records held on this terminal. Select a file to review its full analysis.</p>
        </div>
        <div class="page__actions">
          <a class="btn btn--primary" href="#/analysis">${icon("plus")} New Investigation</a>
        </div>
      </header>

      <div class="tabs" id="case-tabs" role="tablist">
        ${tab("all", "All Cases")}
        ${tab(STATUS.ongoing, "Ongoing")}
        ${tab(STATUS.completed, "Completed")}
        ${tab(STATUS.closed, "Closed")}
      </div>

      <div class="filters">
        <div class="input-wrap">
          <svg class="input-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="1.7"/></svg>
          <input class="input" id="case-search" type="search" placeholder="Filter by case ID, title or summary…" />
        </div>
        <select class="select" id="case-sort" aria-label="Sort cases">
          <option value="updated">Recently updated</option>
          <option value="created">Newest first</option>
          <option value="confidence">Highest confidence</option>
          <option value="confidence-asc">Lowest confidence</option>
          <option value="flags">Most contradictions</option>
          <option value="id">Case ID</option>
        </select>
        <button class="btn btn--ghost btn--sm" id="clear-filters">Clear filters</button>
      </div>

      <div id="case-grid" class="case-grid"></div>
      <div id="case-pagination" class="row row--between" style="margin-top:4px"></div>
    </div>`;

  const grid = $("#case-grid", root);
  const pagination = $("#case-pagination", root);
  let activeStatus = initialStatus;

  const state = { page: 1, perPage: 9 };

  function draw() {
    const all = getCases();
    const m = getMetrics(all);

    // Tab counts
    $$("#case-tabs .tab", root).forEach((btn) => {
      const key = btn.dataset.status;
      const count =
        key === "all" ? m.total : all.filter((c) => c.status === key).length;
      btn.querySelector(".tab__count").textContent = count;
      btn.classList.toggle("is-active", key === activeStatus);
    });

    const list = applyFilters(all, activeStatus);

    if (!list.length) {
      grid.innerHTML = emptyState(all.length, activeStatus, FILTERS.search);
      pagination.innerHTML = "";
      return;
    }

    const start = (state.page - 1) * state.perPage;
    const pageItems = list.slice(start, start + state.perPage);

    grid.innerHTML = pageItems.map(cardTemplate).join("");
    renderPagination(list.length);
    wireCards();
  }

  function renderPagination(total) {
    const pages = Math.ceil(total / state.perPage);
    if (pages <= 1) {
      pagination.innerHTML = `<span class="faint" style="font-size:.76rem">Showing ${total} of ${total} records</span>`;
      return;
    }
    const from = (state.page - 1) * state.perPage + 1;
    const to = Math.min(state.page * state.perPage, total);
    pagination.innerHTML = `
      <span class="faint" style="font-size:.76rem">Showing ${from}–${to} of ${total} records</span>
      <div class="row">
        <button class="btn btn--ghost btn--sm" id="prev-page" ${state.page === 1 ? "disabled" : ""}>Previous</button>
        <span class="faint mono" style="font-size:.76rem">Page ${state.page} / ${pages}</span>
        <button class="btn btn--ghost btn--sm" id="next-page" ${state.page === pages ? "disabled" : ""}>Next</button>
      </div>`;

    const prev = $("#prev-page", pagination);
    const next = $("#next-page", pagination);
    if (prev) prev.addEventListener("click", () => { state.page -= 1; draw(); window.scrollTo({ top: 0, behavior: "smooth" }); });
    if (next) next.addEventListener("click", () => { state.page += 1; draw(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  }

  function wireCards() {
    $$(".case-card", grid).forEach((card) => {
      const id = card.dataset.id;

      card.addEventListener("click", (e) => {
        if (e.target.closest(".case-card__actions")) return;
        navigate(`#/case/${encodeURIComponent(id)}`);
      });

      card.querySelector("[data-act='open']")?.addEventListener("click", () =>
        navigate(`#/case/${encodeURIComponent(id)}`)
      );

      card.querySelector("[data-act='status']")?.addEventListener("click", () => {
        const updated = cycleStatus(id);
        if (updated) {
          toast(`Case ${id} moved to ${STATUS_LABEL[updated.status]}.`, {
            type: "ok",
            title: "Status updated",
          });
          draw();
        }
      });

      card.querySelector("[data-act='delete']")?.addEventListener("click", async () => {
        const ok = await confirmDialog({
          title: "Delete case record",
          message: `Permanently remove case ${id} and its stored analysis from this terminal? This cannot be undone.`,
          confirmLabel: "Delete record",
          danger: true,
        });
        if (ok) {
          deleteCase(id);
          toast(`Case ${id} removed.`, { type: "warn" });
          draw();
        }
      });
    });
  }

  // Tabs
  $$("#case-tabs .tab", root).forEach((btn) => {
    btn.addEventListener("click", () => {
      activeStatus = btn.dataset.status;
      state.page = 1;
      history.replaceState(null, "", `#/cases?status=${activeStatus}`);
      draw();
    });
  });

  // Search (debounced)
  const searchInput = $("#case-search", root);
  let debounce;
  searchInput.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      FILTERS.search = searchInput.value.trim().toLowerCase();
      state.page = 1;
      draw();
    }, 160);
  });

  // Sort
  $("#case-sort", root).addEventListener("change", (e) => {
    FILTERS.sort = e.target.value;
    state.page = 1;
    draw();
  });

  // Clear
  $("#clear-filters", root).addEventListener("click", () => {
    FILTERS.search = "";
    FILTERS.sort = "updated";
    searchInput.value = "";
    $("#case-sort", root).value = "updated";
    activeStatus = "all";
    state.page = 1;
    draw();
  });

  draw();
  return () => clearTimeout(debounce);
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function applyFilters(cases, status) {
  let list = cases.filter((c) => (status === "all" ? true : c.status === status));

  if (FILTERS.search) {
    const q = FILTERS.search;
    list = list.filter((c) =>
      [c.id, c.title, c.summary, c.narrative]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q))
    );
  }

  const sorters = {
    updated: (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
    created: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    confidence: (a, b) => (b.confidence || 0) - (a.confidence || 0),
    "confidence-asc": (a, b) => (a.confidence || 0) - (b.confidence || 0),
    flags: (a, b) => (b.contradictionCount || 0) - (a.contradictionCount || 0),
    id: (a, b) => String(a.id).localeCompare(String(b.id)),
  };

  return list.sort(sorters[FILTERS.sort] || sorters.updated);
}

function tab(key, label) {
  return `<button class="tab" data-status="${key}" role="tab" aria-selected="false">
            ${escapeHtml(label)}<span class="tab__count">0</span>
          </button>`;
}

function cardTemplate(c) {
  const tier = confidenceTier(c.confidence);
  const flags = c.contradictionCount || 0;

  return `
    <article class="case-card case-card--${escapeHtml(c.status)}" data-id="${escapeHtml(c.id)}" tabindex="0">
      <div class="case-card__bar"></div>
      <div class="case-card__body">
        <div class="case-card__top">
          <span class="case-card__id">${escapeHtml(c.id)}</span>
          <span class="pill-conf pill-conf--${tier.key}" title="${tier.label} confidence">
            ${clampPercent(c.confidence)}%
          </span>
        </div>
        <h3 class="case-card__title">${escapeHtml(c.title || "Untitled investigation")}</h3>
        <p class="case-card__summary">${escapeHtml(c.summary || "No narrative summary available.")}</p>
        <div class="case-card__stats">
          <div class="case-card__stat">
            <span>Entities</span><strong>${c.entityCount || 0}</strong>
          </div>
          <div class="case-card__stat">
            <span>Relations</span><strong>${c.relationCount || 0}</strong>
          </div>
          <div class="case-card__stat">
            <span>Flags</span><strong class="${flags ? "is-flagged" : ""}">${flags}</strong>
          </div>
        </div>
      </div>
      <footer class="case-card__foot">
        <div class="row" style="gap:8px">
          <span class="badge badge--${escapeHtml(c.status)}">${escapeHtml(STATUS_LABEL[c.status] || c.status)}</span>
          <span>${escapeHtml(formatDate(c.updatedAt || c.createdAt))}</span>
        </div>
        <div class="case-card__actions">
          <button class="icon-btn" data-act="status" title="Advance status (${escapeHtml(STATUS_LABEL[c.status])})">
            ${icon("refresh")}
          </button>
          <button class="icon-btn" data-act="open" title="Open case file">${icon("eye")}</button>
          <button class="icon-btn" data-act="delete" title="Delete case record">${icon("trash")}</button>
        </div>
      </footer>
    </article>`;
}

function emptyState(total, status, search) {
  if (total === 0) {
    return `<div class="panel" style="grid-column:1/-1">
      <div class="empty">
        ${icon("folder")}
        <strong>No case records on this terminal</strong>
        <p>Open a new investigation to analyse a narrative. Results are stored locally and listed here.</p>
        <a class="btn btn--primary btn--sm" href="#/analysis">${icon("plus")} New Investigation</a>
      </div>
    </div>`;
  }

  const label = status === "all" ? "any status" : STATUS_LABEL[status];
  return `<div class="panel" style="grid-column:1/-1">
    <div class="empty">
      ${icon("search")}
      <strong>No matching case files</strong>
      <p>No records match ${search ? `the filter “${escapeHtml(search)}”` : `the selected filter`} with ${escapeHtml(label)}. Adjust the filters or open a new investigation.</p>
    </div>
  </div>`;
}

