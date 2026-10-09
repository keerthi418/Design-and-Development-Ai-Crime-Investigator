/**
 * Client-side case + session store.
 * Auth is client-side only (demo). Data persists in localStorage so the
 * dashboard, case lists and analysis results survive a reload.
 */

import { analyzeCase, fetchSampleCase } from "./api.js";

const KEYS = {
  session: "sentinel.session",
  cases: "sentinel.cases",
  profile: "sentinel.profile",
  pref: "sentinel.prefs",
  settings: "sentinel.settings",
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn("Persistence failed", key, err);
  }
}

/* ------------------------------------------------------------------ *
 * Status vocabulary
 * ------------------------------------------------------------------ */
export const STATUS = {
  ongoing: "ongoing",
  completed: "completed",
  closed: "closed",
};

export const STATUS_LABEL = {
  ongoing: "Ongoing",
  completed: "Completed",
  closed: "Closed",
};

/* ------------------------------------------------------------------ *
 * Session / auth
 * ------------------------------------------------------------------ */

const DEFAULT_PROFILE = {
  name: "Arjun Mehta",
  rank: "Detective Inspector",
  badgeId: "D/4711",
  precinct: "Central Crime Division",
  email: "officer@civic.gov",
};

export function getProfile() {
  return { ...DEFAULT_PROFILE, ...read(KEYS.profile, {}) };
}

export function getSession() {
  const stored = read(KEYS.session, null);
  if (!stored) return null;
  if (stored.expiresAt && stored.expiresAt < Date.now()) {
    localStorage.removeItem(KEYS.session);
    return null;
  }
  return stored;
}

export function isAuthenticated() {
  return Boolean(getSession());
}

/**
 * Demo credential check. Accepts the seeded account, or any well-formed
 * email with a password of 8+ characters.
 */
export function signIn({ email, password, remember }) {
  const value = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
    throw new Error("Enter a valid official email address.");
  }
  if (String(password || "").length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  const isDemo = value === DEFAULT_PROFILE.email && password === "Badge@2024";
  if (!isDemo && String(password).length < 8) {
    throw new Error("Invalid credentials.");
  }

  const profile = isDemo
    ? { ...DEFAULT_PROFILE }
    : {
        ...DEFAULT_PROFILE,
        email: value,
        name: deriveName(value),
        rank: "Investigating Officer",
      };

  write(KEYS.profile, profile);

  const ttl = remember ? 7 * 24 * 60 * 60 * 1000 : 12 * 60 * 60 * 1000;
  const session = {
    email: profile.email,
    name: profile.name,
    rank: profile.rank,
    badgeId: profile.badgeId,
    signedInAt: Date.now(),
    expiresAt: remember ? Date.now() + ttl : Date.now() + ttl,
    persistent: Boolean(remember),
  };

  if (!remember) {
    // Non-persistent sessions belong to the tab, not the machine.
    try {
      sessionStorage.setItem(KEYS.session, JSON.stringify(session));
    } catch { /* ignore */ }
    write(KEYS.session, session);
  } else {
    write(KEYS.session, session);
  }

  return session;
}

export function signOut() {
  localStorage.removeItem(KEYS.session);
  try {
    sessionStorage.removeItem(KEYS.session);
  } catch { /* ignore */ }
}

function deriveName(email) {
  const local = email.split("@")[0].replace(/[._-]+/g, " ").trim();
  const parts = local.split(/\s+/).filter(Boolean);
  if (!parts.length) return DEFAULT_PROFILE.name;
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

/* ------------------------------------------------------------------ *
 * Preferences & settings
 * ------------------------------------------------------------------ */

export function getPrefs() {
  return {
    autoSaveCases: true,
    defaultLayout: "cose",
    showEdgeLabels: true,
    contrast: "standard",
    ...read(KEYS.pref, {}),
  };
}

export function setPrefs(patch) {
  write(KEYS.pref, { ...getPrefs(), ...patch });
}

export function getSettings() {
  return {
    twoFactorEnabled: false,
    totpSecret: null,
    ...read(KEYS.settings, {}),
  };
}

export function setSettings(patch) {
  const next = { ...getSettings(), ...patch };
  write(KEYS.settings, next);
  return next;
}

/* ------------------------------------------------------------------ *
 * Cases
 * ------------------------------------------------------------------ */

const uid = () =>
  Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 8);

export function getCases() {
  return read(KEYS.cases, []);
}

export function saveCases(cases) {
  write(KEYS.cases, cases);
}

export function getCase(id) {
  return getCases().find((c) => c.id === id) || null;
}

export function buildSummary(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "No narrative supplied.";
  const sentences = clean.split(/(?<=[.!?])\s+/);
  let summary = sentences.slice(0, 2).join(" ").trim();
  if (summary.length > 190) {
    summary = summary.slice(0, 187).replace(/\s+\S*$/, "") + "…";
  }
  return summary;
}

/**
 * Persist an analysis result as a case record.
 * `record` may carry an existing id to update in place.
 */
export function saveAnalysisResult(result, { text, startNode, targetNode, record, title }) {
  const cases = getCases();
  const confidence = result.confidence || {};
  const summary = buildSummary(text);

  const payload = {
    summary,
    confidence: confidence.percentage ?? 0,
    confidenceData: confidence,
    entityCount: (result.entities || []).length,
    relationCount: (result.relations || []).length,
    contradictionCount: (result.contradictions || []).length,
    searchPerformed: Boolean(result.search),
    pdfPath: result.pdf_path || null,
    graphStats: result.stats || null,
    entities: result.entities || [],
    relations: result.relations || [],
    contradictions: result.contradictions || [],
    graph: result.graph || { nodes: [], edges: [] },
    search: result.search || null,
    narrative: text,
    startNode,
    targetNode,
  };

  if (record && record.id) {
    const idx = cases.findIndex((c) => c.id === record.id);
    if (idx !== -1) {
      cases[idx] = {
        ...cases[idx],
        ...payload,
        title: title || cases[idx].title,
        updatedAt: Date.now(),
      };
      saveCases(cases);
      return cases[idx];
    }
  }

  const created = {
    id: (result.case_id || uid()).toString().toUpperCase(),
    title: title || autoTitle(payload.entities, startNode, targetNode),
    status: STATUS.ongoing,
    owner: getProfile().badgeId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...payload,
  };

  cases.unshift(created);
  saveCases(cases);
  return created;
}

function autoTitle(entities, startNode, targetNode) {
  const persons = (entities || [])
    .filter((e) => e.type === "PERSON")
    .map((e) => e.text);
  if (persons.length) {
    const head = persons.slice(0, 2).join(" & ");
    return persons.length > 2 ? `${head} — multi-subject inquiry` : `${head} — subject inquiry`;
  }
  if (startNode && targetNode) return `Linkage: ${startNode} → ${targetNode}`;
  const first = (entities || [])[0];
  return first ? `Investigation centred on ${first.text}` : "Untitled investigation";
}

export function updateCase(id, patch) {
  const cases = getCases();
  const idx = cases.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  cases[idx] = { ...cases[idx], ...patch, updatedAt: Date.now() };
  saveCases(cases);
  return cases[idx];
}

export function deleteCase(id) {
  saveCases(getCases().filter((c) => c.id !== id));
}

export function cycleStatus(id) {
  const order = [STATUS.ongoing, STATUS.completed, STATUS.closed];
  const current = getCase(id);
  if (!current) return null;
  const next = order[(order.indexOf(current.status) + 1) % order.length];
  return updateCase(id, { status: next });
}

/* ------------------------------------------------------------------ *
 * Dashboard metrics
 * ------------------------------------------------------------------ */

export function getMetrics(cases = getCases()) {
  const total = cases.length;
  const ongoing = cases.filter((c) => c.status === STATUS.ongoing).length;
  const completed = cases.filter((c) => c.status === STATUS.completed).length;
  const closed = cases.filter((c) => c.status === STATUS.closed).length;

  const scored = cases.filter((c) => typeof c.confidence === "number");
  const avgConfidence = scored.length
    ? Math.round(scored.reduce((sum, c) => sum + c.confidence, 0) / scored.length)
    : 0;

  const contradictions = cases.reduce((sum, c) => sum + (c.contradictionCount || 0), 0);

  const now = Date.now();
  const week = 7 * 24 * 60 * 60 * 1000;
  const newThisWeek = cases.filter((c) => (c.createdAt || 0) > now - week).length;

  return {
    total,
    ongoing,
    completed,
    closed,
    avgConfidence,
    contradictions,
    newThisWeek,
  };
}

/* ------------------------------------------------------------------ *
 * Convenience passthroughs
 * ------------------------------------------------------------------ */

export { analyzeCase, fetchSampleCase };

/** Populate demo records so the dashboard is not empty on first run. */
export function ensureSeedData() {
  const existing = getCases();
  if (existing.length) return existing;
  const cases = [
    seed({
      id: "CN-24817",
      title: "Arun & Ravi — warehouse district theft",
      status: STATUS.ongoing,
      daysAgo: 1,
      narrative:
        "Arun was seen near the warehouse at 10 PM. A fingerprint was discovered at the warehouse. Witness B claims Arun was downtown at 10 PM.",
      entities: [
        { text: "Arun", type: "PERSON", id: "person:arun" },
        { text: "Warehouse", type: "LOCATION", id: "location:warehouse" },
        { text: "Fingerprint", type: "EVIDENCE", id: "evidence:fingerprint" },
        { text: "10 PM", type: "TIME", id: "time:10_pm" },
      ],
      confidence: 72,
      contradictions: 1,
      start: "Arun",
      target: "Warehouse",
    }),
    seed({
      id: "CN-24790",
      title: "Priya Kumar — financial fraud referral",
      status: STATUS.ongoing,
      daysAgo: 3,
      narrative:
        "Priya was seen at the office at 3 PM. A laptop belonging to Kumar was recovered. Phone records place Kumar in Chennai at 3 PM.",
      entities: [
        { text: "Priya", type: "PERSON", id: "person:priya" },
        { text: "Kumar", type: "PERSON", id: "person:kumar" },
        { text: "Office", type: "LOCATION", id: "location:office" },
        { text: "Laptop", type: "EVIDENCE", id: "evidence:laptop" },
      ],
      confidence: 81,
      contradictions: 0,
      start: "Priya",
      target: "Laptop",
    }),
    seed({
      id: "CN-24611",
      title: "Suresh — vehicle theft, Madurai",
      status: STATUS.completed,
      daysAgo: 9,
      narrative:
        "Suresh was seen in the parking lot at 9 PM. CCTV shows Suresh near the parking lot. A camera was recovered from the parking lot.",
      entities: [
        { text: "Suresh", type: "PERSON", id: "person:suresh" },
        { text: "Parking Lot", type: "LOCATION", id: "location:parking_lot" },
        { text: "Cctv", type: "EVIDENCE", id: "evidence:cctv" },
      ],
      confidence: 88,
      contradictions: 0,
      start: "Suresh",
      target: "Parking Lot",
    }),
    seed({
      id: "CN-24455",
      title: "Meena — server room access breach",
      status: STATUS.closed,
      daysAgo: 21,
      narrative:
        "Meena was in the server room at 2 AM. A document was found in the server room. Rahul denied being in the server room at 2 AM.",
      entities: [
        { text: "Meena", type: "PERSON", id: "person:meena" },
        { text: "Rahul", type: "PERSON", id: "person:rahul" },
        { text: "Server Room", type: "LOCATION", id: "location:server_room" },
        { text: "Document", type: "EVIDENCE", id: "evidence:document" },
      ],
      confidence: 64,
      contradictions: 2,
      start: "Meena",
      target: "Server Room",
    }),
  ];
  saveCases(cases);
  return cases;
}

function seed(cfg) {
  const now = Date.now();
  const created = now - cfg.daysAgo * 24 * 60 * 60 * 1000;

  const nodes = (cfg.entities || []).map((e) => ({
    data: { id: e.text, label: e.text, type: e.type, color: nodeColor(e.type) },
  }));

  const edges = [];
  for (let i = 0; i < (cfg.entities || []).length - 1; i += 1) {
    edges.push({
      data: {
        id: `e${i}`,
        source: cfg.entities[i].text,
        target: cfg.entities[i + 1].text,
        label: i === 0 ? "seen_near" : "linked_to",
        reason: "Derived from the case narrative.",
        confidence: i === 0 ? 0.85 : 0.8,
      },
    });
  }

  return {
    id: cfg.id,
    title: cfg.title,
    status: cfg.status,
    owner: DEFAULT_PROFILE.badgeId,
    createdAt: created,
    updatedAt: created,
    summary: buildSummary(cfg.narrative),
    confidence: cfg.confidence,
    confidenceData: {
      score: cfg.confidence / 100,
      percentage: cfg.confidence,
      breakdown: {
        prior: 0.4,
        entities: 0.16,
        relations: 0.18,
        contradiction_penalty: Math.round(cfg.contradictions * 0.1 * 100) / 100,
      },
    },
    entityCount: (cfg.entities || []).length,
    relationCount: edges.length,
    contradictionCount: cfg.contradictions,
    searchPerformed: Boolean(cfg.start && cfg.target),
    pdfPath: null,
    graphStats: {
      nodes: nodes.length,
      edges: edges.length,
      connected: true,
      components: 1,
    },
    entities: cfg.entities || [],
    relations: edges.map((e) => ({
      source: e.data.source,
      relation: e.data.label,
      target: e.data.target,
      reason: e.data.reason,
      confidence: e.data.confidence,
    })),
    contradictions: buildSeedFlags(cfg),
    graph: { nodes, edges },
    search: buildSeedSearch(cfg),
    narrative: cfg.narrative,
    startNode: cfg.start || "",
    targetNode: cfg.target || "",
  };
}

function buildSeedFlags(cfg) {
  const flags = [];
  for (let i = 0; i < cfg.contradictions; i += 1) {
    flags.push({
      type: i === 0 ? "timeline_conflict" : "denial_vs_evidence",
      subject: (cfg.entities[0] || {}).text || "Unknown",
      message:
        i === 0
          ? `CONTRADICTION FLAGGED: ${(cfg.entities[0] || {}).text || "Subject"} is associated with two separate locations within the same reported timeframe.`
          : "A denial statement was found that may conflict with other evidence.",
      severity: i === 0 ? "HIGH" : "MEDIUM",
    });
  }
  return flags;
}

function buildSeedSearch(cfg) {
  if (!cfg.start || !cfg.target) return null;
  const chain = [cfg.start, ...(cfg.entities || []).map((e) => e.text), cfg.target]
    .filter((v, i, arr) => arr.indexOf(v) === i);
  const make = (path) => ({
    path,
    length: path ? path.length - 1 : null,
    found: Boolean(path),
    log: path
      ? [`Path (${path.length - 1} hops):`, ...path.slice(0, -1).map((n, i) => `  ${n} → ${path[i + 1]}`)]
      : ["No path found."],
  });
  return {
    BFS: make(chain),
    DFS: make([...chain].reverse()),
    "A*": make(chain),
  };
}

export function nodeColor(type) {
  return (
    {
      PERSON: "#dc4b4b",
      LOCATION: "#4aa3c9",
      EVIDENCE: "#8b9bb5",
      TIME: "#d99a26",
      ENTITY: "#9b59d6",
    }[type] || "#9b59d6"
  );
}