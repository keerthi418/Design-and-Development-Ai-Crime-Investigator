/**
 * New Investigation / Case Analysis.
 * Wires the composer to POST /analyze and renders every analysis artefact:
 * confidence meter, contradiction flags, knowledge graph, BFS/DFS/A* paths,
 * entities, relations and PDF report generation.
 */

import { analyzeCase, fetchSampleCase, reportUrl } from "../api.js";
import {
  saveAnalysisResult,
  getCase,
  getPrefs,
  setPrefs,
  nodeColor,
} from "../store.js";
import { KnowledgeGraph } from "../graph.js";
import {
  escapeHtml,
  clampPercent,
  confidenceTier,
  relationColor,
  formatDateTime,
  pluralize,
  icon,
  toast,
  setBusy,
  copyText,
  $, $$,
} from "../ui.js";

const TYPE_ORDER = ["PERSON", "LOCATION", "EVIDENCE", "TIME", "ENTITY"];

export function renderAnalysis({ navigate, params }) {
  const editingId = params?.id || null;
  const existing = editingId ? getCase(editingId) : null;

  const root = $("#view-root");
  root.innerHTML = `
    <div class="page">
      <header class="page__head">
        <div>
          <p class="eyebrow">${existing ? "Re-analyse case file" : "Case intake"}</p>
          <h2 style="font-size:1.2rem;margin-top:4px">${existing ? escapeHtml(existing.title) : "New investigation"}</h2>
          <p>${existing
            ? `Updating <span class="mono">${escapeHtml(existing.id)}</span>. A new analysis replaces the stored result.`
            : "Enter the case narrative, identify the start and target nodes, then run the analysis pipeline."}</p>
        </div>
        <div class="page__actions">
          <a class="btn btn--ghost" href="#/cases">${icon("folder")} All cases</a>
        </div>
      </header>

      <div class="analysis">
        <!-- ============ Composer ============ -->
        <aside class="analysis__aside">
          <section class="panel">
            <header class="panel__head">
              <h3 class="panel__title">${icon("file")} Case narrative</h3>
              <button class="btn btn--quiet btn--sm" id="load-sample">${icon("download")} Sample</button>
            </header>
            <div class="panel__body">
              <div class="field">
                <label class="label" for="case-title">Case title <span class="faint">(optional)</span></label>
                <input class="input" id="case-title" type="text" placeholder="Auto-generated if left blank" />
              </div>

              <div class="field">
                <label class="label" for="case-text">Narrative text</label>
                <textarea class="textarea" id="case-text" placeholder="Paste witness statements, complaint details, evidence logs and timeline entries here…"></textarea>
                <div class="composer-meta">
                  <span class="faint" id="char-count">0 characters · 0 words</span>
                  <button class="btn btn--quiet btn--sm" id="clear-text">Clear</button>
                </div>
              </div>

              <div class="field">
                <label class="label">Path search nodes</label>
                <div class="node-pair">
                  <div>
                    <label class="label" for="start-node" style="font-size:.63rem">Start</label>
                    <input class="input" id="start-node" type="text" placeholder="e.g. Ravi" />
                  </div>
                  <div class="node-pair__arrow">${icon("route")}</div>
                  <div>
                    <label class="label" for="target-node" style="font-size:.63rem">Target</label>
                    <input class="input" id="target-node" type="text" placeholder="e.g. Warehouse" />
                  </div>
                </div>
                <p class="field-hint" style="margin-top:7px">
                  Optional. Supplying both nodes runs the BFS / DFS / A* comparison.
                </p>
                <div class="suggest-list" id="node-suggestions"></div>
              </div>

              <div class="composer-actions">
                <button class="btn btn--primary btn--block btn--lg" id="analyze-btn">
                  ${icon("target")} <span class="btn__label">Analyze Case</span>
                </button>
              </div>
            </div>
          </section>

          <section class="panel">
            <header class="panel__head">
              <h3 class="panel__title">${icon("info")} Pipeline</h3>
            </header>
            <div class="panel__body" style="padding-top:12px">
              <ol class="muted" style="font-size:.76rem;line-height:1.95;padding-left:18px;margin:0">
                <li>NLP entity &amp; relation extraction</li>
                <li>Knowledge-graph construction</li>
                <li>CSP contradiction detection</li>
                <li>Bayesian confidence scoring</li>
                <li>Path search &amp; PDF report</li>
              </ol>
            </div>
          </section>
        </aside>

        <!-- ============ Results ============ -->
        <section class="analysis__main" id="results">
          ${placeholderPanel()}
        </section>
      </div>
    </div>`;

  const textInput = $("#case-text", root);
  const startInput = $("#start-node", root);
  const targetInput = $("#target-node", root);
  const titleInput = $("#case-title", root);
  const analyzeBtn = $("#analyze-btn", root);
  const results = $("#results", root);

  let graph = null;
  let lastResult = existing ? buildResultFromCase(existing) : null;

  // Prefill when editing an existing case.
  if (existing) {
    textInput.value = existing.narrative || "";
    titleInput.value = existing.title || "";
    startInput.value = existing.startNode || "";
    targetInput.value = existing.targetNode || "";
  }

  updateCounts();
  wirePlaceholder();
  if (lastResult) renderResults(lastResult);

  /* ---------------- composer wiring ---------------- */

  textInput.addEventListener("input", () => {
    updateCounts();
    updateSuggestions(lastResult?.entities || []);
  });

  $("#clear-text", root).addEventListener("click", () => {
    textInput.value = "";
    startInput.value = "";
    targetInput.value = "";
    updateCounts();
    textInput.focus();
  });

  async function loadSample(evt) {
    const btn = evt?.currentTarget || $("#load-sample", root);
    setBusy(btn, true, "Loading…");
    try {
      const sample = await fetchSampleCase();
      textInput.value = sample.text || "";
      if (!startInput.value) startInput.value = "Ravi";
      if (!targetInput.value) targetInput.value = "Warehouse";
      updateCounts();
      toast("Sample case narrative loaded.", { type: "ok" });
    } catch (err) {
      toast(err.message, { type: "danger", title: "Could not load sample" });
    } finally {
      setBusy(btn, false, "Sample");
    }
  }

  $("#load-sample", root).addEventListener("click", loadSample);

  analyzeBtn.addEventListener("click", () => runAnalysis());
  [textInput, startInput].forEach((el) =>
    el.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") runAnalysis();
    })
  );

  function updateCounts() {
    const text = textInput.value;
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    $("#char-count", root).textContent = `${text.length} characters · ${words} words`;
  }

  function updateSuggestions(entities) {
    const host = $("#node-suggestions", root);
    const names = (entities || []).map((e) => e.text).slice(0, 8);
    if (!names.length) {
      host.innerHTML = "";
      return;
    }
    host.innerHTML =
      `<span class="faint" style="width:100%;font-size:.66rem">From last analysis:</span>` +
      names
        .map(
          (n) =>
            `<button class="suggest suggest--start" data-name="${escapeHtml(n)}" title="Use as start node">${escapeHtml(n)}</button>`
        )
        .join("");

    $$(".suggest", host).forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = startInput.value.trim() ? targetInput : startInput;
        target.value = btn.dataset.name;
        target.focus();
      });
    });
  }

  /* ---------------- analysis run ---------------- */

  async function runAnalysis() {
    const text = textInput.value.trim();
    if (!text) {
      textInput.classList.add("is-invalid");
      toast("Case narrative text is required.", { type: "warn", title: "Nothing to analyse" });
      textInput.focus();
      return;
    }

    setBusy(analyzeBtn, true, "Analysing…");
    results.innerHTML = loadingPanel();
    window.scrollTo({ top: 0, behavior: "smooth" });

    try {
      const data = await analyzeCase({
        text,
        caseId: existing?.id || null,
        startNode: startInput.value.trim(),
        targetNode: targetInput.value.trim(),
      });

      lastResult = data;
      renderResults(data);

      // Persist to the case store
      const record = saveAnalysisResult(data, {
        text,
        startNode: startInput.value.trim(),
        targetNode: targetInput.value.trim(),
        record: existing,
        title: titleInput.value.trim(),
      });

      const flags = (data.contradictions || []).length;
      toast(
        `Case ${record.id} analysed — ${record.confidence}% confidence, ${pluralize(flags, "contradiction")} flagged.`,
        {
          type: flags ? "warn" : "ok",
          title: flags ? "Analysis complete — review required" : "Analysis complete",
        }
      );

      if (!existing) {
        // Reflect the newly minted case ID in the header.
        titleInput.value = record.title;
      }
    } catch (err) {
      results.innerHTML = errorPanel(err.message);
      toast(err.message, { type: "danger", title: "Analysis failed" });
    } finally {
      setBusy(analyzeBtn, false, "Analyze Case");
      updateSuggestions(lastResult?.entities || []);
    }
  }

  /* ---------------- rendering ---------------- */

  function renderResults(data) {
    const confidence = data.confidence || {};
    const pct = clampPercent(confidence.percentage);
    const tier = confidenceTier(pct);
    const entities = data.entities || [];
    const relations = data.relations || [];
    const contradictions = data.contradictions || [];
    const caseId = (data.case_id || existing?.id || "—").toString().toUpperCase();

    results.innerHTML = `
      <div class="result-strip">
        <div>
          <div class="result-strip__id">${escapeHtml(caseId)}</div>
          <div class="faint" style="font-size:.7rem">Case reference</div>
        </div>
        <div class="result-strip__div"></div>
        <div class="result-strip__kv">
          <span>Entities</span><strong>${entities.length}</strong>
        </div>
        <div class="result-strip__kv">
          <span>Relations</span><strong>${relations.length}</strong>
        </div>
        <div class="result-strip__kv">
          <span>Flags</span><strong style="${contradictions.length ? "color:#f07575" : ""}">${contradictions.length}</strong>
        </div>
        <div class="result-strip__kv">
          <span>Paths</span><strong>${data.search ? Object.keys(data.search).length : "—"}</strong>
        </div>
        <div class="result-strip__actions">
          <button class="btn btn--ghost btn--sm" id="copy-json">${icon("copy")} Copy JSON</button>
          <button class="btn btn--primary btn--sm" id="gen-pdf">${icon("pdf")} Generate PDF Report</button>
        </div>
      </div>

      <!-- Confidence -->
      <section class="panel">
        <header class="panel__head">
          <h3 class="panel__title">${icon("chart")} Evidence confidence</h3>
          <span class="badge badge--plain" style="color:${tier.color};border-color:${tier.color}55">${tier.label} evidentiary support</span>
        </header>
        <div class="panel__body">${confidenceTemplate(confidence, pct, tier)}</div>
      </section>

      <!-- Contradictions -->
      <section class="panel">
        <header class="panel__head">
          <h3 class="panel__title">${icon("flag")} Contradiction flags</h3>
          ${contradictions.length
            ? `<span class="badge badge--high">${pluralize(contradictions.length, "conflict")} detected</span>`
            : `<span class="badge badge--completed">No conflicts detected</span>`}
        </header>
        <div class="panel__body" style="display:flex;flex-direction:column;gap:10px">
          ${contradictions.length ? contradictions.map(flagTemplate).join("") : cleanPanel()}
        </div>
      </section>

      <!-- Knowledge graph -->
      <section class="panel graph-panel">
        <header class="panel__head">
          <h3 class="panel__title">${icon("graph")} Knowledge graph</h3>
          <span class="faint" style="font-size:.71rem">Drag to pan · scroll to zoom · click a node for correlations</span>
        </header>
        <div class="graph-toolbar">
          <select class="select" id="graph-layout" aria-label="Graph layout">
            <option value="cose">Force-directed</option>
            <option value="circle">Radial circle</option>
            <option value="concentric">Concentric (by type)</option>
            <option value="breadthfirst">Hierarchical</option>
            <option value="grid">Grid</option>
          </select>
          <button class="btn btn--ghost btn--sm" id="graph-labels">${icon("eye")} Labels</button>
          <button class="btn btn--ghost btn--sm" id="graph-fit">${icon("target")} Fit</button>
          <button class="btn btn--ghost btn--sm" id="graph-reset">${icon("refresh")} Reset</button>
          <div class="graph-toolbar__sep"></div>
          <span class="faint" style="font-size:.71rem" id="graph-hint">Click a node to trace its connections</span>
        </div>
        <div class="graph-stage" id="graph-stage"></div>
      </section>

      <!-- Path search -->
      ${data.search ? searchTemplate(data.search) : ""}

      <!-- Entities & relations -->
      <section class="panel">
        <header class="panel__head">
          <h3 class="panel__title">${icon("folder")} Extracted evidence</h3>
          <span class="faint" style="font-size:.71rem">${entities.length} entities · ${relations.length} relations</span>
        </header>
        <div class="panel__body">
          <div class="list-toolbar">
            <div class="input-wrap">
              <svg class="input-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="m16 16 4.5 4.5" stroke="currentColor" stroke-width="1.7"/></svg>
              <input class="input" id="entity-search" type="search" placeholder="Filter entities or relations…" />
            </div>
            <div class="type-legend" id="type-legend"></div>
          </div>
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
          <div class="textarea textarea--mono" style="min-height:auto;max-height:260px;overflow:auto;border:none;background:transparent;padding:0">
            ${escapeHtml(textInput.value)}
          </div>
        </div>
      </section>`;

    mountGraph(data, entities, relations);
    wireResultActions(data, caseId);
    animateConfidence();
  }

  function publishGraph(instance) {
    if (window.SentinelACI) window.SentinelACI.setGraph(instance);
  }

  /** Animate the gauge arc and breakdown bars after DOM insertion. */
  function animateConfidence() {
    requestAnimationFrame(() => {
      const arc = results.querySelector(".gauge__fill");
      if (arc) arc.setAttribute("stroke-dashoffset", arc.dataset.target);
      results.querySelectorAll(".bd-row__fill").forEach((bar) => {
        bar.style.width = bar.dataset.width;
      });
    });
  }

  function wirePlaceholder() {
    $("#placeholder-sample", results)?.addEventListener("click", loadSample);
  }

  function mountGraph(data, entities, relations) {
    const stage = $("#graph-stage", results);
    if (!stage) return;

    graph = new KnowledgeGraph(stage, {
      onSelect: (nodeData) => {
        const hint = $("#graph-hint", results);
        if (hint) {
          hint.textContent = nodeData
            ? `${nodeData.label} · ${nodeData.type}`
            : "Click a node to trace its connections";
        }
      },
    });
    publishGraph(graph);

    const prefs = getPrefs();
    graph.options.layout = prefs.defaultLayout || "cose";
    graph.render(data.graph, data.stats);

    // Toolbar
    const layoutSelect = $("#graph-layout", results);
    layoutSelect.value = graph.options.layout;
    layoutSelect.addEventListener("change", (e) => {
      graph.setLayout(e.target.value);
      setPrefs({ defaultLayout: e.target.value });
    });

    $("#graph-fit", results).addEventListener("click", () => graph.fit());
    $("#graph-reset", results).addEventListener("click", () => {
      graph.reset();
      toast("Graph view reset.", { type: "info" });
    });

    const labelsBtn = $("#graph-labels", results);
    labelsBtn.addEventListener("click", () => {
      const on = graph.toggleLabels();
      setPrefs({ showEdgeLabels: on });
      labelsBtn.innerHTML = `${icon("eye")} ${on ? "Labels on" : "Labels off"}`;
    });

    // Entity type filter chips -> also filter the graph
    const legend = $("#type-legend", results);
    legend.innerHTML = TYPE_ORDER.map((type) => {
      const count = entities.filter((e) => e.type === type).length;
      if (!count) return "";
      return `<button class="type-chip" data-type="${type}">
                <i style="background:${nodeColor(type)}"></i>${escapeHtml(type)} <em>${count}</em>
              </button>`;
    }).join("");

    $$(".type-chip", legend).forEach((chip) => {
      chip.addEventListener("click", () => {
        const type = chip.dataset.type;
        const isActive = chip.classList.toggle("is-active");
        graph.cy.nodes().forEach((n) => {
          const match = n.data("type") === type;
          n.style("display", isActive && !match ? "none" : "element");
        });
        graph.cy.edges().style("display", isActive ? "element" : "element");
        graph.fit();
      });
    });

    // Entity list search + graph linking
    const searchInput = $("#entity-search", results);
    let debounce;
    searchInput.addEventListener("input", () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => {
        const q = searchInput.value.trim().toLowerCase();
        $("#entity-list", results).innerHTML = entityTemplate(entities, q);
        $("#relation-list", results).innerHTML = relationTemplate(relations, q);
        wireEntityCards();
      }, 150);
    });

    wireEntityCards();

    // Path highlight buttons inside algorithm cards
    $$("[data-highlight]", results).forEach((btn) => {
      btn.addEventListener("click", () => {
        const [algo, index] = btn.dataset.highlight.split("|");
        const entry = data.search?.[algo];
        const path = entry?.path || [];
        const ok = graph.highlightPath(path);
        toast(
          ok
            ? `${algo} path highlighted across ${path.length} nodes.`
            : `${algo} produced no path to display.`,
          { type: ok ? "info" : "warn" }
        );
        stage.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    });
  }

  function wireEntityCards() {
    $$(".entity", results).forEach((card) => {
      card.addEventListener("click", () => {
        const name = card.dataset.name;
        const ok = graph?.focusNode(name);
        if (ok) {
          const stage = $("#graph-stage", results);
          stage?.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          toast(`"${name}" is not present in the current graph.`, { type: "warn" });
        }
      });
    });
  }

  function wireResultActions(data, caseId) {
    $("#copy-json", results)?.addEventListener("click", () =>
      copyText(JSON.stringify(data, null, 2), "Analysis JSON copied to clipboard.")
    );

    $("#copy-narrative", results)?.addEventListener("click", () =>
      copyText(textInput.value, "Narrative copied to clipboard.")
    );

    $("#gen-pdf", results)?.addEventListener("click", (evt) => {
      const url = reportUrl(data.pdf_path);
      if (!url) {
        toast(
          data.pdf_path?.startsWith("PDF generation failed")
            ? data.pdf_path
            : "No PDF report was generated for this run.",
          { type: "danger", title: "Report unavailable" }
        );
        return;
      }
      openPdf(url, evt.currentTarget, caseId);
    });
  }

  updateSuggestions(lastResult?.entities || []);

  return () => {
    if (graph) graph.destroy();
  };
}

/* ------------------------------------------------------------------ *
 * Templates
 * ------------------------------------------------------------------ */

function confidenceTemplate(confidence, pct, tier) {
  const bd = confidence.breakdown || {};
  const prior = Number(bd.prior || 0);
  const ent = Number(bd.entities || 0);
  const rel = Number(bd.relations || 0);
  const pen = Number(bd.contradiction_penalty || 0);

  // Circumference for a 176px-diameter circle with 12px stroke.
  const R = 76;
  const C = 2 * Math.PI * R;
  const offset = C - (pct / 100) * C;

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
          <circle class="gauge__track" cx="88" cy="88" r="${R}"></circle>
          <circle class="gauge__fill" cx="88" cy="88" r="${R}"
                  stroke="${tier.color}"
                  stroke-dasharray="${C.toFixed(1)}"
                  stroke-dashoffset="${C.toFixed(1)}"
                  data-target="${offset.toFixed(1)}"></circle>
          <g class="gauge__ticks">
            ${[0.25, 0.5, 0.75].map((p) => {
              const a = p * 2 * Math.PI - Math.PI / 2;
              const r1 = R + 9;
              const r2 = R + 13;
              return `<line x1="${88 + Math.cos(a) * r1}" y1="${88 + Math.sin(a) * r1}"
                           x2="${88 + Math.cos(a) * r2}" y2="${88 + Math.sin(a) * r2}"></line>`;
            }).join("")}
          </g>
        </svg>
        <div class="gauge__center">
          <div class="gauge__value" style="color:${tier.color}">${pct}<sup>%</sup></div>
          <div class="gauge__label">Confidence</div>
          <div class="gauge__verdict" style="color:${tier.color}">${tier.label}</div>
        </div>
      </div>

      <div class="breakdown">
        ${rows.map((r) => {
          const width = Math.min(100, Math.round(r.value * 100));
          const cls = r.sign > 0 ? "is-plus" : r.sign < 0 ? "is-minus" : "is-neutral";
          const prefix = r.sign > 0 ? "+" : r.sign < 0 ? "−" : "";
          return `
            <div class="bd-row">
              <div class="bd-row__label"><i style="background:${r.color}"></i>${escapeHtml(r.label)}</div>
              <div class="bd-row__track">
                <div class="bd-row__fill" style="width:0;background:${r.color}" data-width="${width}%"></div>
              </div>
              <div class="bd-row__value ${cls}">${prefix}${r.value.toFixed(2)}</div>
            </div>`;
        }).join("")}

        <div class="bd-formula">
          score = prior <b>${prior.toFixed(2)}</b> + entities <b>${ent.toFixed(2)}</b>
          + relations <b>${rel.toFixed(2)}</b> − penalty <b>${pen.toFixed(2)}</b><br />
          = <b>${(confidence.score ?? pct / 100).toFixed(2)}</b> clamped to [0.00, 1.00] → <b>${pct}%</b>
        </div>
      </div>
    </div>`;
}

function flagTemplate(flag) {
  const severity = String(flag.severity || "MEDIUM").toUpperCase();
  const sevClass = severity === "HIGH" ? "" : severity === "MEDIUM" ? "flag--medium" : "flag--low";
  const meta = [];

  if (flag.subject) meta.push(`<span>Subject <b>${escapeHtml(flag.subject)}</b></span>`);
  if (flag.locations?.length)
    meta.push(`<span>Locations <b>${escapeHtml(flag.locations.join(", "))}</b></span>`);
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

function cleanPanel() {
  return `<div class="alert alert--ok">
            <span class="alert__icon">${icon("check")}</span>
            <div class="alert__body">
              <div class="alert__title">No contradictions detected</div>
              <div class="muted" style="font-size:.8rem">
                Witness timelines, locations and denial statements are mutually consistent across the supplied narrative.
              </div>
            </div>
          </div>`;
}

function searchTemplate(search) {
  const algorithms = Object.entries(search);
  const best = Math.min(
    ...algorithms
      .map(([, r]) => (r.found ? r.length : Infinity))
      .filter((v) => Number.isFinite(v))
  );

  const algoMeta = {
    BFS: { cls: "algo--bfs", desc: "Breadth-first · fewest hops", note: "Shortest association chain" },
    DFS: { cls: "algo--dfs", desc: "Depth-first · deep chain", note: "Deepest corroboration branch" },
    "A*": { cls: "algo--astar", desc: "A* · confidence-weighted", note: "Prefers high-confidence edges" },
  };

  return `
    <section class="panel">
      <header class="panel__head">
        <h3 class="panel__title">${icon("route")} Investigation path search</h3>
        <span class="faint" style="font-size:.71rem">BFS / DFS / A* comparison</span>
      </header>
      <div class="panel__body">
        <div class="algo-grid">
          ${algorithms
            .map(([name, result]) => {
              const meta = algoMeta[name] || { cls: "", desc: "", note: "" };
              const isBest = result.found && result.length === best && algorithms.filter(([, r]) => r.found).length > 1;
              const path = result.path || [];

              return `
              <article class="algo ${meta.cls}">
                <header class="algo__head">
                  <div class="algo__name">
                    <h4>${escapeHtml(name)}</h4>
                    <em>${escapeHtml(meta.desc)}</em>
                  </div>
                  <span class="badge badge--${result.found ? "completed" : "high"}">${result.found ? "Path found" : "No path"}</span>
                </header>

                <div class="algo__metrics">
                  <div class="algo__metric">
                    <span>Hops</span>
                    <strong class="${result.found ? (isBest ? "is-best" : "") : "is-none"}">${result.found ? result.length : "—"}</strong>
                  </div>
                  <div class="algo__metric">
                    <span>Strategy</span>
                    <strong style="font-size:.78rem">${escapeHtml(meta.note)}</strong>
                  </div>
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
                      : `<span class="faint" style="font-size:.76rem">No connecting path exists between the supplied nodes.</span>`
                  }
                </div>

                <pre class="algo__log">${escapeHtml((result.log || []).join("\n"))}</pre>

                <footer class="algo__foot">
                  ${
                    result.found
                      ? `<button class="btn btn--ghost btn--sm" data-highlight="${escapeHtml(name)}|${escapeHtml(name)}">${icon("graph")} Show on graph</button>`
                      : `<span class="faint" style="font-size:.73rem;padding:6px 0">Nodes may not share a component</span>`
                  }
                </footer>
              </article>`;
            })
            .join("")}
        </div>
      </div>
    </section>`;
}

function entityTemplate(entities, query = "") {
  const list = entities.filter(
    (e) =>
      !query ||
      String(e.text).toLowerCase().includes(query) ||
      String(e.type).toLowerCase().includes(query)
  );

  if (!list.length) {
    return `<div class="empty" style="padding:26px">
              ${icon("folder")}
              <strong>No matching entities</strong>
              <p>Adjust the filter or supply a richer narrative.</p>
            </div>`;
  }

  const grouped = list.reduce((acc, e) => {
    (acc[e.type] = acc[e.type] || []).push(e);
    return acc;
  }, {});

  return TYPE_ORDER.filter((t) => grouped[t]?.length)
    .map((type) => `
      <div style="margin-bottom:14px">
        <div class="label" style="margin-bottom:8px;display:flex;align-items:center;gap:7px">
          <i style="width:8px;height:8px;border-radius:50%;background:${nodeColor(type)};display:block"></i>
          ${escapeHtml(type)} <span class="faint">(${grouped[type].length})</span>
        </div>
        <div class="entity-grid">
          ${grouped[type]
            .map(
              (e) => `
              <div class="entity" data-name="${escapeHtml(e.text)}" title="Locate in graph">
                <span class="entity__dot" style="background:${nodeColor(e.type)}"></span>
                <div class="entity__text">
                  <div class="entity__name">${escapeHtml(e.text)}</div>
                  <div class="entity__type">${escapeHtml(e.id || e.type)}</div>
                </div>
              </div>`
            )
            .join("")}
        </div>
      </div>`)
    .join("");
}

function relationTemplate(relations, query = "") {
  const list = relations.filter(
    (r) =>
      !query ||
      [r.source, r.target, r.relation, r.reason]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(query))
  );

  if (!list.length) {
    return `<div class="empty" style="padding:24px">
              ${icon("link")}
              <strong>No relationships extracted</strong>
              <p>No pairwise associations were derived from the narrative.</p>
            </div>`;
  }

  return `<table class="table">
    <thead>
      <tr>
        <th>Source</th><th>Relation</th><th>Target</th>
        <th class="right">Confidence</th><th>Basis</th>
      </tr>
    </thead>
    <tbody>
      ${list
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

function placeholderPanel() {
  return `
    <section class="panel">
      <div class="panel__body">
        <div class="empty" style="padding:70px 24px">
          ${icon("target")}
          <strong>Awaiting case narrative</strong>
          <p>
            Compose the narrative in the intake panel, optionally set a start and target node,
            then run the analysis. The engine returns entities, a knowledge graph, a confidence
            score, contradiction flags and a PDF report.
          </p>
          <button class="btn btn--ghost btn--sm" id="placeholder-sample" style="margin-top:8px">
            ${icon("download")} Load the sample case
          </button>
        </div>
      </div>
    </section>`;
}

function loadingPanel() {
  return `
    <section class="panel">
      <header class="panel__head"><h3 class="panel__title">${icon("chart")} Analysis in progress</h3></header>
      <div class="panel__body">
        <div class="row" style="gap:11px;margin-bottom:18px">
          <span class="spin" style="width:16px;height:16px;border:2px solid var(--line-strong);border-top-color:var(--accent);border-radius:50%;animation:spin .7s linear infinite"></span>
          <span class="soft" style="font-size:.85rem">Running NLP extraction, graph construction and confidence scoring…</span>
        </div>
        ${["Confidence meter", "Knowledge graph", "Path comparison"]
          .map(
            (label) => `
          <div style="margin-bottom:14px">
            <div class="label" style="margin-bottom:6px">${label}</div>
            <div class="skeleton" style="height:${label === "Knowledge graph" ? 180 : 74}px"></div>
          </div>`
          )
          .join("")}
      </div>
    </section>`;
}

function errorPanel(message) {
  return `
    <section class="panel">
      <div class="panel__body">
        <div class="alert alert--danger">
          <span class="alert__icon">${icon("alert")}</span>
          <div class="alert__body">
            <div class="alert__title">Analysis failed</div>
            <div class="muted" style="font-size:.82rem">${escapeHtml(message)}</div>
            <p class="faint" style="font-size:.75rem;margin-top:8px">
              Verify the backend is running and reachable at the configured base URL, then retry.
            </p>
          </div>
        </div>
      </div>
    </section>`;
}

/* ------------------------------------------------------------------ *
 * PDF handling
 * ------------------------------------------------------------------ */

async function openPdf(url, button, caseId) {
  setBusy(button, true, "Opening…");
  try {
    // Verify the report is actually served before opening a new tab.
    const res = await fetch(url, { method: "HEAD" }).catch(() => null);
    if (res && !res.ok) throw new Error(`Report not available (HTTP ${res.status})`);

    const opened = window.open(url, "_blank", "noopener");
    if (!opened) {
      await copyText(url, "Report URL copied — pop-up blocked, paste into a new tab.");
    } else {
      toast(`PDF report for case ${caseId} opened in a new tab.`, {
        type: "ok",
        title: "Report generated",
      });
    }
  } catch (err) {
    toast(
      `${err.message}. The report is written by the backend to the reports/ directory.`,
      { type: "danger", title: "Report unavailable" }
    );
  } finally {
    setBusy(button, false, "Generate PDF Report");
  }
}

/** Rehydrate the /analyze response shape from a stored case record. */
function buildResultFromCase(record) {
  return {
    case_id: record.id,
    entities: record.entities || [],
    relations: record.relations || [],
    graph: record.graph || { nodes: [], edges: [] },
    stats: record.graphStats || null,
    contradictions: record.contradictions || [],
    confidence: record.confidenceData || { percentage: record.confidence || 0, breakdown: {} },
    search: record.search || null,
    pdf_path: record.pdfPath || null,
    status: "success",
    _rehydratedAt: formatDateTime(record.updatedAt),
  };
}