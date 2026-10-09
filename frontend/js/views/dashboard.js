/**
 * Dashboard — operational overview, summary cards, recent case activity.
 */

import {
  getCases,
  getMetrics,
  getProfile,
  STATUS_LABEL,
} from "../store.js";
import {
  escapeHtml,
  relativeTime,
  clampPercent,
  confidenceTier,
  icon,
  $,
} from "../ui.js";

export function renderDashboard({ navigate }) {
  const profile = getProfile();
  const cases = getCases();
  const m = getMetrics(cases);
  const recent = [...cases]
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    .slice(0, 6);

  const root = $("#view-root");
  root.innerHTML = `
    <div class="page">
      <section class="welcome">
        <div class="welcome__text">
          <p class="eyebrow">${escapeHtml(profile.precinct)}</p>
          <h2>Welcome back, ${escapeHtml(profile.name.split(" ")[0])}</h2>
          <p>
            You have ${m.ongoing} ongoing ${m.ongoing === 1 ? "investigation" : "investigations"}.
            ${m.contradictions > 0
              ? `${m.contradictions} evidence ${m.contradictions === 1 ? "conflict requires" : "conflicts require"} review across active files.`
              : "No unresolved evidence conflicts on record."}
          </p>
          <div class="welcome__meta">
            <div><strong>${escapeHtml(profile.badgeId)}</strong><span>Badge ID</span></div>
            <div><strong>${escapeHtml(profile.rank)}</strong><span>Rank</span></div>
            <div><strong>${m.newThisWeek}</strong><span>Opened this week</span></div>
            <div><strong>${m.total ? `${m.avgConfidence}%` : "—"}</strong><span>Avg confidence</span></div>
          </div>
        </div>
        <div class="welcome__actions">
          <a class="btn btn--primary btn--lg" href="#/analysis">
            ${icon("plus")} New Investigation
          </a>
          <a class="btn btn--ghost" href="#/cases">${icon("folder")} View all cases</a>
        </div>
      </section>

      <section class="stats">
        ${statCard({ icon: "folder", value: m.total, label: "Total Cases", tone: "", trend: m.newThisWeek ? `${m.newThisWeek} this week` : "No new files" })}
        ${statCard({ icon: "route", value: m.ongoing, label: "Ongoing Cases", tone: "ongoing", trend: "Active investigations" })}
        ${statCard({ icon: "check", value: m.completed, label: "Completed Cases", tone: "completed", trend: "Analysis concluded" })}
        ${statCard({ icon: "archive", value: m.closed, label: "Closed Cases", tone: "closed", trend: "Archived" })}
        ${statCard({
          icon: "chart",
          value: `${m.avgConfidence}<small>%</small>`,
          label: "Avg Confidence",
          tone: "confidence",
          trend: m.total ? "Across all files" : "Awaiting analysis",
        })}
        ${statCard({
          icon: "flag",
          value: m.contradictions,
          label: "Contradictions",
          tone: "risk",
          trend: m.contradictions ? "Requires review" : "None flagged",
        })}
      </section>

      <section class="panel">
        <header class="panel__head">
          <h2 class="panel__title">${icon("clock")} Recent case activity</h2>
          <a class="btn btn--quiet btn--sm" href="#/cases">View all ${icon("folder")}</a>
        </header>
        <div class="panel__body panel__body--flush">
          ${
            recent.length
              ? `<table class="table table--clickable">
                  <thead>
                    <tr>
                      <th>Case ID</th>
                      <th>Summary</th>
                      <th>Status</th>
                      <th class="right">Confidence</th>
                      <th class="right">Flags</th>
                      <th class="right">Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${recent.map((c) => rowTemplate(c, navigate)).join("")}
                  </tbody>
                </table>`
              : `<div class="empty">
                  ${icon("folder")}
                  <strong>No case records yet</strong>
                  <p>Start an investigation to build your first case file. Narrative text is analysed for entities, links and contradictions.</p>
                  <a class="btn btn--primary btn--sm" href="#/analysis">${icon("plus")} New Investigation</a>
                </div>`
          }
        </div>
      </section>
    </div>`;

  wireRows(root, navigate);
  return () => {};
}

function statCard({ icon: ic, value, label, tone, trend }) {
  return `
    <article class="stat ${tone ? `stat--${tone}` : ""}">
      <div class="stat__top">
        <div class="stat__icon">${icon(ic)}</div>
      </div>
      <div class="stat__value">${value}</div>
      <div class="stat__label">${escapeHtml(label)}</div>
      <div class="stat__trend">${escapeHtml(trend || "")}</div>
    </article>`;
}

function rowTemplate(c, navigate) {
  const tier = confidenceTier(c.confidence);
  return `
    <tr data-case="${escapeHtml(c.id)}" tabindex="0">
      <td><span class="table__id">${escapeHtml(c.id)}</span></td>
      <td>
        <div class="table__title">${escapeHtml(c.title || c.summary || "Untitled")}</div>
        <div class="table__sub">${escapeHtml((c.summary || "").slice(0, 74))}${(c.summary || "").length > 74 ? "…" : ""}</div>
      </td>
      <td><span class="badge badge--${escapeHtml(c.status)}">${escapeHtml(STATUS_LABEL[c.status] || c.status)}</span></td>
      <td class="right"><span class="pill-conf pill-conf--${tier.key}">${clampPercent(c.confidence)}%</span></td>
      <td class="right">
        ${
          c.contradictionCount
            ? `<span class="cell-flags">${icon("alert")} ${c.contradictionCount}</span>`
            : `<span class="cell-flags cell-flags--none">0</span>`
        }
      </td>
      <td class="right faint nowrap">${escapeHtml(relativeTime(c.updatedAt || c.createdAt))}</td>
    </tr>`;
}

function wireRows(root, navigate) {
  root.querySelectorAll("tr[data-case]").forEach((row) => {
    const id = row.dataset.case;
    const open = () => navigate(`#/case/${encodeURIComponent(id)}`);
    row.addEventListener("click", open);
    row.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
}

