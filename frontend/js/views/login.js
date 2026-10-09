/**
 * Login screen — credential entry, demo autofill, session hand-off.
 */

import { signIn, getProfile } from "../store.js";
import { toast, $, escapeHtml } from "../ui.js";

const DEMO_EMAIL = "officer@civic.gov";
const DEMO_PASSWORD = "Badge@2024";

export function renderLogin({ onSuccess }) {
  const screen = $("#login-screen");
  const form = $("#login-form");
  const emailInput = $("#login-email");
  const passInput = $("#login-password");
  const remember = $("#login-remember");
  const submit = $("#login-submit");
  const errorBox = $("#login-error");
  const emailField = emailInput.closest(".field");
  const passField = passInput.closest(".field");

  screen.hidden = false;
  document.body.dataset.view = "login";
  document.title = "Sign in · Sentinel ACI";

  // Clear any previous error state.
  resetErrors();
  emailInput.value = "";
  passInput.value = "";
  remember.checked = false;
  setTimeout(() => emailInput.focus(), 60);

  // Password reveal toggles.
  form.querySelectorAll("[data-reveal]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = document.getElementById(btn.dataset.reveal);
      const show = target.type === "password";
      target.type = show ? "text" : "password";
      btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
      btn.style.color = show ? "var(--accent-hover)" : "";
    });
  });

  const demoBtn = $("#fill-demo");
  demoBtn.addEventListener("click", () => {
    emailInput.value = DEMO_EMAIL;
    passInput.value = DEMO_PASSWORD;
    resetErrors();
    passInput.focus();
  });

  $("#forgot-link").addEventListener("click", (evt) => {
    evt.preventDefault();
    toast(
      `Password reset requests are routed through precinct IT using ${getProfile().badgeId}.`,
      { type: "info", title: "Credential recovery" }
    );
  });

  async function handleSubmit(evt) {
    evt.preventDefault();
    resetErrors();

    const email = emailInput.value.trim();
    const password = passInput.value;

    if (!email) return fieldError(emailField, "Official email is required.");
    if (!password) return fieldError(passField, "Password is required.");

    submit.disabled = true;
    const original = submit.innerHTML;
    submit.innerHTML = `<span class="spin"></span><span class="btn__label">Authenticating…</span>`;

    try {
      const session = signIn({ email, password, remember: remember.checked });
      toast(`Signed in as ${session.rank} ${session.name}.`, {
        type: "ok",
        title: "Authentication successful",
      });
      screen.hidden = true;
      onSuccess(session);
    } catch (err) {
      errorBox.hidden = false;
      errorBox.innerHTML = `<span>!</span><span>${escapeHtml(err.message)}</span>`;
      passInput.value = "";
      passInput.focus();
      if (/email/i.test(err.message)) emailInput.classList.add("is-invalid");
      else passField.classList.add("is-invalid");
    } finally {
      submit.disabled = false;
      submit.innerHTML = original;
    }
  }

  form.addEventListener("submit", handleSubmit);
  [emailInput, passInput].forEach((input) =>
    input.addEventListener("input", () => {
      input.classList.remove("is-invalid");
      const err = input.closest(".field")?.querySelector(".field-error");
      if (err) err.classList.remove("is-shown");
      errorBox.hidden = true;
    })
  );

  return () => {
    form.removeEventListener("submit", handleSubmit);
  };
}

function fieldError(field, message) {
  field.querySelector(".input").classList.add("is-invalid");
  const err = field.querySelector(".field-error");
  if (err) {
    err.textContent = message;
    err.classList.add("is-shown");
  }
}

function resetErrors() {
  document.querySelectorAll(".field-error").forEach((e) => {
    e.classList.remove("is-shown");
    e.textContent = "";
  });
  document.querySelectorAll(".input").forEach((i) => i.classList.remove("is-invalid"));
  const box = $("#login-error");
  if (box) box.hidden = true;
}