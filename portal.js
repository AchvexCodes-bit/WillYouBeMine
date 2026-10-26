(() => {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const config = window.WYBM_CONFIG || {};
  const configured = Boolean(config.supabaseUrl && config.supabaseAnonKey);
  let client = null;
  let currentUser = null;
  const themes = {
    sweet: { greeting: "Hey, you.", note: "I made this little something just to ask you that. ♡", no: "Maybe later" },
    midnight: { greeting: "Under these stars,", note: "In a universe full of possibilities, I keep choosing you. ✦", no: "Let me think" },
    playful: { greeting: "Okay, so listen…", note: "This is me being brave and a tiny bit cheesy. No pressure, just heart. ♡", no: "Not today!" }
  };
  const demoKey = "wybm-demo-proposals-v1";
  const demoResponseKey = "wybm-demo-responses-v1";
  const query = new URLSearchParams(location.search);

  function escapeText(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  }
  function notice(message, kind = "") {
    const el = $("#page-status");
    if (!el) return;
    el.textContent = message;
    el.className = "p-notice" + (kind ? " " + kind : "");
    el.classList.remove("p-hidden");
  }
  function safeJson(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); }
    catch (_) { return fallback; }
  }
  function demoProposals() { return safeJson(demoKey, []); }
  function saveDemoProposals(list) { localStorage.setItem(demoKey, JSON.stringify(list)); }
  function demoResponses() { return safeJson(demoResponseKey, []); }
  function saveDemoResponses(list) { localStorage.setItem(demoResponseKey, JSON.stringify(list)); }
  function makeId() { return (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)); }
  function shortId(id) { return String(id || "").slice(0, 8); }
  function proposalUrl(id) { return new URL("proposal.html?id=" + encodeURIComponent(id), location.href).href; }
  function dateLabel(value) {
    if (!value) return "Just now";
    try { return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }); }
    catch (_) { return value; }
  }
  async function initSupabase() {
    if (!configured || !window.supabase || !window.supabase.createClient) return null;
    client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    const result = await client.auth.getSession();
    currentUser = result.data && result.data.session ? result.data.session.user : null;
    client.auth.onAuthStateChange((_event, session) => {
      currentUser = session ? session.user : null;
      updateAuthLinks();
    });
    return client;
  }
  function updateAuthLinks() {
    $$("[data-auth-link]").forEach(el => {
      if (currentUser) {
        el.textContent = "Dashboard";
        el.href = "dashboard.html";
      } else {
        el.textContent = "Sign in";
        el.href = "login.html";
      }
    });
    $$("[data-user-email]").forEach(el => { el.textContent = currentUser ? currentUser.email : "Guest preview"; });
  }
  function setModeNotice() {
    $$("[data-demo-warning]").forEach(el => {
      el.classList.toggle("p-hidden", configured);
      if (!configured) el.textContent = "Preview mode is active: drafts stay in this browser only. To let another person open a real shared proposal, configure Supabase using the setup guide in the repository.";
    });
    $$("[data-live-mode]").forEach(el => { el.textContent = configured ? "Live publishing enabled" : "Local preview mode"; });
  }
  async function requireUser() {
    if (!configured) return { demo: true };
    await initSupabase();
    if (!currentUser) {
      location.href = "login.html?next=" + encodeURIComponent(location.pathname.split("/").pop() + location.search);
      return null;
    }
    return { user: currentUser };
  }
  async function fetchProposal(id) {
    if (configured) {
      if (!client) await initSupabase();
      const result = await client.from("proposals").select("id,owner_id,creator_name,recipient_name,question,message,yes_text,theme,status,created_at").eq("id", id).eq("status", "published").maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    }
    return demoProposals().find(p => p.id === id && p.status === "published") || null;
  }
  async function createProposal(payload) {
    if (configured) {
      if (!client) await initSupabase();
      if (!currentUser) throw new Error("Please sign in before publishing.");
      const result = await client.from("proposals").insert({ ...payload, owner_id: currentUser.id, status: "published" }).select("id").single();
      if (result.error) throw result.error;
      return result.data.id;
    }
    const id = makeId();
    const list = demoProposals();
    list.unshift({ ...payload, id, owner_id: "demo", status: "published", created_at: new Date().toISOString() });
    saveDemoProposals(list);
    return id;
  }
  async function listMyProposals() {
    if (configured) {
      if (!client) await initSupabase();
      if (!currentUser) return [];
      const result = await client.from("proposals").select("id,creator_name,recipient_name,question,theme,status,created_at").eq("owner_id", currentUser.id).order("created_at", { ascending: false });
      if (result.error) throw result.error;
      return result.data || [];
    }
    return demoProposals();
  }
  async function listResponses(proposalIds) {
    if (!proposalIds.length) return [];
    if (configured) {
      if (!client) await initSupabase();
      const result = await client.from("proposal_responses").select("id,proposal_id,recipient_name,answer,message,created_at").in("proposal_id", proposalIds).order("created_at", { ascending: false });
      if (result.error) throw result.error;
      return result.data || [];
    }
    return demoResponses().filter(r => proposalIds.includes(r.proposal_id));
  }
  async function respondToProposal(id, answer, message, recipientName) {
    const payload = { proposal_id: id, answer, message: message || "", recipient_name: recipientName || "" };
    if (configured) {
      if (!client) await initSupabase();
      const result = await client.from("proposal_responses").insert(payload);
      if (result.error) throw result.error;
      return;
    }
    const list = demoResponses();
    list.unshift({ ...payload, id: makeId(), created_at: new Date().toISOString() });
    saveDemoResponses(list);
  }
  async function deleteProposal(id) {
    if (configured) {
      if (!client) await initSupabase();
      const result = await client.from("proposals").delete().eq("id", id);
      if (result.error) throw result.error;
      return;
    }
    saveDemoProposals(demoProposals().filter(p => p.id !== id));
    saveDemoResponses(demoResponses().filter(r => r.proposal_id !== id));
  }
  function cardMarkup(p) {
    const theme = themes[p.theme] || themes.sweet;
    const greeting = p.recipient_name ? "Hey, " + p.recipient_name + "." : theme.greeting;
    return '<div class="p-card" data-theme="' + escapeText(p.theme || "sweet") + '">' +
      '<div class="p-card-top"><span>AN IMPORTANT LITTLE QUESTION</span><span>♥</span></div>' +
      '<div class="p-card-art"><span class="p-card-orb"></span><span class="p-card-heart">♥</span></div>' +
      '<p class="p-card-greeting">' + escapeText(greeting) + '</p>' +
      '<h1 class="p-card-question">' + escapeText(p.question || "Will you be my person?") + '</h1>' +
      '<p class="p-card-message">' + escapeText(p.message || theme.note) + '</p>' +
      '<div class="p-card-actions"><button class="p-card-yes" id="recipient-yes">' + escapeText(p.yes_text || "Yes, absolutely! ♥") + '</button><button class="p-card-no" id="recipient-no">' + escapeText(theme.no) + '</button></div>' +
      '<p class="p-card-response" id="recipient-feedback" aria-live="polite"></p>' +
      '<div class="p-card-foot"><span>MADE WITH A LITTLE NERVE</span><span>♡ JUST FOR YOU</span></div></div>';
  }
  async function initCreate() {
    const form = $("#create-form");
    if (!form) return;
    await initSupabase();
    setModeNotice();
    updateAuthLinks();
    let theme = query.get("theme") || "sweet";
    if (!themes[theme]) theme = "sweet";
    $$("[data-p-theme]").forEach(btn => {
      btn.setAttribute("aria-pressed", String(btn.dataset.pTheme === theme));
      btn.addEventListener("click", () => {
        theme = btn.dataset.pTheme;
        $$("[data-p-theme]").forEach(b => b.setAttribute("aria-pressed", String(b === btn)));
        renderDraft();
      });
    });
    function draft() {
      return {
        creator_name: $("#creator-name").value.trim().slice(0, 60),
        recipient_name: $("#recipient-name").value.trim().slice(0, 60),
        question: $("#question").value.trim().slice(0, 180) || "Will you be my person?",
        message: $("#message").value.trim().slice(0, 1000),
        yes_text: $("#yes-text").value.trim().slice(0, 60) || "Yes, absolutely! ♥",
        theme
      };
    }
    function renderDraft() {
      const d = draft();
      $("#create-preview").innerHTML = cardMarkup({ ...d, status: "published" });
      $("#recipient-yes").disabled = true;
      $("#recipient-no").disabled = true;
    }
    form.addEventListener("input", renderDraft);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const submit = $("#publish-button");
      submit.disabled = true;
      try {
        const id = await createProposal(draft());
        location.href = "dashboard.html?created=" + encodeURIComponent(id);
      } catch (error) {
        notice(error.message || "Could not publish this proposal.", "error");
      } finally {
        submit.disabled = false;
      }
    });
    renderDraft();
  }
  async function initDashboard() {
    const root = $("#dashboard-list");
    if (!root) return;
    await initSupabase();
    setModeNotice();
    updateAuthLinks();
    const userState = await requireUser();
    if (!userState) return;
    $("#signout-button")?.addEventListener("click", async () => {
      if (client) await client.auth.signOut();
      location.href = "index.html";
    });
    try {
      const proposals = await listMyProposals();
      const responses = await listResponses(proposals.map(p => p.id));
      $("#stat-proposals").textContent = String(proposals.length);
      $("#stat-answers").textContent = String(responses.length);
      $("#stat-open").textContent = String(proposals.filter(p => p.status === "published").length);
      if (!proposals.length) {
        root.innerHTML = '<div class="p-empty"><div class="icon">♡</div><h3>Your story starts here.</h3><p>Create your first proposal and share its unique link with someone special.</p><a class="p-button" href="create.html">Create a proposal ↗</a></div>';
        return;
      }
      root.innerHTML = proposals.map(p => {
        const count = responses.filter(r => r.proposal_id === p.id).length;
        return '<article class="p-list-item"><div><span class="p-pill">' + (count ? count + ' response(s)' : 'Waiting for a response') + '</span><h3>' + escapeText(p.recipient_name || "A special person") + '</h3><p>' + escapeText(p.question) + '<br>Created ' + escapeText(dateLabel(p.created_at)) + '</p></div><div class="p-list-actions"><button class="p-button ghost" data-copy="' + escapeText(p.id) + '">Copy link</button><a class="p-button ghost" href="inbox.html?id=' + encodeURIComponent(p.id) + '">View replies</a><button class="p-button ghost" data-delete="' + escapeText(p.id) + '">Delete</button></div></article>';
      }).join("");
      $$("[data-copy]").forEach(btn => btn.addEventListener("click", async () => {
        const link = proposalUrl(btn.dataset.copy);
        try { await navigator.clipboard.writeText(link); btn.textContent = "Copied!"; }
        catch (_) { window.prompt("Copy your proposal link:", link); }
      }));
      $$("[data-delete]").forEach(btn => btn.addEventListener("click", async () => {
        if (!window.confirm("Delete this proposal and its replies? This cannot be undone.")) return;
        try { await deleteProposal(btn.dataset.delete); location.reload(); }
        catch (error) { alert(error.message || "Could not delete proposal."); }
      }));
    } catch (error) {
      root.innerHTML = '<div class="p-notice error">Could not load your dashboard: ' + escapeText(error.message) + '</div>';
    }
  }
  async function initProposal() {
    const root = $("#proposal-page");
    if (!root) return;
    await initSupabase();
    setModeNotice();
    const id = query.get("id");
    if (!id) { root.innerHTML = '<div class="p-empty"><h3>This link is incomplete.</h3><p>Ask the sender to share their proposal link again.</p></div>'; return; }
    try {
      const proposal = await fetchProposal(id);
      if (!proposal) { root.innerHTML = '<div class="p-empty"><div class="icon">♡</div><h3>This proposal isn't available.</h3><p>It may have been deleted or the link may be incorrect.</p></div>'; return; }
      root.innerHTML = cardMarkup(proposal);
      const handleAnswer = async answer => {
        const feedback = $("#recipient-feedback");
        const buttons = $$(".p-card-actions button", root);
        buttons.forEach(b => b.disabled = true);
        const message = $("#recipient-message") ? $("#recipient-message").value.trim().slice(0, 600) : "";
        const name = $("#responder-name") ? $("#responder-name").value.trim().slice(0, 60) : "";
        try {
          await respondToProposal(id, answer, message, name);
          feedback.textContent = answer === "yes" ? "Your answer has been sent. Thank you for sharing this moment. ♥" : "Your answer has been sent. Thank you for being honest. ♡";
          feedback.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } catch (error) {
          feedback.textContent = "We couldn't send your answer yet. " + (error.message || "Please try again.");
          buttons.forEach(b => b.disabled = false);
        }
      };
      const extra = document.createElement("div");
      extra.className = "p-recipient-details";
      extra.innerHTML = '<div class="p-divider"></div><div class="p-field"><label for="responder-name">Your name (optional)</label><input id="responder-name" maxlength="60" placeholder="What should they call you?"></div><div class="p-field" style="margin-top:12px"><label for="recipient-message">Want to say a little more? (optional)</label><textarea id="recipient-message" maxlength="600" rows="3" placeholder="Share a note with your answer..."></textarea></div>';
      root.querySelector(".p-card").appendChild(extra);
      $("#recipient-yes").addEventListener("click", () => handleAnswer("yes"));
      $("#recipient-no").addEventListener("click", () => handleAnswer("no"));
    } catch (error) {
      root.innerHTML = '<div class="p-notice error">Could not load this proposal. ' + escapeText(error.message) + '</div>';
    }
  }
  async function initInbox() {
    const root = $("#inbox-list");
    if (!root) return;
    await initSupabase();
    setModeNotice();
    const userState = await requireUser();
    if (!userState) return;
    try {
      const proposals = await listMyProposals();
      const wanted = query.get("id");
      const visible = wanted ? proposals.filter(p => p.id === wanted) : proposals;
      const responses = await listResponses(visible.map(p => p.id));
      if (!responses.length) {
        root.innerHTML = '<div class="p-empty"><div class="icon">♡</div><h3>No replies just yet.</h3><p>When someone responds to your proposal, their answer and optional note will appear here.</p><a class="p-button ghost" href="dashboard.html">Back to dashboard</a></div>';
        return;
      }
      root.innerHTML = responses.map(r => {
        const proposal = visible.find(p => p.id === r.proposal_id);
        return '<article class="p-list-item"><div><span class="p-pill">' + (r.answer === "yes" ? "They said YES ♥" : "They answered honestly ♡") + '</span><h3>' + escapeText(r.recipient_name || "Your special person") + '</h3><p>Proposal: ' + escapeText(proposal ? proposal.question : "Your proposal") + '<br>Received ' + escapeText(dateLabel(r.created_at)) + '</p>' + (r.message ? '<p style="margin-top:10px">' + escapeText(r.message) + '</p>' : '') + '</div></article>';
      }).join("");
    } catch (error) {
      root.innerHTML = '<div class="p-notice error">Could not load replies: ' + escapeText(error.message) + '</div>';
    }
  }
  async function initLogin() {
    const form = $("#login-form");
    if (!form) return;
    await initSupabase();
    setModeNotice();
    const signup = $("#signup-mode");
    let mode = query.get("mode") === "signup" ? "signup" : "login";
    function setMode() {
      signup.textContent = mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account";
      $("#login-submit").textContent = mode === "signup" ? "Create account" : "Sign in";
      $("#login-title").textContent = mode === "signup" ? "Make room for a little magic." : "Welcome back.";
    }
    signup.addEventListener("click", () => { mode = mode === "signup" ? "login" : "signup"; setMode(); });
    setMode();
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const email = $("#email").value.trim();
      const password = $("#password").value;
      try {
        if (!configured) {
          notice("Sign-in requires Supabase setup. You can try the local preview, but it cannot share proposals across devices.", "error");
          return;
        }
        await initSupabase();
        let result;
        if (mode === "signup") result = await client.auth.signUp({ email, password });
        else result = await client.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        if (mode === "signup" && !result.data.session) {
          notice("Check your email to confirm your account, then sign in.", "success");
          return;
        }
        const next = query.get("next");
        location.href = next && !next.includes("://") ? next : "dashboard.html";
      } catch (error) { notice(error.message || "Authentication failed.", "error"); }
    });
  }
  async function init() {
    setModeNotice();
    updateAuthLinks();
    if ($("#create-form")) await initCreate();
    if ($("#dashboard-list")) await initDashboard();
    if ($("#proposal-page")) await initProposal();
    if ($("#inbox-list")) await initInbox();
    if ($("#login-form")) await initLogin();
    $$("[data-signout]").forEach(btn => btn.addEventListener("click", async () => {
      if (client) await client.auth.signOut();
      location.href = "index.html";
    }));
  }
  document.addEventListener("DOMContentLoaded", init);
})();