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
  const proposalIdeas = {
    classic: { question: "Will you be my person?", message: "I made this little something just to ask you that. I love the way you make ordinary days feel special. ♡", yes: "Yes, absolutely! ♥", theme: "sweet" },
    date: { question: "Will you go on a special date with me?", message: "I would love to make another memory with you. Pick a day, bring your smile, and let me plan something lovely. 🌷", yes: "It is a date! ♥", theme: "playful" },
    relationship: { question: "Will you make this official with me?", message: "You have become someone really special to me. I want to see where this story goes, together, one little moment at a time. 💌", yes: "Let us do this! ♥", theme: "sweet" },
    anniversary: { question: "Shall we make another beautiful memory together?", message: "Every chapter with you is one I want to remember. Here are the moments we have shared and all the ones still waiting for us. ✨", yes: "Always with you! ♥", theme: "midnight" },
    longdistance: { question: "Even miles apart, will you keep choosing us?", message: "The distance is not always easy, but you are worth every call, every countdown, and every mile between us. One day closer to our next hug. 🌙", yes: "Always choosing us ♥", theme: "midnight" },
    custom: { question: "", message: "", yes: "Yes, absolutely! ♥", theme: "sweet" }
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
  function demoProposals() {
    const all = safeJson(demoKey, []);
    const cutoff = Date.now() - 15 * 24 * 60 * 60 * 1000;
    const active = all.filter(p => {
      const created = Date.parse(p.created_at || 0);
      return Number.isFinite(created) && created > cutoff;
    });
    if (active.length !== all.length) {
      const expiredIds = new Set(all.filter(p => !active.includes(p)).map(p => p.id));
      saveDemoProposals(active);
      saveDemoResponses(safeJson(demoResponseKey, []).filter(r => !expiredIds.has(r.proposal_id)));
    }
    return active;
  }
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
    if (!configured) return null;
    if (!window.supabase || !window.supabase.createClient) {
      throw new Error("The publishing service could not load. Refresh the page or check the Supabase script connection.");
    }
    if (client) return client;
    client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    try {
      const result = await client.auth.getSession();
      if (result.error) throw result.error;
      currentUser = result.data && result.data.session ? result.data.session.user : null;
      client.auth.onAuthStateChange((_event, session) => {
        currentUser = session ? session.user : null;
        updateAuthLinks();
      });
      return client;
    } catch (error) {
      client = null;
      throw new Error("Could not connect to the publishing service: " + (error.message || "check your Supabase URL and public key."));
    }
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
    $$("[data-user-email]").forEach(el => { el.textContent = currentUser ? currentUser.email : (configured ? "Not signed in" : "Guest preview"); });
    $$("[data-signout], #signout-button").forEach(el => {
      el.classList.toggle("p-hidden", !configured || !currentUser);
      el.disabled = !configured || !currentUser;
    });
  }
  function setModeNotice() {
    $$("[data-demo-warning]").forEach(el => {
      el.classList.toggle("p-hidden", configured);
      if (!configured) el.textContent = "Preview mode is active: drafts stay in this browser only. To let another person open a real shared proposal, configure Supabase using the setup guide in the repository.";
    });
    $$("[data-live-mode]").forEach(el => { el.textContent = configured ? "Live publishing enabled" : "Local preview mode"; });
  }
  async function requireUser() {
    if (!configured) {
      const file = location.pathname.split("/").pop() || "index.html";
      if (file !== "login.html") location.href = "login.html?setup=required&next=" + encodeURIComponent(file + location.search);
      return null;
    }
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
      const result = await client.from("proposals").select("id,creator_name,recipient_name,question,message,yes_text,theme,status,created_at,question_pages,dodge_no").eq("id", id).eq("status", "published").maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    }
    return demoProposals().find(p => p.id === id && p.status === "published") || null;
  }
  async function createProposal(payload) {
    if (configured) {
      if (!client) await initSupabase();
      if (!client) throw new Error("Publishing is unavailable. Check the Supabase setup in config.js.");
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
  function celebrateYes(root) {
    if (!root) return;
    const card = root.querySelector(".p-card");
    if (!card) return;
    card.classList.add("p-celebration-active");
    const banner = document.createElement("div");
    banner.className = "p-celebration-banner";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    banner.innerHTML = '<span class="p-celebration-sparkle" aria-hidden="true">✦</span><strong>YAY! A little love is in the air! ♥</strong><span>That is a moment worth celebrating.</span>';
    card.insertBefore(banner, card.querySelector(".p-card-top").nextSibling);
    const reducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;
    const layer = document.createElement("div");
    layer.className = "p-celebration-layer";
    layer.setAttribute("aria-hidden", "true");
    const pieces = ["♥", "♡", "✦", "✧", "♥", "✿", "♡", "♥", "✦", "♡", "✧", "♥", "✿", "♡", "♥", "✦", "♡", "♥"];
    pieces.forEach((symbol, index) => {
      const piece = document.createElement("span");
      piece.className = "p-celebration-piece";
      piece.textContent = symbol;
      piece.style.setProperty("--piece-x", (3 + Math.random() * 94) + "%");
      piece.style.setProperty("--piece-delay", (Math.random() * 0.65) + "s");
      piece.style.setProperty("--piece-duration", (1.8 + Math.random() * 1.4) + "s");
      piece.style.setProperty("--piece-size", (13 + Math.random() * 17) + "px");
      layer.appendChild(piece);
    });
    card.appendChild(layer);
    window.setTimeout(() => layer.remove(), 4000);
  }

  function cardMarkup(p) {
    const theme = themes[p.theme] || themes.sweet;
    const greeting = p.recipient_name ? "Hey, " + p.recipient_name + "." : theme.greeting;
    const questionPages = Array.isArray(p.question_pages) ? p.question_pages.slice(0, 3) : [];
    const totalPages = questionPages.length + 2;
    return '<div class="p-card" data-theme="' + escapeText(p.theme || "sweet") + '" data-dodge-no="' + (p.dodge_no ? "true" : "false") + '">' +
      '<div class="p-card-top"><span>A LITTLE MOMENT FOR YOU</span><span>♥</span></div>' +
      '<div class="p-card-art"><span class="p-card-orb"></span><span class="p-card-heart">♥</span></div>' +
      '<p class="p-card-greeting">' + escapeText(greeting) + '</p>' +
      '<section class="p-intro-question-page" data-question-page="0">' +
      '<p class="p-page-count">PAGE 1 OF ' + totalPages + '</p>' +
      '<p class="p-fixed-eyebrow">A NOTE FROM THE HEART</p>' +
      '<h1 class="p-card-question">Before you answer…</h1>' +
      '<p class="p-card-message">Someone made this little page especially for you. Take your time, enjoy each question, and know that every word here was chosen to share a feeling with you. There is no rush and no pressure — just a small moment to read, smile, and be honest with your heart. ♥</p>' +
      '</section>' +
      (questionPages.length ? questionPages.map((page,index) => '<section class="p-extra-question-page" data-question-page="' + (index+1) + '" hidden><p class="p-page-count">PAGE ' + (index+2) + ' OF ' + totalPages + '</p><h2 class="p-card-question">' + escapeText(page.question || "One more little question…") + '</h2><p class="p-card-message">' + escapeText(page.message || "") + '</p></section>').join("") : '') +
      '<section class="p-main-question-page" data-question-page="' + (questionPages.length+1) + '" hidden>' +
      '<p class="p-page-count">PAGE ' + totalPages + ' OF ' + totalPages + '</p>' +
      '<h1 class="p-card-question">' + escapeText(p.question || "Will you be my person?") + '</h1><p class="p-card-message">' + escapeText(p.message || theme.note) + '</p></section>' +
      '<div class="p-page-navigation"><button type="button" class="p-page-back" disabled>← Back</button><button type="button" class="p-page-next">Next →</button></div>' +
      '<div class="p-card-actions" hidden><button class="p-card-yes" id="recipient-yes">' + escapeText(p.yes_text || "Yes, absolutely! ♥") + '</button><button class="p-card-no" id="recipient-no">' + escapeText(theme.no) + '</button></div>' +
      '<p class="p-card-response" id="recipient-feedback" aria-live="polite"></p>' +
      '<div class="p-card-foot"><span>MADE WITH A LITTLE NERVE</span><span>♡ JUST FOR YOU</span></div></div>';
  }
  function initRomanticScene(root) {
    const card = root && root.querySelector(".p-card");
    if (!card || card.dataset.sceneReady === "true") return;
    card.dataset.sceneReady = "true";
    card.classList.add("p-romantic-scene");
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const art = card.querySelector(".p-card-art");
    if (art) {
      const layer = document.createElement("div");
      layer.className = "p-floating-hearts";
      layer.setAttribute("aria-hidden", "true");
      const symbols = ["♥", "♡", "✦", "✧", "♥", "·"];
      for (let i = 0; i < 15; i++) {
        const piece = document.createElement("span");
        piece.className = "p-floating-piece";
        piece.textContent = symbols[i % symbols.length];
        piece.style.setProperty("--x", (5 + Math.random() * 90) + "%");
        piece.style.setProperty("--delay", (-Math.random() * 12) + "s");
        piece.style.setProperty("--duration", (8 + Math.random() * 8) + "s");
        piece.style.setProperty("--size", (10 + Math.random() * 15) + "px");
        layer.appendChild(piece);
      }
      art.appendChild(layer);
    }
    const pages = $$("[data-question-page]", card);
    pages.forEach((page, index) => {
      page.classList.add("p-question-reveal");
      page.style.setProperty("--page-delay", (index * 60) + "ms");
    });
    const yes = $("#recipient-yes", card);
    if (yes) yes.addEventListener("pointerenter", () => card.classList.add("p-yes-hover"));
    if (yes) yes.addEventListener("pointerleave", () => card.classList.remove("p-yes-hover"));
  }

  function initQuestionPages(root) {
    const card = root && root.querySelector(".p-card");
    if (!card) return;
    const pages = $$("[data-question-page]", card);
    if (pages.length <= 1) return;
    const back = $(".p-page-back", card);
    const next = $(".p-page-next", card);
    const actions = $(".p-card-actions", card);
    let current = 0;
    function showPage(index) {
      current = Math.max(0, Math.min(pages.length - 1, index));
      pages.forEach((page, i) => { page.hidden = i !== current; });
      if (back) back.disabled = current === 0;
      if (next) next.hidden = current === pages.length - 1;
      if (actions) actions.hidden = current !== pages.length - 1;
      pages.forEach((page, index) => {
        const counter = $(".p-page-count", page);
        if (counter) counter.textContent = "PAGE " + (index + 1) + " OF " + pages.length;
      });
    }
    if (back) back.addEventListener("click", () => showPage(current - 1));
    if (next) next.addEventListener("click", () => showPage(current + 1));
    showPage(0);
  }

  async function initCreate() {
    const form = $("#create-form");
    if (!form) return;
    try { await initSupabase(); }
    catch (error) { notice(error.message || "Publishing service could not connect.", "error"); }
    setModeNotice();
    updateAuthLinks();
    let userState;
    try { userState = await requireUser(); }
    catch (error) { notice(error.message || "Could not verify your sign-in. Please refresh and try again.", "error"); return; }
    if (!userState) return;
    let theme = query.get("theme") || "sweet";
    if (!themes[theme]) theme = "sweet";
    const pageCount = $("#extra-page-count");
    const pageEditor = $("#extra-pages-editor");
    function renderExtraPageEditors() {
      if (!pageCount || !pageEditor) return;
      const count = Math.max(0, Math.min(3, Number(pageCount.value) || 0));
      const previous = $$(".p-extra-page-editor", pageEditor).map(el => ({ question: $("[data-extra-question]", el).value, message: $("[data-extra-message]", el).value }));
      pageEditor.innerHTML = Array.from({ length: count }, (_, index) => {
        const item = previous[index] || {};
        return '<div class="p-extra-page-editor"><h3>Extra page ' + (index + 2) + '</h3><div class="p-field"><label>Question</label><input data-extra-question maxlength="180" placeholder="What else would you like to ask?" value="' + escapeText(item.question || "") + '"></div><div class="p-field"><label>Message (optional)</label><textarea data-extra-message maxlength="500" rows="2" placeholder="Add a little context…">' + escapeText(item.message || "") + '</textarea></div></div>';
      }).join("");
      pageEditor.querySelectorAll("input,textarea").forEach(el => el.addEventListener("input", renderDraft));
      renderDraft();
    }
    pageCount?.addEventListener("change", renderExtraPageEditors);
    $$("[data-p-theme]").forEach(btn => {
      btn.setAttribute("aria-pressed", String(btn.dataset.pTheme === theme));
      btn.addEventListener("click", () => {
        theme = btn.dataset.pTheme;
        $$("[data-p-theme]").forEach(b => b.setAttribute("aria-pressed", String(b === btn)));
        renderDraft();
      });
    });
    const ideaButtons = $$(".p-idea");
    ideaButtons.forEach(button => button.addEventListener("click", () => {
      const idea = proposalIdeas[button.dataset.idea];
      if (!idea) return;
      $("#question").value = idea.question;
      $("#message").value = idea.message;
      $("#yes-text").value = idea.yes;
      theme = idea.theme;
      $$("[data-p-theme]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.pTheme === theme)));
      ideaButtons.forEach(b => { b.classList.toggle("is-selected", b === button); b.setAttribute("aria-pressed", String(b === button)); });
      renderDraft();
      if (button.dataset.idea === "custom") $("#question").focus();
    }));
    function draft() {
      return {
        creator_name: $("#creator-name").value.trim().slice(0, 60),
        recipient_name: $("#recipient-name").value.trim().slice(0, 60),
        question: $("#question").value.trim().slice(0, 180) || "Will you be my person?",
        message: $("#message").value.trim().slice(0, 1000),
        yes_text: $("#yes-text").value.trim().slice(0, 60) || "Yes, absolutely! ♥",
        theme,
        question_pages: $$(".p-extra-page-editor").slice(0, 3).map(el => ({ question: $("[data-extra-question]", el).value.trim().slice(0, 180), message: $("[data-extra-message]", el).value.trim().slice(0, 500) })),
        dodge_no: Boolean($("#dodge-no") && $("#dodge-no").checked)
      };
    }
    function renderDraft() {
      const d = draft();
      const preview = $("#create-preview");
      preview.innerHTML = cardMarkup({ ...d, status: "published" });
      initRomanticScene(preview);
      initQuestionPages(preview);
      $("#recipient-yes", preview).disabled = true;
      $("#recipient-no", preview).disabled = true;
    }
    form.addEventListener("input", event => {
      if (!event.target.closest("#proposal-ideas")) ideaButtons.forEach(b => { b.classList.remove("is-selected"); b.setAttribute("aria-pressed", "false"); });
      renderDraft();
    });
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const submit = $("#publish-button");
      const payload = draft();
      const missingPage = payload.question_pages.findIndex(page => !page.question);
      if (missingPage !== -1) {
        notice("Please enter a question for extra page " + (missingPage + 2) + " or reduce the number of extra pages.", "error");
        return;
      }
      submit.disabled = true;
      try {
        const id = await createProposal(payload);
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
    try {
      await initSupabase();
      setModeNotice();
      updateAuthLinks();
      const userState = await requireUser();
      if (!userState) return;
      $("#signout-button")?.addEventListener("click", async event => {
        const button = event.currentTarget;
        button.disabled = true;
        try {
          if (client) {
            const result = await client.auth.signOut();
            if (result.error) throw result.error;
          }
          currentUser = null;
          location.href = "index.html";
        } catch (error) {
          button.disabled = false;
          const status = $("#page-status") || root;
          status.textContent = "Could not sign out: " + (error.message || "Please try again.");
          status.classList.remove("p-hidden");
          status.classList.add("p-notice", "error");
        }
      });
      const proposals = await listMyProposals();
      const responses = await listResponses(proposals.map(p => p.id));
      $("#stat-proposals").textContent = String(proposals.length);
      $("#stat-answers").textContent = String(responses.length);
      $("#stat-open").textContent = String(proposals.filter(p => p.status === "published").length);
      const createdId = query.get("created");
      const createdProposal = createdId ? proposals.find(p => p.id === createdId) : null;
      $("#created-link-banner")?.remove();
      if (createdProposal) {
        const link = proposalUrl(createdProposal.id);
        const banner = document.createElement("section");
        banner.id = "created-link-banner";
        banner.className = "p-notice success";
        banner.style.margin = "18px 0";
        const heading = document.createElement("strong");
        heading.textContent = "Your proposal is ready!";
        const description = document.createElement("p");
        description.textContent = "Copy this link to share it with your recipient:";
        const input = document.createElement("input");
        input.id = "created-proposal-url";
        input.readOnly = true;
        input.value = link;
        input.setAttribute("aria-label", "Your proposal link");
        input.style.cssText = "width:100%;max-width:720px;padding:11px;border:1px solid #eedbdc;border-radius:6px;background:white";
        const actions = document.createElement("div");
        actions.className = "p-actions";
        const copy = document.createElement("button");
        copy.type = "button";
        copy.id = "copy-created-link";
        copy.className = "p-button";
        copy.textContent = "Copy proposal link";
        const open = document.createElement("a");
        open.className = "p-button ghost";
        open.href = link;
        open.target = "_blank";
        open.rel = "noopener";
        open.textContent = "Open proposal";
        actions.append(copy, open);
        banner.append(heading, description, input, actions);
        if (!configured) {
          const warning = document.createElement("p");
          warning.className = "p-small";
          warning.textContent = "Preview mode: this link works only in this browser. Configure Supabase to share it across devices.";
          banner.appendChild(warning);
        }
        root.parentNode.insertBefore(banner, root);
        copy.addEventListener("click", async () => {
          try {
            await navigator.clipboard.writeText(link);
            copy.textContent = "Copied!";
          } catch (_) {
            input.focus();
            input.select();
            try {
              if (document.execCommand("copy")) copy.textContent = "Copied!";
              else window.prompt("Copy your proposal link:", link);
            } catch (_) { window.prompt("Copy your proposal link:", link); }
          }
        });
      }
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
    try { await initSupabase(); }
    catch (error) {
      root.innerHTML = '<div class="p-notice error">Could not connect to the publishing service: ' + escapeText(error.message) + '</div>';
      return;
    }
    setModeNotice();
    const id = query.get("id");
    if (!id) { root.innerHTML = '<div class="p-empty"><h3>This link is incomplete.</h3><p>Ask the sender to share their proposal link again.</p></div>'; return; }
    try {
      const proposal = await fetchProposal(id);
      if (!proposal) { root.innerHTML = '<div class="p-empty"><div class="icon">♡</div><h3>This proposal is not available.</h3><p>It may have been deleted or the link may be incorrect.</p></div>'; return; }
      root.innerHTML = cardMarkup(proposal);
      initRomanticScene(root);
      const card = root.querySelector(".p-card");
      initQuestionPages(root);
      const noButton = $("#recipient-no", root);
      if (noButton && card.dataset.dodgeNo === "true") {
        let moves = 0;
        const dodge = () => {
          if (noButton.disabled || moves++ > 12) return;
          noButton.style.transform = "translate(" + Math.round((Math.random()*2-1)*90) + "px," + Math.round((Math.random()*2-1)*55) + "px)";
        };
        noButton.addEventListener("pointerenter", dodge);
        noButton.addEventListener("focus", dodge);
        noButton.addEventListener("touchstart", dodge, { passive: true });
      }
      const handleAnswer = async answer => {
        const feedback = $("#recipient-feedback");
        const buttons = $$(".p-card-actions button", root);
        buttons.forEach(b => b.disabled = true);
        const message = $("#recipient-message") ? $("#recipient-message").value.trim().slice(0, 600) : "";
        const name = $("#responder-name") ? $("#responder-name").value.trim().slice(0, 60) : "";
        try {
          await respondToProposal(id, answer, message, name);
          feedback.textContent = answer === "yes" ? "Your answer has been sent. Thank you for sharing this moment. ♥" : "Your answer has been sent. Thank you for being honest. ♡";
          if (answer === "yes") celebrateYes(root);
          feedback.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } catch (error) {
          feedback.textContent = "We couldn't send your answer yet. " + (error.message || "Please try again.");
          buttons.forEach(b => b.disabled = false);
        }
      };
      const extra = document.createElement("div");
      extra.className = "p-recipient-details";
      extra.innerHTML = '<div class="p-divider"></div><div class="p-field"><label for="responder-name">Your name (optional)</label><input id="responder-name" maxlength="60" autocomplete="name" placeholder="Name to include with your answer"></div><div class="p-field"><label for="recipient-message">Want to say a little more? (optional)</label><textarea id="recipient-message" maxlength="600" rows="3" placeholder="Share a note with your answer..."></textarea></div>';
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
    try {
      await initSupabase();
      setModeNotice();
      const userState = await requireUser();
      if (!userState) return;
    } catch (error) {
      root.innerHTML = '<div class="p-notice error">Could not connect to your account or load replies: ' + escapeText(error.message) + '</div>';
      return;
    }
    root.innerHTML = '<div class="p-loader">Loading your replies…</div>';
    try {
      const proposals = await listMyProposals();
      const wanted = query.get("id");
      const visible = wanted ? proposals.filter(p => p.id === wanted) : proposals;
      if (wanted && !visible.length) {
        root.innerHTML = '<div class="p-empty"><div class="icon">♡</div><h3>We couldn’t find that proposal in this account.</h3><p>Make sure you’re signed in with the account that created the link.</p><a class="p-button ghost" href="dashboard.html">Back to my proposals</a></div>';
        return;
      }
      const responses = await listResponses(visible.map(p => p.id));
      const title = $("#inbox-count");
      if (title) title.textContent = String(responses.length);
      if (!responses.length) {
        root.innerHTML = '<div class="p-empty"><div class="icon">♡</div><h3>No replies just yet.</h3><p>' + (wanted ? 'This proposal has no saved replies yet. Once the recipient submits their answer, it will appear here.' : 'When someone responds to one of your proposals, their answer and optional note will appear here.') + '</p><a class="p-button ghost" href="dashboard.html">Back to dashboard</a>' + (wanted ? ' <a class="p-button" href="' + escapeText(proposalUrl(wanted)) + '" target="_blank" rel="noopener">Open proposal link ↗</a>' : '') + '</div>';
        return;
      }
      root.innerHTML = responses.map(r => {
        const proposal = visible.find(p => p.id === r.proposal_id);
        const yes = r.answer === "yes";
        return '<article class="p-list-item p-reply-card"><div class="p-reply-content"><span class="p-pill ' + (yes ? 'p-pill-yes' : 'p-pill-no') + '">' + (yes ? 'They said YES ♥' : 'They answered honestly ♡') + '</span><h3>' + escapeText(r.recipient_name || proposal?.recipient_name || "Your special person") + '</h3><p class="p-reply-question"><strong>Your question:</strong> ' + escapeText(proposal ? proposal.question : "Your proposal") + '</p><p class="p-reply-meta">Received ' + escapeText(dateLabel(r.created_at)) + '</p>' + (r.message ? '<div class="p-reply-message"><span>THEIR NOTE</span><p>' + escapeText(r.message) + '</p></div>' : '<p class="p-small p-reply-empty-note">They didn’t add an extra note with their answer.</p>') + '</div><div class="p-reply-actions"><a class="p-button ghost" href="proposal.html?id=' + encodeURIComponent(r.proposal_id) + '" target="_blank" rel="noopener">View proposal</a></div></article>';
      }).join("");
    } catch (error) {
      root.innerHTML = '<div class="p-notice error">Could not load replies: ' + escapeText(error.message) + '<br><span class="p-small">If this is a permission error, run the reply-access SQL migration from the repository in your Supabase SQL Editor.</span></div>';
    }
  }
  async function initLogin() {
    const form = $("#login-form");
    if (!form) return;
    try { await initSupabase(); }
    catch (error) { notice(error.message || "Account service could not connect.", "error"); }
    setModeNotice();
    if (!configured) {
      notice("Account publishing is not enabled yet. Add your Supabase project URL and public anon/publishable key to config.js, then run supabase-schema.sql in the Supabase SQL Editor. Sign-in and cross-device sharing cannot work until this setup is complete.", "error");
      const submit = $("#login-submit");
      if (submit) submit.disabled = true;
      const signupButton = $("#signup-mode");
      if (signupButton) signupButton.disabled = true;
    }
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
        let destination = "dashboard.html";
        if (next && !next.startsWith("/") && !next.includes("\\") && !next.includes(":")) {
          try {
            const target = new URL(next, location.href);
            const page = target.pathname.split("/").pop();
            const allowedPages = ["create.html", "dashboard.html", "inbox.html", "proposal.html", "index.html"];
            if (target.origin === location.origin && allowedPages.includes(page)) destination = target.href;
          } catch (_) { /* Keep the safe default destination. */ }
        }
        location.href = destination;
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
      btn.disabled = true;
      try {
        if (client) {
          const result = await client.auth.signOut();
          if (result.error) throw result.error;
        }
        currentUser = null;
        location.href = "index.html";
      } catch (error) {
        btn.disabled = false;
        notice("Could not sign out: " + (error.message || "Please try again."), "error");
      }
    }));
  }
  document.addEventListener("DOMContentLoaded", init);
})();