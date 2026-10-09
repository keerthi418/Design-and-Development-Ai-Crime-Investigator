/**
 * Reports — list of generated PDF case reports held on this terminal.
 */

import { getCases } from "../store.js";
import { reportUrl } from "../api.js";
import {
  escapeHtml,
  formatDateTime,
  clampPercent,
  confidenceTier,
  icon,
  toast,
  $, $$,
} from "../ui.js";

export function renderReports({ navigate }) {
  const root = $("#view-root");

  function draw() {
    const cases = getCases();
    const withReports = cases.filter((c) => c.pdfPath && !String(c.pdfPath).startsWith("PDF generation failed"));

    root.innerHTML = `
      <div class="page">
        <header class="page__head">
          <div>
            <p class="eyebrow">Documentation</p>
            <h2 style="font-size:1.2rem;margin-top:4px">Case reports</h2>
            <p>PDF reports produced by the analysis pipeline for each case file on this terminal.</p>
          </div>
          <div class="page__actions">
            <a class="btn btn--ghost" href="#/cases">${icon("folder")} All cases</a>
          </div>
        </header>

        <section class="panel">
          <header class="panel__head">
            <h3 class="panel__title">${icon("pdf")} Generated reports</h3>
            <span class="faint" style="font-size:.71rem">${withReports.length} available</span>
          </header>
          <div class="panel__body panel__body--flush">
            ${
              withReports.length
                ? withReports.map(reportRow).join("")
                : `<div class="empty">
                     ${icon("pdf")}
                     <strong>No reports generated yet</strong>
                     <p>Run an analysis to produce a PDF report. Reports are written by the backend into the <span class="mono">reports/</span> directory.</p>
                     <a class="btn btn--primary btn--sm" href="#/analysis">${icon("plus")} New Investigation</a>
                   </div>`
            }
          </div>
        </section>
      </div>`;

    wire();
  }

  function reportRow(c) {
    const tier = confidenceTier(c.confidence);
    const url = reportUrl(c.pdfPath);
    return `
      <div class="report-row">
        <div class="report-row__icon">${icon("pdf")}</div>
        <div class="report-row__body">
          <div class="report-row__title">${escapeHtml(c.title || "Untitled investigation")}</div>
          <div class="report-row__sub">${escapeHtml(c.id)} · ${escapeHtml(url ? url.split("/").pop() : c.pdfPath)}</div>
          <div class="row" style="gap:8px;margin-top:5px">
            <span class="pill-conf pill-conf--${tier.key}">${clampPercent(c.confidence)}%</span>
            <span class="faint" style="font-size:.71rem">${escapeHtml(formatDateTime(c.updatedAt || c.createdAt))}</span>
          </div>
        </div>
        <div class="report-row__actions">
          <a class="btn btn--ghost btn--sm" href="#/case/${encodeURIComponent(c.id)}">${icon("eye")} Open case</a>
          <button class="btn btn--primary btn--sm" data-report="${escapeHtml(url)}">${icon("download")} Open PDF</button>
        </div>
      </div>`;
  }

  function wire() {
    $$("[data-report]", root).forEach((btn) => {
      btn.addEventListener("click", async () => {
        const url = btn.dataset.report;
        btn.disabled = true;
        const original = btn.innerHTML;
        btn.innerHTML = `<span class="spin"></span><span class="btn__label">Opening…</span>`;
        try {
          const res = await fetch(url, { method: "HEAD" }).catch(() => null);
          if (res && !res.ok) throw new Error(`HTTP ${res.status}`);
          const opened = window.open(url, "_blank", "noopener");
          if (!opened) {
            toast("Pop-up blocked — opening the report URL directly.", { type: "warn" });
            window.location.href = url;
          }
        } catch {
          toast("Report file is not reachable. Confirm the backend reports/ mount is active.", {
            type: "danger",
            title: "Report unavailable",
          });
        } finally {
          btn.disabled = false;
          btn.innerHTML = original;
        }
      });
    });
  }

  draw();
  return () => {};
}