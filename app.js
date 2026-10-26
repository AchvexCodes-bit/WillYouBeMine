(() => {
  "use strict";

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const overlay = $("#builder");
  const liveCard = $("#live-proposal");
  const toast = $("#toast");
  const fields = {
    yourName: $("#your-name"),
    partnerName: $("#partner-name"),
    question: $("#proposal-question"),
    message: $("#proposal-message"),
    yesText: $("#yes-text"),
    noBehavior: $("#no-behavior")
  };
  const defaults = {
    yourName: "",
    partnerName: "",
    question: "Will you be my person?",
    message: "",
    yesText: "Yes, absolutely! ♥",
    noBehavior: "gentle",
    theme: "sweet"
  };
  const state = { ...defaults, theme: "sweet" };
  let toastTimer;
  let lastFocusedElement = null;
  let noMoves = 0;

  const themeContent = {
    sweet: { greeting: "Hey, you.", note: "I made this little something just to ask you that. ♡", noText: "Maybe later" },
    midnight: { greeting: "Under these stars,", note: "In a universe full of possibilities, I keep choosing you. ✦", noText: "Let me think" },
    playful: { greeting: "Okay, so listen…", note: "This is me being brave and a tiny bit cheesy. No pressure, just heart. ♡", noText: "Not today!" }
  };

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3200);
  }

  function openBuilder(template = null) {
    lastFocusedElement = document.activeElement;
    if (template && themeContent[template]) {
      state.theme = template;
      updateThemeControls();
    }
    overlay.classList.add("open");
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("modal-open");
    renderPreview();
    window.setTimeout(() => fields.partnerName.focus(), 80);
  }

  function closeBuilder() {
    overlay.classList.remove("open");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("modal-open");
    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") lastFocusedElement.focus();
  }

  function getSafeText(value, fallback = "") {
    return typeof value === "string" && value.trim() ? value.trim() : fallback;
  }

  function lineBreaks(value) {
    return value.replace(/\n/g, "<br>");
  }

  function escapeHTML(value) {
    return value.replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function setQuestionMarkup(question) {
    const escaped = escapeHTML(question);
    const split = escaped.match(/^(.{1,50}?)(?:\s+)(.*)$/);
    $("#live-question").innerHTML = split
      ? `${split[1]}<br><em>${split[2]}</em>`
      : `<em>${escaped}</em>`;
  }

  function renderPreview() {
    state.yourName = fields.yourName.value;
    state.partnerName = fields.partnerName.value;
    state.question = fields.question.value;
    state.message = fields.message.value;
    state.yesText = fields.yesText.value;
    state.noBehavior = fields.noBehavior.value;

    const theme = themeContent[state.theme] || themeContent.sweet;
    liveCard.dataset.theme = state.theme;
    $("#live-greeting").textContent = state.partnerName.trim()
      ? `Hey, ${getSafeText(state.partnerName)}.`
      : theme.greeting;
    setQuestionMarkup(getSafeText(state.question, defaults.question));
    const message = getSafeText(state.message, theme.note);
    $("#live-message").textContent = message;
    $("#live-yes").textContent = getSafeText(state.yesText, defaults.yesText);
    $("#live-no").textContent = theme.noText;
    $("#live-response").textContent = "";
    resetNoButton();
  }

  function updateThemeControls() {
    $$(".theme-option").forEach(button => {
      const selected = button.dataset.theme === state.theme;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  }

  function pickTheme(theme) {
    if (!themeContent[theme]) return;
    state.theme = theme;
    updateThemeControls();
    renderPreview();
  }

  function resetNoButton() {
    const noButton = $("#live-no");
    noButton.style.position = "";
    noButton.style.left = "";
    noButton.style.top = "";
    noButton.style.transform = "";
    noMoves = 0;
  }

  function moveNoButton() {
    const noButton = $("#live-no");
    const container = $(".live-buttons");
    if (state.noBehavior !== "playful" || !container || noMoves > 6) return;
    noMoves++;
    noButton.style.position = "relative";
    noButton.style.transform = `translate(${Math.round(Math.random() * 70 - 35)}px, ${Math.round(Math.random() * 24 - 12)}px)`;
  }

  function celebrate() {
    const existing = $(".celebration", liveCard);
    if (existing) existing.remove();
    const layer = document.createElement("div");
    layer.className = "celebration";
    layer.setAttribute("aria-hidden", "true");
    const symbols = ["♥", "✦", "✧", "♡", "✿"];
    const colors = ["#d96a7e", "#bc8eb6", "#e8b85f", "#ed9a8d", "#9aaf92"];
    for (let i = 0; i < 30; i++) {
      const bit = document.createElement("span");
      bit.textContent = symbols[Math.floor(Math.random() * symbols.length)];
      bit.style.setProperty("--left", `${Math.random() * 100}%`);
      bit.style.setProperty("--fall", `${1.4 + Math.random() * 2.3}s`);
      bit.style.setProperty("--size", `${10 + Math.random() * 15}px`);
      bit.style.setProperty("--color", colors[Math.floor(Math.random() * colors.length)]);
      bit.style.animationDelay = `${Math.random() * 0.45}s`;
      layer.appendChild(bit);
    }
    liveCard.appendChild(layer);
    window.setTimeout(() => layer.remove(), 4300);
  }

  function yesClicked() {
    const partner = getSafeText(fields.partnerName.value);
    const response = partner
      ? `A little moment for ${partner} — here's to your next chapter! ♥`
      : "Here's to a beautiful next chapter! ♥";
    $("#live-response").textContent = response;
    celebrate();
    showToast("Preview celebration! Your proposal draft is still yours to edit.");
  }

  function noClicked() {
    $("#live-response").textContent = "That's okay — every answer deserves room to be honest. ♡";
    if (state.noBehavior === "playful") {
      resetNoButton();
      showToast("A playful preview. The recipient can still choose either answer.");
    }
  }

  function makeShareFile() {
    const payload = {
      version: 1,
      creator: getSafeText(fields.yourName.value),
      recipient: getSafeText(fields.partnerName.value),
      question: getSafeText(fields.question.value, defaults.question),
      message: getSafeText(fields.message.value, themeContent[state.theme].note),
      yesText: getSafeText(fields.yesText.value, defaults.yesText),
      theme: state.theme,
      noBehavior: fields.noBehavior.value
    };
    const html = buildStandaloneProposal(payload);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "my-willyoubemine-proposal.html";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    showToast("Your proposal file downloaded. Upload it to a web host to share a public link.");
  }

  function buildStandaloneProposal(data) {
    const serialized = JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#fff8f7"><title>A little question for you ♥</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:22px;background:#fae8e7;color:#533b42;font-family:Georgia,serif}.card{width:min(430px,100%);min-height:500px;padding:25px 25px 18px;background:#fffaf7;border:1px solid #f1dfdc;box-shadow:0 25px 80px #643e451c;text-align:center;position:relative;overflow:hidden;display:flex;flex-direction:column;align-items:center}.top,.bottom{width:100%;display:flex;justify-content:space-between;color:#cf6679;letter-spacing:.12em;font:700 8px Arial,sans-serif}.art{height:160px;display:grid;place-items:center;position:relative;width:100%}.orb{position:absolute;width:130px;height:130px;border-radius:50%;background:#f5dedb}.heart{position:relative;font-size:70px;color:#cf6679;text-shadow:5px 6px 0 #d96a7e2a;animation:pulse 2s infinite}.greeting{color:#cf6679;font-style:italic;font-size:17px;margin:0 0 8px}.question{font-size:clamp(28px,8vw,38px);font-weight:500;line-height:1.12;margin:0;overflow-wrap:anywhere}.message{font-size:14px;line-height:1.7;white-space:pre-line;max-width:310px;margin:18px 0}.actions{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin:3px 0 10px}.actions button{padding:12px 15px;border-radius:4px;font-size:12px;font-weight:bold;cursor:pointer}.yes{background:#cf6679;color:white;border:1px solid #cf6679}.no{background:transparent;color:#533b42;border:1px solid #e8d4d6}.response{min-height:22px;color:#cf6679;font-size:14px;font-style:italic}.bottom{margin-top:auto;padding-top:15px;border-top:1px solid #f1dfdc;color:#a4888e;font-size:7px}.night{background:#28263f;color:#f6eaf0}.night .card{background:#302d49;color:#f6eaf0;border-color:#494460}.night .orb{background:#47405f}.night .yes{background:#b794c5;border-color:#b794c5}.night .no{color:#f6eaf0;border-color:#77708d}.night .greeting,.night .heart,.night .top{color:#d7a8dd}.night .bottom{border-color:#514a68;color:#b8abc8}.playful{background:#f6e8bd;color:#694638}.playful .card{background:#fff3cf;border-color:#eee0ac}.playful .orb{background:#f6e4a8}.playful .yes{background:#cb666b;border-color:#cb666b}.playful .greeting,.playful .heart,.playful .top{color:#cb666b}.bottom{padding-bottom:3px}@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.1)}}.confetti{position:absolute;inset:0;pointer-events:none}.confetti i{position:absolute;top:-15px;left:var(--x);font-style:normal;color:var(--c);animation:fall var(--t) linear forwards}@keyframes fall{to{transform:translateY(550px) rotate(340deg);opacity:0}}@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important}}\
</style></head><body><main class="card" id="card"><div class="top"><span>AN IMPORTANT LITTLE QUESTION</span><span>♥</span></div><div class="art"><span class="orb"></span><span class="heart">♥</span></div><p class="greeting" id="greeting"></p><h1 class="question" id="question"></h1><p class="message" id="message"></p><div class="actions"><button class="yes" id="yes"></button><button class="no" id="no">Maybe later</button></div><p class="response" id="response" aria-live="polite"></p><div class="bottom"><span>MADE WITH A LITTLE NERVE</span><span>♡ JUST FOR YOU</span></div></main><script>
const d=${serialized};const by=id=>document.getElementById(id);const card=by("card");if(d.theme==="midnight")document.body.classList.add("night");if(d.theme==="playful")document.body.classList.add("playful");by("greeting").textContent=d.recipient?"Hey, "+d.recipient+".":({sweet:"Hey, you.",midnight:"Under these stars,",playful:"Okay, so listen…"}[d.theme]||"Hey, you.");by("question").textContent=d.question;by("message").textContent=d.message;by("yes").textContent=d.yesText;by("no").textContent=({sweet:"Maybe later",midnight:"Let me think",playful:"Not today!"}[d.theme]||"Maybe later");by("yes").addEventListener("click",()=>{by("response").textContent=d.recipient?"A little moment for "+d.recipient+" — here's to your next chapter! ♥":"Here's to a beautiful next chapter! ♥";const layer=document.createElement("div");layer.className="confetti";const symbols=["♥","✦","✧","♡","✿"];const colors=["#d96a7e","#bc8eb6","#e8b85f","#ed9a8d"];for(let i=0;i<30;i++){const b=document.createElement("i");b.textContent=symbols[Math.floor(Math.random()*symbols.length)];b.style.setProperty("--x",Math.random()*100+"%");b.style.setProperty("--t",1.5+Math.random()*2+"s");b.style.setProperty("--c",colors[Math.floor(Math.random()*colors.length)]);layer.appendChild(b)}card.appendChild(layer);setTimeout(()=>layer.remove(),4000)});by("no").addEventListener("click",()=>{by("response").textContent="That's okay — every answer deserves room to be honest. ♡";if(d.noBehavior==="playful"){by("no").animate([{transform:"translateX(0)"},{transform:"translateX(22px)"},{transform:"translateX(-12px)"},{transform:"translateX(0)"}],{duration:400})}});
<\/script></body></html>`;
  }

  function resetForm() {
    Object.entries(fields).forEach(([key, field]) => { field.value = defaults[key] ?? ""; });
    state.theme = "sweet";
    updateThemeControls();
    renderPreview();
    showToast("Fresh start — your proposal has been reset.");
  }

  $$("[data-open-builder]").forEach(button => button.addEventListener("click", () => openBuilder()));
  $$(".template-card").forEach(button => button.addEventListener("click", () => openBuilder(button.dataset.template)));
  $$(".theme-option").forEach(button => button.addEventListener("click", () => pickTheme(button.dataset.theme)));
  Object.values(fields).forEach(field => {
    field.addEventListener("input", renderPreview);
    field.addEventListener("change", renderPreview);
  });
  $(".close-builder").addEventListener("click", closeBuilder);
  overlay.addEventListener("click", event => { if (event.target === overlay) closeBuilder(); });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && overlay.classList.contains("open")) closeBuilder();
  });
  $("#preview-button").addEventListener("click", () => {
    renderPreview();
    $(".preview-wrap").scrollIntoView({ behavior: "smooth", block: "nearest" });
    showToast("Looking lovely! Try the buttons in your live preview.");
  });
  $("#reset-button").addEventListener("click", resetForm);
  $("#live-yes").addEventListener("click", yesClicked);
  $("#live-no").addEventListener("click", noClicked);
  $("#live-no").addEventListener("pointerenter", moveNoButton);
  $("#live-no").addEventListener("focus", moveNoButton);
  $("#year").textContent = new Date().getFullYear();

  const menuToggle = $(".menu-toggle");
  const nav = $(".main-nav");
  menuToggle.addEventListener("click", () => {
    const expanded = menuToggle.getAttribute("aria-expanded") === "true";
    menuToggle.setAttribute("aria-expanded", String(!expanded));
    nav.classList.toggle("open", !expanded);
  });
  $$(".main-nav a").forEach(link => link.addEventListener("click", () => {
    nav.classList.remove("open");
    menuToggle.setAttribute("aria-expanded", "false");
  }));

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    $$(".reveal").forEach((element, index) => {
      element.style.transitionDelay = `${Math.min(index % 3, 2) * 65}ms`;
      observer.observe(element);
    });
  } else {
    $$(".reveal").forEach(element => element.classList.add("is-visible"));
  }

  updateThemeControls();
  renderPreview();
})();