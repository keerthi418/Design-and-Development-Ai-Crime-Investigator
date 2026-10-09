/**
 * API layer — thin wrapper around the existing FastAPI endpoints.
 * Only /analyze and /sample are used; no backend logic is duplicated here.
 */

const BASE = "";

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const detail =
      (payload && (payload.detail || payload.message)) ||
      `Request failed (${res.status})`;
    throw new Error(detail);
  }

  return payload;
}

/**
 * POST /analyze
 * Full pipeline: text -> NLP -> graph -> scoring -> contradictions -> PDF.
 */
export function analyzeCase({ text, caseId, startNode, targetNode }) {
  return request("/analyze", {
    method: "POST",
    body: JSON.stringify({
      text,
      case_id: caseId || null,
      start_node: startNode || "",
      target_node: targetNode || "",
    }),
  });
}

/** GET /sample — sample case narrative for the composer. */
export function fetchSampleCase() {
  return request("/sample");
}

/** GET /health */
export async function checkHealth() {
  try {
    const res = await fetch(BASE + "/health");
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Reports are written to ./reports by the backend. Resolve a usable URL for
 * the browser download link. The backend mounts that directory at /reports.
 */
export function reportUrl(pdfPath) {
  if (!pdfPath) return null;
  if (pdfPath.startsWith("PDF generation failed")) return null;
  const file = String(pdfPath).split(/[\\/]/).pop();
  if (!file) return null;
  return `${BASE}/reports/${file}`;
}