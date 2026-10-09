/**
 * Case file — read-only review of a stored case with full analysis artefacts.
 */

import { getCase, updateCase, deleteCase, STATUS, STATUS_LABEL } from "../store.js";
import { reportUrl } from "../api.js";
import { KnowledgeGraph } from "../graph.js";
import {
  escapeHtml,
  clampPercent,
  confidenceTier,
  relationColor,
  formatDateTime,
  relativeTime,
  pluralize,
  icon,
  toast,
  setBusy,
  copyText,
  confirmDialog,
  $,
  $$,
} from "../ui.js";

const TYPE_ORDER = ["PERSON", "LOCATION", "EVIDENCE", "TIME", "ENTITY"];
const TYPE_COLORS = {
  PERSON: "#dc4b4b",
  LOCATION: "#4aa3c9",
  EVIDENCE: "#8b9bb5",
  TIME: "#d99a26",
  ENTITY: "#9b59d6",
};

export function renderCaseFile({ navigate, id }) {
  const record = getCase(id);
  const root = $("#view-root");

  if (!record) {
    root.innerHTML = `
      <div class="page">
        <section class="panel"><div class="panel__body">
          <div class="empty">
            ${icon("folder")}
            <strong>Case record not found</strong>
            <p>No case with reference <span class="mono">${escapeHtml(id)}</span> exists on this terminal.</p>
            <a class="btn btn--primary btn--sm" href="#/cases">${icon("folder")} Back to cases</a>
          </div>
        </div></section>
      </div>`;
    return () => {};
  }

  const pct = clampPercent(record.confidence);
  const tier = confidenceTier(pct);
  const entities = record.entities || [];
  const relations = record.relations || [];
  const contradictions = record.contradictions || [];

  root.innerHTML = `
    <div class="page">
      <header class="page__head">
        <div>
          <p class="eyebrow">Case file</p>
          <h2 style="font-size:1.2rem;margin-top:4px">${escapeHtml(record.title || "Untitled investigation")}</h2>
          <p class="row" style="gap:9px;margin-top:6px;flex-wrap:wrap">
            <span class="mono soft" style="font-size:.82rem">${escapeHtml(record.id)}</span>
            <span class="dot-sep"></span>
            <span class="badge badge--${escapeHtml(record.status)}">${escapeHtml(STATUS_LABEL[record.status] || record.status)}</span>
            <span class="dot-sep"></span>
            <span class="faint" style="font-size:.76rem">Opened ${escapeHtml(formatDateTime(record.createdAt))}</span>
            <span class="dot-sep"></span>
            <span class="faint" style="font-size:.76rem">Updated ${escapeHtml(relativeTime(record.updatedAt))}</span>
          </p>
        </div>
        <div class="page__actions">
          <button class="btn btn--ghost btn--sm" id="advance-status">${icon("refresh")} Mark ${escapeHtml(nextStatusLabel(record.status))}</button>
          <a class="btn btn--ghost btn--sm" href="#/analysis?id=${encodeURIComponent(record.id)}">${icon("refresh")} Re-analyse</a>
          <button class="btn btn--primary btn--sm" id="open-report">${icon("pdf")} PDF Report</button>
        </div>
      </header>

      <!-- Summary strip -->
      <section class="result-strip">
        <div class="result-strip__kv">
          <span>Confidence</span><strong style="color:${tier.color}">${pct}%</strong>
        </div>
        <div class="result-strip__div"></div>
        <div class="result-strip__kv"><span>Entities</span><strong>${entities.length}</strong></div>
        <div class="result-strip__kv"><span>Relations</span><strong>${relations.length}</strong></div>
        <div class="result-strip__kv">
          <span>Contradictions</span>
          <strong style="${contradictions.length ? "color:#f07575" : ""}">${contradictions.length}</strong>
        </div>
        <div class="result-strip__div"></div>
        <div class="result-strip__kv">
          <span>Graph</span>
          <strong>${record.graphStats ? `${record.graphStats.nodes}n / ${record.graphStats.edges}e` : "—"}</strong>
        </div>
        <div class="result-strip__actions">
          <button class="btn btn--ghost btn--sm" id="copy-case">${icon("copy")} Copy record</button>
        </div>
      </section>

      <!-- Contradictions -->
      <section class="panel">
        <header class="panel__head">
          <h3 class="panel__title">${icon("flag")} Contradiction flags</h3>
          ${contradictions.length
            ? `<span class="badge badge--high">${pluralize(contradictions.length, "conflict")}</span>`
            : `<span class="badge badge--completed">None flagged</span>`}
        </header>
        <div class="panel__body" style="display:flex;flex-direction:column;gap:10px">
          ${
            contradictions.length
              ? contradictions.map(flagTemplate).join("")
              : `<div class="alert alert--ok">
                   <span class="alert__icon">${icon("check")}</span>
                   <div class="alert__body"><div class="alert__title">No contradictions detected</div></div>
                 </div>`
          }
        </div>
      </section>

      <!-- Graph -->
      <section class="panel graph-panel">
        <header class="panel__head">
          <h3 class="panel__title">${icon("graph")} Knowledge graph</h3>
          <span class="faint" style="font-size:.71rem">Click a node to trace its connections</span>
        </header>
        <div class="graph-toolbar">
          <select class="select" id="graph-layout" aria-label="Graph layout">
            <option value="cose">Force-directed</option>
            <option value="circle">Radial circle</option>
            <option value="concentric">Concentric (by type)</option>
            <option value="breadthfirst">Hierarchical</option>
            <option value="grid">Grid</option>
          </select>
          <button class="btn btn--ghost btn--sm" id="graph-fit">${icon("target")} Fit</button>
          <button class="btn btn--ghost btn--sm" id="graph-reset">${icon("refresh")} Reset</button>
        </div>
        <div class="graph-stage" id="graph-stage"></div>
      </section>

      <!-- Confidence breakdown -->
      <section class="panel">
        <header class="panel__head">
          <h3 class="panel__title">${icon("chart")} Confidence scoring</h3>
          <span class="badge badge--plain" style="color:${tier.color};border-color:${tier.color}55">${tier.label}</span>
        </header>
        <div class="panel__body">${breakdownTemplate(record)}</div>
      </section>

      <!-- Path search -->
      ${record.search ? searchTemplate(record.search) : ""}

      <!-- Entities & relations -->
      <section class="panel">
        <header class="panel__head">
          <h3 class="panel__title">${icon("folder")} Evidence register</h3>
          <span class="faint" style="font-size:.71rem">${entities.length} entities · ${relations.length} relations</span>
        </header>
        <div class="panel__body">
          <div id="entity-list">${entityTemplate(entities)}</div>
          <div style="margin-top:20px">
            <h4 class="label" style="margin-bottom:10px">Relationships</h4>
            <div id="relation-list">${relationTemplate(relations)}</div>
          </div>
        </div>
      </section>

      <!-- Narrative -->
      <section class="panel">
        <header class="panel__head">
          <h3 class="panel__title">${icon("file")} Submitted narrative</h3>
          <button class="btn btn--quiet btn--sm" id="copy-narrative">${icon("copy")} Copy</button>
        </header>
        <div class="panel__body">
          <div class="textarea textarea--mono" style="min-height:auto;border:none;background:transparent;padding:0">
            ${escapeHtml(record.narrative || "")}
          </div>
          ${
            record.startNode && record.targetNode
              ? `<p class="field-hint" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line-soft)">
                   Path search: <b>${escapeHtml(record.startNode)}</b> → <b>${escapeHtml(record.targetNode)}</b>
                 </p>`
              : ""
          }
        </div>
      </section>

      <div class="row" style="justify-content:center;padding:6px 0 4px">
        <button class="btn btn--danger btn--sm" id="delete-case">${icon("trash")} Delete case record</button>
      </div>
    </div>`;

  /* ---------------- actions ---------------- */

  $("#advance-status").addEventListener("click", () => {
    const order = [STATUS.ongoing, STATUS.completed, STATUS.closed];
    const next = order[(order.indexOf(record.status) + 1) % order.length];
    updateCase(record.id, { status: next });
    toast(`Case ${record.id} marked ${STATUS_LABEL[next].toLowerCase()}.`, {
      type: "ok",
      title: "Status updated",
    });
    navigate(`#/case/${encodeURIComponent(record.id)}`);
  });

  $("#delete-case").addEventListener("click", async () => {
    const ok = await confirmDialog({
      title: "Delete case record",
      message: `Permanently remove case ${record.id} from this terminal? This cannot be undone.`,
      confirmLabel: "Delete record",
      danger: true,
    });
    if (ok) {
      deleteCase(record.id);
      navigate("#/cases");
      toast(`Case ${record.id} removed.`, { type: "warn" });
    }
  });

  $("#copy-case").addEventListener("click", () =>
    copyText(JSON.stringify(record, null, 2), "Case record copied as JSON.")
  );

  $("#copy-narrative").addEventListener("click", () =>
    copyText(record.narrative || "", "Narrative copied to clipboard.")
  );

  $("#open-report").addEventListener("click", (evt) => {
    const url = reportUrl(record.pdfPath);
    if (!url) {
      toast("No PDF report was generated for this case.", {
        type: "warn",
        title: "Report unavailable",
      });
      return;
    }
    openReport(url, evt.currentTarget, record.id);
  });

  /* ---------------- graph ---------------- */

  const graph = new KnowledgeGraph($("#graph-stage"), {});
  graph.render(record.graph, record.graphStats);
  if (window.SentinelACI) window.SentinelACI.setGraph(graph);

  const layoutSelect = $("#graph-layout");
  layoutSelect.addEventListener("change", (e) => graph.setLayout(e.target.value));
  $("#graph-fit").addEventListener("click", () => graph.fit());
  $("#graph-reset").addEventListener("click", () => graph.reset());

  $$(".entity", root).forEach((card) =>
    card.addEventListener("click", () => {
      const ok = graph.focusNode(card.dataset.name);
      if (!ok) toast(`"${card.dataset.name}" is not present in the graph.`, { type: "warn" });
    })
  );

  return () => graph.destroy();
}

/* ------------------------------------------------------------------ *
 * Templates
 * ------------------------------------------------------------------ */

function breakdownTemplate(record) {
  const bd = record.confidenceData?.breakdown || {};
  const prior = Number(bd.prior || 0);
  const ent = Number(bd.entities || 0);
  const rel = Number(bd.relations || 0);
  const pen = Number(bd.contradiction_penalty || 0);
  const pct = clampPercent(record.confidence);
  const tier = confidenceTier(pct);

  const rows = [
    { label: "Base prior", value: prior, color: "#4aa3c9", sign: 0 },
    { label: "Entity evidence", value: ent, color: "#22a06b", sign: 1 },
    { label: "Relation evidence", value: rel, color: "#2f6feb", sign: 1 },
    { label: "Contradiction penalty", value: pen, color: "#dc4b4b", sign: -1 },
  ];

  return `
    <div class="confidence">
      <div class="gauge">
        <svg viewBox="0 0 176 176" role="img" aria-label="Confidence ${pct} percent">
          <circle class="gauge__track" cx="88" cy="88" r="76"></circle>
          <circle class="gauge__fill" cx="88" cy="88" r="76" stroke="${tier.color}"
                  stroke-dasharray="477.5" stroke-dashoffset="477.5" data-target="${(477.5 - (pct / 100) * 477.5).toFixed(1)}"></circle>
        </svg>
        <div class="gauge__center">
          <div class="gauge__value" style="color:${tier.color}">${pct}<sup>%</sup></div>
          <div class="gauge__label">Confidence</div>
          <div class="gauge__verdict" style="color:${tier.color}">${tier.label}</div>
        </div>
      </div>
      <div class="breakdown">
        ${rows
          .map((r) => {
            const cls = r.sign > 0 ? "is-plus" : r.sign < 0 ? "is-minus" : "is-neutral";
            const prefix = r.sign > 0 ? "+" : r.sign < 0 ? "−" : "";
            return `
              <div class="bd-row">
                <div class="bd-row__label"><i style="background:${r.color}"></i>${escapeHtml(r.label)}</div>
                <div class="bd-row__track">
                  <div class="bd-row__fill" style="width:${Math.min(100, Math.round(r.value * 100))}%;background:${r.color}"></div>
                </div>
                <div class="bd-row__value ${cls}">${prefix}${r.value.toFixed(2)}</div>
              </div>`;
          })
          .join("")}
        <div class="bd-formula">
          score = prior <b>${prior.toFixed(2)}</b> + entities <b>${ent.toFixed(2)}</b>
          + relations <b>${rel.toFixed(2)}</b> − penalty <b>${pen.toFixed(2)}</b> → <b>${pct}%</b>
        </div>
      </div>
    </div>`;
}

function flagTemplate(flag) {
  const severity = String(flag.severity || "MEDIUM").toUpperCase();
  const sevClass = severity === "HIGH" ? "" : severity === "MEDIUM" ? "flag--medium" : "flag--low";
  const meta = [];
  if (flag.subject) meta.push(`<span>Subject <b>${escapeHtml(flag.subject)}</b></span>`);
  if (flag.locations?.length) meta.push(`<span>Locations <b>${escapeHtml(flag.locations.join(", "))}</b></span>`);
  if (flag.time) meta.push(`<span>Time <b>${escapeHtml(flag.time)}</b></span>`);

  return `
    <article class="flag ${sevClass}">
      <div class="flag__icon">${icon("alert")}</div>
      <div class="flag__body">
        <div class="flag__head">
          <span class="flag__type">${escapeHtml(String(flag.type || "conflict").replace(/_/g, " "))}</span>
          <span class="badge badge--${severity === "HIGH" ? "high" : severity === "MEDIUM" ? "medium" : "low"}">${escapeHtml(severity)}</span>
        </div>
        <p class="flag__message">${escapeHtml(flag.message || "Unspecified evidence conflict.")}</p>
        ${meta.length ? `<div class="flag__meta">${meta.join("")}</div>` : ""}
      </div>
    </article>`;
}

function searchTemplate(search) {
  const algorithms = Object.entries(search);
  const meta = {
    BFS: { cls: "algo--bfs", desc: "Breadth-first · fewest hops", note: "Shortest chain" },
    DFS: { cls: "algo--dfs", desc: "Depth-first · deep chain", note: "Deepest branch" },
    "A*": { cls: "algo--astar", desc: "A* · confidence-weighted", note: "High-confidence edges" },
  };

  return `
    <section class="panel">
      <header class="panel__head">
        <h3 class="panel__title">${icon("route")} Investigation path search</h3>
        <span class="faint" style="font-size:.71rem">Recorded at time of analysis</span>
      </header>
      <div class="panel__body">
        <div class="algo-grid">
          ${algorithms
            .map(([name, result]) => {
              const m = meta[name] || { cls: "", desc: "", note: "" };
              const path = result.path || [];
              return `
              <article class="algo ${m.cls}">
                <header class="algo__head">
                  <div class="algo__name"><h4>${escapeHtml(name)}</h4><em>${escapeHtml(m.desc)}</em></div>
                  <span class="badge badge--${result.found ? "completed" : "high"}">${result.found ? "Found" : "No path"}</span>
                </header>
                <div class="algo__metrics">
                  <div class="algo__metric"><span>Hops</span><strong class="${result.found ? "" : "is-none"}">${result.found ? result.length : "—"}</strong></div>
                  <div class="algo__metric"><span>Strategy</span><strong style="font-size:.78rem">${escapeHtml(m.note)}</strong></div>
                </div>
                <div class="path-chain">
                  ${
                    path.length
                      ? path
                          .map((node, i) => {
                            const cls =
                              i === 0 ? "path-node path-node--start"
                              : i === path.length - 1 ? "path-node path-node--target"
                              : "path-node";
                            return `${i ? '<span class="path-arrow">→</span>' : ""}<span class="${cls}">${escapeHtml(node)}</span>`;
                          })
                          .join("")
                      : `<span class="faint" style="font-size:.76rem">No connecting path recorded.</span>`
                  }
                </div>
                <pre class="algo__log">${escapeHtml((result.log || []).join("\n"))}</pre>
              </article>`;
            })
            .join("")}
        </div>
      </div>
    </section>`;
}

function entityTemplate(entities) {
  if (!entities.length) {
    return `<div class="empty" style="padding:24px">${icon("folder")}<strong>No entities extracted</strong></div>`;
  }

  const grouped = entities.reduce((acc, e) => {
    (acc[e.type] = acc[e.type] || []).push(e);
    return acc;
  }, {});

  return TYPE_ORDER.filter((t) => grouped[t]?.length)
    .map(
      (type) => `
      <div style="margin-bottom:14px">
        <div class="label" style="margin-bottom:8px;display:flex;align-items:center;gap:7px">
          <i style="width:8px;height:8px;border-radius:50%;background:${TYPE_COLORS[type]};display:block"></i>
          ${escapeHtml(type)} <span class="faint">(${grouped[type].length})</span>
        </div>
        <div class="entity-grid">
          ${grouped[type]
            .map(
              (e) => `
            <div class="entity" data-name="${escapeHtml(e.text)}" title="Locate in graph">
              <span class="entity__dot" style="background:${TYPE_COLORS[e.type]}"></span>
              <div class="entity__text">
                <div class="entity__name">${escapeHtml(e.text)}</div>
                <div class="entity__type">${escapeHtml(e.id || e.type)}</div>
              </div>
            </div>`
            )
            .join("")}
        </div>
      </div>`
    )
    .join("");
}

function relationTemplate(relations) {
  if (!relations.length) {
    return `<div class="empty" style="padding:22px">${icon("link")}<strong>No relationships extracted</strong></div>`;
  }

  return `<table class="table">
    <thead><tr><th>Source</th><th>Relation</th><th>Target</th><th class="right">Confidence</th><th>Basis</th></tr></thead>
    <tbody>
      ${relations
        .map(
          (r) => `
        <tr>
          <td class="rel-row__src">${escapeHtml(r.source)}</td>
          <td><span class="rel-row__verb">${escapeHtml(r.relation || "related_to")}</span></td>
          <td class="rel-row__tgt">${escapeHtml(r.target)}</td>
          <td class="right">
            <span class="conf-bar"><i style="width:${clampPercent(Number(r.confidence) * 100)}%;background:${relationColor(r.confidence)}"></i></span>
            <span class="rel-row__conf" style="color:${relationColor(r.confidence)}">${clampPercent(Number(r.confidence || 0) * 100)}%</span>
          </td>
          <td class="faint" style="font-size:.76rem">${escapeHtml(r.reason || "—")}</td>
        </tr>`
        )
        .join("")}
    </tbody>
  </table>`;
}

function nextStatusLabel(status) {
  const order = [STATUS.ongoing, STATUS.completed, STATUS.closed];
  const next = order[(order.indexOf(status) + 1) % order.length];
  return STATUS_LABEL[next];
}

async function openReport(url, button, caseId) {
  setBusy(button, true, "Opening…");
  try {
    const res = await fetch(url, { method: "HEAD" }).catch(() => null);
    if (res && !res.ok) throw new Error(`HTTP ${res.status}`);
    const opened = window.open(url, "_blank", "noopener");
    if (!opened) {
      toast("Pop-up blocked — opening the report URL directly.", { type: "warn" });
      window.location.href = url;
    } else {
      toast(`PDF report for case ${caseId} opened.`, { type: "ok" });
    }
  } catch (err) {
    toast(
      `${err.message}. Reports are written by the backend into the reports/ directory.`,
      { type: "danger", title: "Report unavailable" }
    );
  } finally {
    setBusy(button, false, "PDF Report");
  }
}