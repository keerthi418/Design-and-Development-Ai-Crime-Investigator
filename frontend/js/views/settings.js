/**
 * Settings — profile, password change, TOTP two-factor authentication,
 * terminal preferences and session information.
 */

import {
  getProfile,
  getSession,
  getPrefs,
  setPrefs,
  getSettings,
  setSettings,
} from "../store.js";
import {
  escapeHtml,
  initials,
  formatDateTime,
  icon,
  toast,
  copyText,
  closeModal,
  openModal,
  $,
  $$,
} from "../ui.js";
import { TOTP, generateSecret } from "../totp.js";

const TABS = [
  { id: "profile", label: "Profile", icon: "user" },
  { id: "security", label: "Security", icon: "lock" },
  { id: "twofactor", label: "Two-Factor Auth", icon: "shield" },
  { id: "preferences", label: "Preferences", icon: "chart" },
  { id: "session", label: "Session", icon: "clock" },
];

export function renderSettings({ navigate }) {
  const profile = getProfile();
  const session = getSession();
  const settings = getSettings();
  const prefs = getPrefs();

  const initial = (location.hash.split("/")[2] || "profile").split("?")[0];
  let active = TABS.some((t) => t.id === initial) ? initial : "profile";

  const root = $("#view-root");
  root.innerHTML = `
    <div class="page">
      <header class="page__head">
        <div>
          <p class="eyebrow">Account</p>
          <h2 style="font-size:1.2rem;margin-top:4px">Settings</h2>
          <p>Manage your officer profile, credentials and terminal preferences.</p>
        </div>
      </header>

      <div class="settings-grid">
        <nav class="settings-nav" id="settings-nav">
          ${TABS.map(
            (t) => `<a href="#/settings/${t.id}" data-tab="${t.id}">${icon(t.icon)}${t.label}</a>`
          ).join("")}
        </nav>
        <div id="settings-body"></div>
      </div>
    </div>`;

  const body = $("#settings-body", root);
  rerender = draw;

  function draw() {
    $$(".settings-nav a", root).forEach((a) =>
      a.classList.toggle("is-active", a.dataset.tab === active)
    );
    history.replaceState(null, "", `#/settings/${active}`);
    // Re-read persisted state so mutations (2FA, password) are reflected immediately.
    const current = getSettings();
    body.innerHTML = "";
    body.appendChild(section(active, profile, session, current, prefs));
    wire(active);
  }

  $$(".settings-nav a", root).forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      active = a.dataset.tab;
      draw();
    })
  );

  draw();
  return () => clearInterval(timers.totp);
}

const timers = { totp: null };

function section(active, profile, session, settings, prefs) {
  switch (active) {
    case "security":
      return securitySection();
    case "twofactor":
      return twoFactorSection(settings);
    case "preferences":
      return preferencesSection(prefs);
    case "session":
      return sessionSection(profile, session);
    default:
      return profileSection(profile, session);
  }
}

function wrap(panel) {
  const node = document.createElement("section");
  node.className = "panel";
  node.innerHTML = panel;
  return node;
}

/* ------------------------------------------------------------------ *
 * Profile
 * ------------------------------------------------------------------ */

function profileSection(profile, session) {
  return wrap(`
    <header class="panel__head"><h3 class="panel__title">${icon("user")} Officer profile</h3></header>
    <div class="panel__body">
      <div class="profile-head">
        <div class="avatar-lg">${escapeHtml(initials(profile.name))}</div>
        <div class="grow">
          <h3>${escapeHtml(profile.name)}</h3>
          <p>${escapeHtml(profile.rank)} · ${escapeHtml(profile.precinct)}</p>
          <div class="row" style="gap:7px;margin-top:8px">
            <span class="badge badge--completed">Active duty</span>
            ${
              session
                ? `<span class="badge badge--${settingsSafe2fa() ? "completed" : "neutral"}">
                     2FA ${settingsSafe2fa() ? "enabled" : "off"}
                   </span>`
                : ""
            }
          </div>
        </div>
        <button class="btn btn--ghost btn--sm" id="edit-profile">${icon("user")} Request amendment</button>
      </div>

      <dl class="def-list">
        <div><dt>Full name</dt><dd>${escapeHtml(profile.name)}</dd></div>
        <div><dt>Rank / designation</dt><dd>${escapeHtml(profile.rank)}</dd></div>
        <div><dt>Badge / service ID</dt><dd class="mono">${escapeHtml(profile.badgeId)}</dd></div>
        <div><dt>Official email</dt><dd class="mono">${escapeHtml(profile.email)}</dd></div>
        <div><dt>Assigned precinct</dt><dd>${escapeHtml(profile.precinct)}</dd></div>
        <div><dt>Clearance</dt><dd>Level 3 — Case Analysis</dd></div>
      </dl>

      <div class="alert alert--info" style="margin-top:18px">
        <span class="alert__icon">${icon("info")}</span>
        <div class="alert__body">
          <div class="alert__title">Record integrity</div>
          <div class="muted" style="font-size:.8rem">
            Profile attributes are drawn from the personnel registry. Amendments require a
            written request countersigned by your Station House Officer and processed by precinct IT.
          </div>
        </div>
      </div>
    </div>`);
}

function settingsSafe2fa() {
  return getSettings().twoFactorEnabled;
}

function editProfileDialog() {
  const body = document.createElement("div");
  body.innerHTML = `
    <p class="muted" style="font-size:.84rem;margin-bottom:16px">
      Record a formal amendment request. Submission routes to precinct IT for verification.
    </p>
    <div class="field">
      <label class="label" for="amend-field">Field requiring amendment</label>
      <select class="select" id="amend-field">
        <option>Name spelling</option>
        <option>Rank / designation</option>
        <option>Badge / service ID</option>
        <option>Assigned precinct</option>
        <option>Official email</option>
      </select>
    </div>
    <div class="field">
      <label class="label" for="amend-reason">Justification</label>
      <textarea class="textarea" id="amend-reason" style="min-height:110px"
        placeholder="Reference the personnel order or gazette notification authorising this change."></textarea>
    </div>
    <div class="row" style="justify-content:flex-end;gap:9px;margin-top:6px">
      <button class="btn btn--ghost" id="amend-cancel">Cancel</button>
      <button class="btn btn--primary" id="amend-submit">${icon("file")} Submit request</button>
    </div>`;

  openModal({ title: "Request profile amendment", body });

  body.querySelector("#amend-cancel").addEventListener("click", closeModal);
  body.querySelector("#amend-submit").addEventListener("click", () => {
    const reason = body.querySelector("#amend-reason").value.trim();
    if (!reason) {
      toast("Provide a justification for the amendment.", { type: "warn" });
      return;
    }
    closeModal();
    toast("Amendment request logged and forwarded to precinct IT.", {
      type: "ok",
      title: "Request submitted",
    });
  });
}

/* ------------------------------------------------------------------ *
 * Password
 * ------------------------------------------------------------------ */

function securitySection() {
  return wrap(`
    <header class="panel__head"><h3 class="panel__title">${icon("key")} Change password</h3></header>
    <div class="panel__body">
      <form id="pw-form" novalidate>
        <div class="field">
          <label class="label" for="pw-current">Current password</label>
          <input class="input" type="password" id="pw-current" autocomplete="current-password" placeholder="Enter your current password" />
        </div>
        <div class="field">
          <label class="label" for="pw-new">New password</label>
          <input class="input" type="password" id="pw-new" autocomplete="new-password" placeholder="Minimum 10 characters" />
          <div class="strength">
            <div class="strength__track"><div class="strength__fill" id="pw-strength" style="width:0"></div></div>
            <div class="strength__label" id="pw-strength-label">Not yet evaluated</div>
          </div>
        </div>
        <div class="field">
          <label class="label" for="pw-confirm">Confirm new password</label>
          <input class="input" type="password" id="pw-confirm" autocomplete="new-password" placeholder="Re-enter the new password" />
          <p class="field-error" data-error-for="pw"></p>
        </div>
        <div class="row" style="gap:9px;margin-top:6px">
          <button class="btn btn--primary" type="submit" id="pw-submit">${icon("lock")} Update password</button>
          <button class="btn btn--ghost" type="button" id="pw-generate">${icon("refresh")} Suggest strong password</button>
        </div>
      </form>

      <div class="alert alert--warn" style="margin-top:20px">
        <span class="alert__icon">${icon("alert")}</span>
        <div class="alert__body">
          <div class="alert__title">Credential policy</div>
          <div class="muted" style="font-size:.8rem">
            Passwords must be at least 10 characters and combine upper and lower case letters,
            digits and symbols. Passwords are never reused across departmental systems.
            All changes are recorded in the access audit log.
          </div>
        </div>
      </div>
    </div>`);
}

/* ------------------------------------------------------------------ *
 * Two-factor authentication
 * ------------------------------------------------------------------ */

function twoFactorSection(settings) {
  const enabled = settings.twoFactorEnabled;

  const node = wrap(`
    <header class="panel__head">
      <h3 class="panel__title">${icon("shield")} Two-factor authentication</h3>
      <span class="badge badge--${enabled ? "completed" : "neutral"}">${enabled ? "Enabled" : "Disabled"}</span>
    </header>
    <div class="panel__body">
      <div class="two-factor">
        <div class="two-factor__info">
          <strong>Authenticator app (TOTP)</strong>
          <p>
            Require a time-based one-time code from your registered device at every sign-in.
            Codes rotate every 30 seconds and are computed locally — they never leave the device.
          </p>
        </div>
        <label class="switch">
          <input type="checkbox" id="tfa-toggle" ${enabled ? "checked" : ""} />
          <span class="switch__track"></span>
          <span class="nowrap" style="font-size:.82rem;font-weight:600">${enabled ? "Enabled" : "Disabled"}</span>
        </label>
      </div>
      <div id="tfa-panel" style="margin-top:16px"></div>
    </div>`);

  const panel = node.querySelector("#tfa-panel");
  const toggle = node.querySelector("#tfa-toggle");
  const label = node.querySelector(".switch span:last-child");

  toggle.addEventListener("change", () => {
    if (toggle.checked) beginEnrollment(panel, toggle, label);
    else disableTwoFactor(panel, toggle, label);
  });

  if (enabled) {
    panel.innerHTML = `
      <div class="alert alert--ok">
        <span class="alert__icon">${icon("check")}</span>
        <div class="alert__body">
          <div class="alert__title">Two-factor authentication is active</div>
          <div class="muted" style="font-size:.8rem">
            A one-time code is required at sign-in. Recovery codes are issued by precinct IT
            if your registered device is lost.
          </div>
        </div>
      </div>
      <div class="row" style="gap:9px;margin-top:14px;flex-wrap:wrap">
        <button class="btn btn--ghost btn--sm" id="tfa-view-secret">${icon("eye")} View secret</button>
        <button class="btn btn--danger btn--sm" id="tfa-disable">${icon("lock")} Disable 2FA</button>
      </div>`;

    panel.querySelector("#tfa-view-secret").addEventListener("click", () => {
      if (!settings.totpSecret) {
        toast("No secret is stored for this account.", { type: "warn" });
        return;
      }
      const secret = settings.totpSecret;
      const body = document.createElement("div");
      body.innerHTML = `
        <div class="secret-block">
          <span class="label">Authenticator secret</span>
          <div class="secret-code">${escapeHtml(secret)}</div>
          <p class="field-hint">Enter this manually if you need to re-register the device.</p>
          <div class="row" style="gap:8px">
            <button class="btn btn--ghost btn--sm" id="secret-copy">${icon("copy")} Copy secret</button>
            <button class="btn btn--ghost btn--sm" id="secret-close">Close</button>
          </div>
        </div>`;
      openModal({ title: "Two-factor secret", body });
      body.querySelector("#secret-copy").addEventListener("click", () => copyText(secret, "Secret copied."));
      body.querySelector("#secret-close").addEventListener("click", closeModal);
    });

    panel.querySelector("#tfa-disable").addEventListener("click", () => {
      toggle.checked = false;
      disableTwoFactor(panel, toggle, label);
    });
  }

  return node;
}

function beginEnrollment(panel, toggle, label) {
  const secret = generateSecret();
  const uri = TOTP.provisioningUri("Sentinel ACI", getProfile().email, secret);
  const account = getProfile().email;

  panel.innerHTML = `
    <div class="totp-reveal">
      <div class="totp-reveal__grid">
        <div>
          <div class="qr" id="qr-host"></div>
          <p class="field-hint" style="margin-top:9px;max-width:200px">
            Scan with your authenticator app, or enter the secret manually.
          </p>
        </div>
        <div class="secret-block">
          <div>
            <span class="label">Manual entry key</span>
            <div class="secret-code" style="margin-top:6px">
              <span class="grow" id="secret-text">${escapeHtml(secret)}</span>
              <button class="icon-btn" id="secret-copy" aria-label="Copy secret">${icon("copy")}</button>
            </div>
          </div>
          <div>
            <span class="label">Live code preview</span>
            <div class="otp-live" style="margin-top:6px">
              <span id="otp-preview">------</span>
              <div class="otp-ring">
                <svg viewBox="0 0 22 22">
                  <circle cx="11" cy="11" r="9" stroke="var(--bg-overlay)" />
                  <circle id="otp-arc" cx="11" cy="11" r="9" stroke="#22a06b"
                          stroke-dasharray="56.5" stroke-dashoffset="56.5" stroke-linecap="round" />
                </svg>
              </div>
              <span class="faint" style="font-size:.72rem" id="otp-secs">30s</span>
            </div>
          </div>
        </div>
      </div>

      <div class="verify-row">
        <div class="field">
          <label class="label" for="otp-verify">Enter the 6-digit code to confirm</label>
          <input class="input" id="otp-verify" inputmode="numeric" maxlength="6"
                 placeholder="000000" autocomplete="one-time-code" />
        </div>
        <button class="btn btn--primary" id="otp-enable">${icon("shield")} Verify &amp; enable</button>
        <button class="btn btn--ghost" id="otp-cancel">Cancel</button>
      </div>
      <p class="field-hint" style="margin-top:10px">
        Provisioning URI: <span class="mono" style="font-size:.68rem;word-break:break-all">${escapeHtml(uri)}</span>
      </p>
    </div>`;

  renderQr(panel.querySelector("#qr-host"), uri);

  panel.querySelector("#secret-copy").addEventListener("click", (e) => {
    copyText(secret, "Secret copied to clipboard.");
    e.currentTarget.style.color = "var(--ok)";
  });

  const preview = panel.querySelector("#otp-preview");
  const arc = panel.querySelector("#otp-arc");
  const secs = panel.querySelector("#otp-secs");
  const verifyInput = panel.querySelector("#otp-verify");

  const tick = () => {
    const { code, remaining } = TOTP.generate(secret);
    preview.textContent = code;
    const C = 2 * Math.PI * 9;
    arc.setAttribute("stroke-dashoffset", String(C - (remaining / 30) * C));
    secs.textContent = `${remaining}s`;
  };
  tick();
  clearInterval(timers.totp);
  timers.totp = setInterval(tick, 1000);

  panel.querySelector("#otp-cancel").addEventListener("click", () => {
    clearInterval(timers.totp);
    toggle.checked = false;
    label.textContent = "Disabled";
    panel.innerHTML = "";
  });

  panel.querySelector("#otp-enable").addEventListener("click", () => {
    const code = verifyInput.value.replace(/\D/g, "");
    if (code.length !== 6) {
      toast("Enter the complete 6-digit code.", { type: "warn" });
      return;
    }
    if (!TOTP.verify(secret, code)) {
      verifyInput.classList.add("is-invalid");
      toast("Code not recognised. Check your device clock and retry.", {
        type: "danger",
        title: "Verification failed",
      });
      return;
    }

    setSettings({ twoFactorEnabled: true, totpSecret: secret });
    clearInterval(timers.totp);
    toast(`Two-factor authentication enabled for ${account}.`, {
      type: "ok",
      title: "2FA active",
    });
    rerenderSettings();
  });
}

function disableTwoFactor(panel, toggle, label) {
  setSettings({ twoFactorEnabled: false, totpSecret: null });
  clearInterval(timers.totp);
  label.textContent = "Disabled";
  panel.innerHTML = `
    <div class="alert alert--warn">
      <span class="alert__icon">${icon("alert")}</span>
      <div class="alert__body">
        <div class="alert__title">Two-factor authentication disabled</div>
        <div class="muted" style="font-size:.8rem">
          This account now requires password authentication only. The change has been written to
          the access audit log and may require supervisory review.
        </div>
      </div>
    </div>`;
  toast("Two-factor authentication disabled.", { type: "warn" });
  rerenderSettings();
}

/* ------------------------------------------------------------------ *
 * Preferences
 * ------------------------------------------------------------------ */

function preferencesSection(prefs) {
  return wrap(`
    <header class="panel__head"><h3 class="panel__title">${icon("chart")} Terminal preferences</h3></header>
    <div class="panel__body">
      <div class="field">
        <label class="label" for="pref-layout">Default graph layout</label>
        <select class="select" id="pref-layout">
          <option value="cose" ${prefs.defaultLayout === "cose" ? "selected" : ""}>Force-directed (COSE)</option>
          <option value="circle" ${prefs.defaultLayout === "circle" ? "selected" : ""}>Radial circle</option>
          <option value="concentric" ${prefs.defaultLayout === "concentric" ? "selected" : ""}>Concentric by entity type</option>
          <option value="breadthfirst" ${prefs.defaultLayout === "breadthfirst" ? "selected" : ""}>Hierarchical</option>
          <option value="grid" ${prefs.defaultLayout === "grid" ? "selected" : ""}>Grid</option>
        </select>
        <p class="field-hint">Applied to every new knowledge-graph rendering.</p>
      </div>

      <div class="field">
        <label class="label" for="pref-contrast">Interface contrast</label>
        <select class="select" id="pref-contrast">
          <option value="standard" ${prefs.contrast === "standard" ? "selected" : ""}>Standard (dark navy)</option>
          <option value="high" ${prefs.contrast === "high" ? "selected" : ""}>High contrast</option>
        </select>
        <p class="field-hint">High contrast increases text luminance for bright-room review.</p>
      </div>

      <div class="two-factor" style="margin-bottom:12px">
        <div class="two-factor__info">
          <strong>Show edge labels on graphs</strong>
          <p>Display the relationship verb on every link in the knowledge graph.</p>
        </div>
        <label class="switch">
          <input type="checkbox" id="pref-labels" ${prefs.showEdgeLabels !== false ? "checked" : ""} />
          <span class="switch__track"></span>
        </label>
      </div>

      <div class="two-factor">
        <div class="two-factor__info">
          <strong>Auto-save analyses to the case register</strong>
          <p>Persist each completed analysis as a case record on this terminal.</p>
        </div>
        <label class="switch">
          <input type="checkbox" id="pref-autosave" ${prefs.autoSaveCases !== false ? "checked" : ""} />
          <span class="switch__track"></span>
        </label>
      </div>
    </div>`);
}

/* ------------------------------------------------------------------ *
 * Session
 * ------------------------------------------------------------------ */

function sessionSection(profile, session) {
  return wrap(`
    <header class="panel__head"><h3 class="panel__title">${icon("clock")} Active session</h3></header>
    <div class="panel__body">
      <div class="session-row">
        <div class="session-row__info">
          <strong>This terminal</strong>
          <p>${escapeHtml(profile.email)} · signed in ${session ? formatDateTime(session.signedInAt) : "—"}</p>
        </div>
        <span class="badge badge--completed">Current</span>
      </div>
      <div class="session-row">
        <div class="session-row__info">
          <strong>Record retention</strong>
          <p>Case records persist locally until removed by the case owner</p>
        </div>
        <span class="badge badge--neutral">Local storage</span>
      </div>
      <div class="session-row">
        <div class="session-row__info">
          <strong>Session expiry</strong>
          <p>${session && session.expiresAt ? formatDateTime(session.expiresAt) : "—"}</p>
        </div>
        <span class="badge badge--neutral">${session?.persistent ? "7 days" : "12 hours"}</span>
      </div>

      <div class="alert alert--info" style="margin-top:18px">
        <span class="alert__icon">${icon("info")}</span>
        <div class="alert__body">
          <div class="alert__title">Access is monitored</div>
          <div class="muted" style="font-size:.8rem">
            Sign-in, sign-out and credential-change events are recorded against your badge
            number. Terminate the session from the sidebar if this device is shared.
          </div>
        </div>
      </div>
    </div>`);
}

/* ------------------------------------------------------------------ *
 * Wiring
 * ------------------------------------------------------------------ */

let rerender = () => {};

function wire(active) {
  if (active === "profile") {
    $("#edit-profile")?.addEventListener("click", editProfileDialog);
  }

  if (active === "security") wirePassword();
  if (active === "preferences") wirePreferences();
}

function wirePassword() {
  const form = $("#pw-form");
  if (!form) return;

  const current = $("#pw-current");
  const next = $("#pw-new");
  const confirm = $("#pw-confirm");
  const strength = $("#pw-strength");
  const strengthLabel = $("#pw-strength-label");
  const error = form.querySelector("[data-error-for='pw']");

  next.addEventListener("input", () => {
    const result = scorePassword(next.value);
    strength.style.width = `${result.score * 100}%`;
    strength.style.background = result.color;
    strengthLabel.textContent = next.value
      ? `${result.label} — ${next.value.length} characters`
      : "Not yet evaluated";
    strengthLabel.style.color = next.value ? result.color : "";
    confirm.classList.remove("is-invalid");
    error.classList.remove("is-shown");
  });

  $("#pw-generate").addEventListener("click", () => {
    next.value = generatePassword();
    next.dispatchEvent(new Event("input"));
    toast("Strong password generated — store it in a secure password manager.", {
      type: "info",
    });
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    if (current.value.length < 8) return fail("Current password is required.");
    if (next.value.length < 10)
      return fail("New password must be at least 10 characters.");
    if (scorePassword(next.value).score < 0.5)
      return fail("Password is too weak — mix upper case, lower case, digits and symbols.");
    if (next.value !== confirm.value) return fail("New passwords do not match.");

    const btn = $("#pw-submit");
    btn.disabled = true;
    btn.innerHTML = `<span class="spin"></span><span class="btn__label">Updating…</span>`;

    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = `${icon("lock")} <span class="btn__label">Update password</span>`;
      form.reset();
      strength.style.width = "0";
      strengthLabel.textContent = "Not yet evaluated";
      toast("Password updated. Other active sessions have been terminated.", {
        type: "ok",
        title: "Credentials changed",
      });
    }, 900);

    function fail(message) {
      error.textContent = message;
      error.classList.add("is-shown");
      confirm.classList.add("is-invalid");
    }
  });
}

function wirePreferences() {
  const layout = $("#pref-layout");
  if (layout) {
    layout.addEventListener("change", (e) => {
      setPrefs({ defaultLayout: e.target.value });
      toast("Default graph layout updated.", { type: "ok" });
    });
  }

  const contrast = $("#pref-contrast");
  if (contrast) {
    contrast.addEventListener("change", (e) => {
      setPrefs({ contrast: e.target.value });
      document.body.dataset.contrast = e.target.value;
      toast("Interface contrast updated.", { type: "ok" });
    });
  }

  $("#pref-labels")?.addEventListener("change", (e) =>
    setPrefs({ showEdgeLabels: e.target.checked })
  );
  $("#pref-autosave")?.addEventListener("change", (e) =>
    setPrefs({ autoSaveCases: e.target.checked })
  );
}

/* ------------------------------------------------------------------ *
 * Password helpers
 * ------------------------------------------------------------------ */

const SPECIALS = "!@#$%^&*()-_=+[]{};:,.?";

function scorePassword(value) {
  const v = String(value || "");
  if (!v) return { score: 0, label: "Not yet evaluated", color: "var(--line-strong)" };

  let score = 0;
  if (v.length >= 10) score += 0.3;
  if (v.length >= 14) score += 0.15;
  if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score += 0.2;
  if (/\d/.test(v)) score += 0.15;
  if (new RegExp(`[${SPECIALS.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}]`).test(v)) score += 0.2;

  score = Math.min(1, score);

  if (score >= 0.85) return { score, label: "Very strong", color: "#22a06b" };
  if (score >= 0.65) return { score, label: "Strong", color: "#4dc79a" };
  if (score >= 0.45) return { score, label: "Fair", color: "#d99a26" };
  return { score, label: "Weak", color: "#dc4b4b" };
}

function generatePassword() {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = SPECIALS;
  const all = upper + lower + digits + symbols;

  const pick = (set) => set[Math.floor(Math.random() * set.length)];
  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];

  while (chars.length < 16) chars.push(pick(all));

  // Fisher-Yates
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/* ------------------------------------------------------------------ *
 * QR rendering (dependency-free, derived from the provisioning URI)
 * ------------------------------------------------------------------ */

function renderQr(host, uri) {
  if (!host) return;

  // Minimal QR encoder: byte mode, EC level M, auto version up to 10.
  const matrix = QrMatrix.encode(uri);
  const size = matrix.length;
  const cell = 4;
  const quiet = 4;
  const px = size * cell + quiet * 2 * cell;

  const parts = [];
  for (let r = -quiet; r < size + quiet; r += 1) {
    for (let c = -quiet; c < size + quiet; c += 1) {
      const inMatrix = r >= 0 && c >= 0 && r < size && c < size;
      if (inMatrix && matrix[r][c]) parts.push(`M${c + quiet} ${r + quiet}h1v1`);
    }
  }

  host.innerHTML = `<svg viewBox="0 0 ${size + quiet * 2} ${size + quiet * 2}"
                       width="${px}" height="${px}" shape-rendering="crispEdges"
                       role="img" aria-label="Authenticator provisioning QR code">
    <rect width="100%" height="100%" fill="#ffffff"/>
    <path d="${parts.join("")}" fill="#000000"/>
  </svg>`;
}

/**
 * Small QR encoder (byte mode, error-correction M).
 * Supports the payloads produced by TOTP provisioning URIs.
 */
const QrMatrix = (() => {
  const EC_M = 0;
  const EC_BLOCKS = {
    // [ecCodewordsPerBlock, group1Blocks, group2Blocks]
    1: [10, 1, 0],
    2: [16, 1, 0],
    3: [26, 1, 0],
    4: [18, 2, 0],
    5: [24, 2, 0],
    6: [16, 4, 0],
    7: [18, 4, 0],
    8: [22, 2, 2],
    9: [22, 3, 2],
    10: [26, 4, 1],
  };

  function encode(text, options = {}) {
    const bytes = new TextEncoder().encode(text);
    for (let version = 1; version <= 10; version += 1) {
      const capacity = dataCapacity(version);
      if (bytes.length + 2 <= capacity) return build(version, bytes, options);
    }
    throw new Error("Payload too long for the embedded QR encoder");
  }

  function dataCapacity(version) {
    const totalCodewords = totalDataCodewords(version);
    return totalCodewords;
  }

  function totalDataCodewords(version) {
    // Total codewords per version (versions 1-10).
    const total = [26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
    const [ecPerBlock, g1, g2] = EC_BLOCKS[version];
    const blocks = g1 + g2;
    return total[version - 1] - ecPerBlock * blocks;
  }

  function build(version, bytes, options = {}) {
    const bits = [];
    const push = (value, len) => {
      for (let i = len - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
    };

    // Mode indicator (byte = 0100) + length + payload
    push(0b0100, 4);
    push(bytes.length, version < 10 ? 8 : 16);
    for (const byte of bytes) push(byte, 8);

    // Terminator + byte alignment
    const capacityBits = totalDataCodewords(version) * 8;
    for (let i = 0; i < 4 && bits.length < capacityBits; i += 1) bits.push(0);
    while (bits.length % 8 !== 0) bits.push(0);

    // Split into codewords
    const codewords = [];
    for (let i = 0; i < bits.length; i += 8) {
      let byte = 0;
      for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j];
      codewords.push(byte);
    }

    // Pad bytes
    const pads = [0xec, 0x11];
    let padIndex = 0;
    while (codewords.length < totalDataCodewords(version)) {
      codewords.push(pads[padIndex % 2]);
      padIndex += 1;
    }

    // Reed-Solomon EC per block
    const [ecPerBlock, g1, g2] = EC_BLOCKS[version];
    const dataBlocks = [];
    const ecBlocks = [];
    const totalBlocks = g1 + g2;
    // Group 1 holds the short blocks; group 2 holds the long blocks.
    // Only group 2 grows by one codeword, and only when the data does not
    // divide evenly across all blocks.
    const shortLen = Math.floor(codewords.length / totalBlocks);
    const numLongBlocks = codewords.length % totalBlocks;

    let offset = 0;
    for (let b = 0; b < totalBlocks; b += 1) {
      const isLong = b >= g1 && g2 > 0 && numLongBlocks > 0;
      const len = isLong ? shortLen + 1 : shortLen;
      const block = codewords.slice(offset, offset + len);
      offset += len;
      dataBlocks.push(block);
      ecBlocks.push(reedSolomon(block, ecPerBlock));
    }

    // Interleave
    const finalWords = [];
    const maxData = Math.max(...dataBlocks.map((b) => b.length));
    for (let i = 0; i < maxData; i += 1) {
      for (const block of dataBlocks) if (i < block.length) finalWords.push(block[i]);
    }
    for (let i = 0; i < ecPerBlock; i += 1) {
      for (const block of ecBlocks) finalWords.push(block[i]);
    }

    return placeModules(version, finalWords, options);
  }

  function placeModules(version, words, options = {}) {
    const size = version * 4 + 17;
    const matrix = Array.from({ length: size }, () => new Array(size).fill(null));
    const reserved = Array.from({ length: size }, () => new Array(size).fill(false));

    const setFunction = (r, c, value) => {
      if (r < 0 || c < 0 || r >= size || c >= size) return;
      matrix[r][c] = value ? 1 : 0;
      reserved[r][c] = true;
    };

    // Finder patterns + separators
    const finder = (row, col) => {
      for (let r = -1; r <= 7; r += 1) {
        for (let c = -1; c <= 7; c += 1) {
          const rr = row + r;
          const cc = col + c;
          if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
          const on = r >= 0 && r <= 6 && c >= 0 && c <= 6 &&
            (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
          setFunction(rr, cc, on);
        }
      }
    };
    finder(0, 0);
    finder(0, size - 7);
    finder(size - 7, 0);

    // Timing patterns
    for (let i = 8; i < size - 8; i += 1) {
      setFunction(6, i, i % 2 === 0);
      setFunction(i, 6, i % 2 === 0);
    }

    // Alignment patterns (versions >= 2)
    if (version >= 2) {
      const positions =
        version === 1 ? [] :
        [6, ...alignmentPositions(version)].filter((v, i, a) => a.indexOf(v) === i);
      for (const r of positions) {
        for (const c of positions) {
          if ((r === 6 && c === 6) || (r === 6 && c === size - 7) || (r === size - 7 && c === 6)) continue;
          for (let dr = -2; dr <= 2; dr += 1) {
            for (let dc = -2; dc <= 2; dc += 1) {
              const on = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
              setFunction(r + dr, c + dc, on);
            }
          }
        }
      }
    }

    // Dark module
    setFunction(size - 8, 8, 1);

    // Reserve format info areas
    for (let i = 0; i < 9; i += 1) {
      if (i !== 6) { reserved[8][i] = true; reserved[i][8] = true; }
    }
    for (let i = 0; i < 8; i += 1) {
      reserved[8][size - 1 - i] = true;
      reserved[size - 1 - i][8] = true;
    }

    // Version info (version >= 7)
    if (version >= 7) {
      let rem = version;
      for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >> 11) * 0x1f25);
      const bits = (version << 12) | rem;
      for (let i = 0; i < 18; i += 1) {
        const bit = (bits >> i) & 1;
        const r = Math.floor(i / 3);
        const c = (i % 3) + size - 11;
        setFunction(r, c, bit);
        setFunction(c, r, bit);
      }
    }

    // Zig-zag data placement
    let bitIndex = 0;
    const dataBits = [];
    for (const word of words) {
      for (let i = 7; i >= 0; i -= 1) dataBits.push((word >> i) & 1);
    }

    let upward = true;
    for (let col = size - 1; col > 0; col -= 2) {
      if (col === 6) col -= 1; // skip vertical timing column
      for (let i = 0; i < size; i += 1) {
        const row = upward ? size - 1 - i : i;
        for (const c of [col, col - 1]) {
          if (reserved[row][c]) continue;
          matrix[row][c] = bitIndex < dataBits.length ? dataBits[bitIndex] : 0;
          reserved[row][c] = true;
          bitIndex += 1;
        }
      }
      upward = !upward;
    }

    // Select the best mask, then actually apply it to the data modules.
    const mask = Number.isInteger(options.forceMask)
      ? options.forceMask
      : maskFor(version, matrix, reserved, size);
    applyMask(matrix, reserved, size, mask, false);

    // Format information (EC level M = 0b00) records the chosen mask.
    applyFormat(matrix, size, 0, mask);

    return matrix;
  }

  function alignmentPositions(version) {
    const table = {
      2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30],
      6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50],
    };
    return table[version] || [6];
  }

  function maskFor(version, matrix, reserved, size) {
    // Pick the mask with the lowest penalty score.
    let best = 0;
    let bestScore = Infinity;
    for (let m = 0; m < 8; m += 1) {
      const test = applyMask(matrix, reserved, size, m, true);
      const score = penalty(test, size);
      if (score < bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return best;
  }

  function applyMask(matrix, reserved, size, mask, dryRun) {
    const copy = matrix.map((row) => row.slice());
    for (let r = 0; r < size; r += 1) {
      for (let c = 0; c < size; c += 1) {
        if (reserved[r][c]) continue;
        let invert = false;
        switch (mask) {
          case 0: invert = (r + c) % 2 === 0; break;
          case 1: invert = r % 2 === 0; break;
          case 2: invert = c % 3 === 0; break;
          case 3: invert = (r + c) % 3 === 0; break;
          case 4: invert = (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; break;
          case 5: invert = ((r * c) % 2) + ((r * c) % 3) === 0; break;
          case 6: invert = (((r * c) % 2) + ((r * c) % 3)) % 2 === 0; break;
          case 7: invert = (((r + c) % 2) + ((r * c) % 3)) % 2 === 0; break;
          default: break;
        }
        if (invert) copy[r][c] ^= 1;
      }
    }
    if (dryRun) return copy;
    matrix.forEach((row, i) => row.forEach((v, j) => { matrix[i][j] = copy[i][j]; }));
    return matrix;
  }

  function applyFormat(matrix, size, ecLevel, mask) {
    const data = (ecLevel << 3) | mask;
    let rem = data;
    for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;

    for (let i = 0; i <= 5; i += 1) matrix[8][i] = (bits >> i) & 1;
    matrix[8][7] = (bits >> 6) & 1;
    matrix[8][8] = (bits >> 7) & 1;
    matrix[7][8] = (bits >> 8) & 1;
    for (let i = 9; i <= 14; i += 1) matrix[14 - i][8] = (bits >> i) & 1;

    for (let i = 0; i <= 7; i += 1) matrix[size - 1 - i][8] = (bits >> i) & 1;
    for (let i = 8; i <= 14; i += 1) matrix[8][size - 15 + i] = (bits >> i) & 1;
    matrix[size - 8][8] = 1;
  }

  function penalty(m, size) {
    let score = 0;
    // Rule 1: runs of 5+
    for (let i = 0; i < size; i += 1) {
      let runRow = 1;
      let runCol = 1;
      for (let j = 1; j < size; j += 1) {
        runRow = m[i][j] === m[i][j - 1] ? runRow + 1 : 1;
        runCol = m[j][i] === m[j - 1][i] ? runCol + 1 : 1;
        if (runRow >= 5) score += 3 + (runRow - 5);
        if (runCol >= 5) score += 3 + (runCol - 5);
      }
    }
    // Rule 2: 2x2 blocks
    for (let r = 0; r < size - 1; r += 1) {
      for (let c = 0; c < size - 1; c += 1) {
        const v = m[r][c];
        if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
      }
    }
    return score;
  }

  // GF(256) arithmetic for Reed-Solomon
  const EXP = new Array(512);
  const LOG = new Array(256);
  (() => {
    let x = 1;
    for (let i = 0; i < 255; i += 1) {
      EXP[i] = x;
      LOG[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d;
    }
    for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
  })();

  const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

  function reedSolomon(data, ecLen) {
    let gen = [1];
    for (let i = 0; i < ecLen; i += 1) {
      const next = new Array(gen.length + 1).fill(0);
      for (let j = 0; j < gen.length; j += 1) {
        next[j] ^= mul(gen[j], EXP[i]);
        next[j + 1] ^= gen[j];
      }
      gen = next;
    }

    const remainder = new Array(data.length + ecLen).fill(0);
    data.forEach((byte, i) => {
      const factor = byte ^ remainder[i];
      remainder.copyWithin(i, i + 1);
      remainder[remainder.length - 1] = 0;
      for (let j = 0; j < gen.length; j += 1) {
        remainder[i + j] ^= mul(gen[j], factor);
      }
    });

    return remainder.slice(data.length);
  }

  return { encode, EC_M };
})();

export { QrMatrix };

/* ------------------------------------------------------------------ *
 * Re-render hook (set by renderSettings)
 * ------------------------------------------------------------------ */

export function setSettingsRerender(fn) {
  rerender = fn;
}

function rerenderSettings() {
  rerender();
}