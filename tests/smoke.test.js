const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const js = fs.readFileSync(path.join(root, "app.js"), "utf8");

test("home page loads the main stylesheet and application script", () => {
  assert.match(html, /href="styles\.css"/);
  assert.match(html, /src="app\.js"/);
});

test("builder has fields and a download control", () => {
  for (const id of ["your-name", "partner-name", "proposal-question", "proposal-message", "yes-text", "no-behavior", "download-button", "preview-button", "reset-button"]) {
    assert.ok(html.includes(`id="${id}"`), `missing ${id}`);
  }
});

test("all advertised themes exist in both markup and script", () => {
  for (const theme of ["sweet", "midnight", "playful"]) {
    assert.ok(js.includes(`${theme}:`), `missing theme config ${theme}`);
    assert.ok(js.includes(`${theme}:`), `missing script theme ${theme}`);
  }
  assert.match(html, /data-template="sweet"/);
  assert.match(html, /data-template="midnight"/);
  assert.match(html, /data-template="playful"/);
  assert.match(js, /\$\$\("\.template-card"\)\.forEach/);
  assert.match(js, /\$\$\("\[data-open-builder\]"\)\.forEach/);
  assert.doesNotMatch(js, /(?<!\$)\$\("\[data-open-builder\]"\)\.forEach/);
  assert.doesNotMatch(js, /(?<!\$)\$\("\.template-card"\)\.forEach/);
});

test("core proposal interactions and standalone file export are wired", () => {
  assert.match(js, /addEventListener\("click", yesClicked\)/);
  assert.match(js, /addEventListener\("click", noClicked\)/);
  assert.match(js, /addEventListener\("click", downloadProposal\)/);
  assert.match(js, /buildStandaloneProposal/);
  assert.match(js, /createObjectURL/);
});

test("user-provided question is escaped before preview markup is created", () => {
  assert.match(js, /function escapeHTML/);
  assert.match(js, /setQuestionMarkup\(safeText\(state\.question/);
});

test("responsive and reduced-motion styles are present", () => {
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(css, /:focus-visible/);
});

test("multi-page creator and recipient workflows are present", () => {
  for (const file of ["create.html", "dashboard.html", "proposal.html", "inbox.html", "login.html", "portal.css", "portal.js", "config.js", "supabase-schema.sql"]) {
    assert.ok(fs.existsSync(path.join(root, file)), `missing ${file}`);
  }
  const createPage = fs.readFileSync(path.join(root, "create.html"), "utf8");
  const recipientPage = fs.readFileSync(path.join(root, "proposal.html"), "utf8");
  const dashboardPage = fs.readFileSync(path.join(root, "dashboard.html"), "utf8");
  const inboxPage = fs.readFileSync(path.join(root, "inbox.html"), "utf8");
  assert.match(createPage, /id="create-form"/);
  assert.match(createPage, /id="publish-button"/);
  assert.match(recipientPage, /id="proposal-page"/);
  assert.match(dashboardPage, /id="dashboard-list"/);
  assert.match(inboxPage, /id="inbox-list"/);
});

test("shared response flow and account-scoped database policies are defined", () => {
  const portal = fs.readFileSync(path.join(root, "portal.js"), "utf8");
  const sql = fs.readFileSync(path.join(root, "supabase-schema.sql"), "utf8");
  assert.match(portal, /function createProposal/);
  assert.match(portal, /function respondToProposal/);
  assert.match(portal, /function listResponses/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /Owners can read responses/);
  assert.match(sql, /Anyone can answer published proposals/);
  assert.match(sql, /public\.is_published_proposal\(proposal_id\)/);
});


test("multi-page portal JavaScript parses and preserves publishing/link and auth recovery paths", () => {
  const portal = fs.readFileSync(path.join(root, "portal.js"), "utf8");
  assert.doesNotThrow(() => new vm.Script(portal), "portal.js must be valid JavaScript");
  assert.match(portal, /created-link-banner/);
  assert.match(portal, /copy-created-link/);
  assert.match(portal, /Could not sign out:/);
  assert.match(portal, /This proposal is not available/);
});


test("creator controls use collection selectors instead of single-element selectors", () => {
  const portal = fs.readFileSync(path.join(root, "portal.js"), "utf8");
  assert.doesNotMatch(portal, /(?<!\$)\$\("\[data-p-theme\]"\)\.forEach/);
  assert.doesNotMatch(portal, /(?<!\$)\$\("\.p-extra-page-editor", pageEditor\)\.map/);
  assert.doesNotMatch(portal, /question_pages:\s*(?<!\$)\$\("\.p-extra-page-editor"\)/);
  assert.doesNotMatch(portal, /const pages = (?<!\$)\$\("\.p-main-question-page, \.p-extra-question-page", card\)/);
  assert.doesNotMatch(portal, /(?<!\$)\$\("\.p-page-count", card\)\.forEach/);
});

test("extra pages are capped, validated, persisted, and navigable in preview and recipient view", () => {
  const portal = fs.readFileSync(path.join(root, "portal.js"), "utf8");
  const createPage = fs.readFileSync(path.join(root, "create.html"), "utf8");
  const schema = fs.readFileSync(path.join(root, "supabase-schema.sql"), "utf8");
  assert.match(createPage, /id="extra-page-count"/);
  assert.match(createPage, /option value="3">3 extra question pages \(5 total\)/);
  assert.match(createPage, /id="dodge-no"/);
  assert.match(portal, /Math\.min\(3, Number\(pageCount\.value\)/);
  assert.match(portal, /question_pages:\s*\$\$\("\.p-extra-page-editor"\)\.slice\(0, 3\)/);
  assert.match(portal, /findIndex\(page => !page\.question\)/);
  assert.match(portal, /initQuestionPages\(preview, currentPageIndex\)/);
  assert.match(portal, /initQuestionPages\(root\)/);
  assert.match(schema, /question_pages jsonb not null default '\[\]'::jsonb/i);
  assert.match(schema, /dodge_no boolean not null default false/i);
});

test("recipient page initializes the card before reading optional No-button settings", () => {
  const portal = fs.readFileSync(path.join(root, "portal.js"), "utf8");
  const start = portal.indexOf("async function initProposal");
  const end = portal.indexOf("async function initInbox", start);
  const proposalInit = portal.slice(start, end);
  assert.ok(start >= 0 && end > start, "proposal loader is present");
  const cardDeclaration = proposalInit.indexOf('const card = root.querySelector(".p-card")');
  const dodgeCheck = proposalInit.indexOf("card.dataset.dodgeNo");
  assert.ok(cardDeclaration >= 0, "proposal card is declared");
  assert.ok(dodgeCheck > cardDeclaration, "card is declared before dodge setting is read");
  assert.match(proposalInit, /try \{ await initSupabase\(\); \}/);
});


test("post-login redirects are restricted to same-site pages", () => {
  const portal = fs.readFileSync(path.join(root, "portal.js"), "utf8");
  assert.match(portal, /target\.origin === location\.origin/);
  assert.match(portal, /const allowedPages = \["create\.html", "dashboard\.html", "inbox\.html", "proposal\.html", "index\.html"\]/);
  assert.match(portal, /!next\.startsWith\("\/"\)/);
  assert.match(portal, /!next\.includes\("\\\\"\)/);
  assert.match(portal, /!next\.includes\(":"\)/);
  assert.doesNotMatch(portal, /next && !next\.includes\("\:\/\/"/);
});

test("proposal creator exposes saved greeting, button, palette, typography, and motion options", () => {
  const createPage = fs.readFileSync(path.join(root, "create.html"), "utf8");
  const portal = fs.readFileSync(path.join(root, "portal.js"), "utf8");
  const css = fs.readFileSync(path.join(root, "portal.css"), "utf8");
  for (const id of ["custom-greeting", "no-text", "accent-color", "font-style", "romantic-effects"]) {
    assert.ok(createPage.includes(`id="${id}"`), `missing ${id}`);
  }
  for (const option of ["rose", "lavender", "ocean", "sage", "gold"]) {
    assert.ok(css.includes(`data-accent=${option}`), `missing accent ${option}`);
  }
  assert.match(portal, /custom_options:\s*\{/);
  assert.match(portal, /data-accent=/);
  assert.match(portal, /isMissingCustomOptionsColumn/);
  assert.match(portal, /customization-upgrade-needed/);
  assert.doesNotThrow(() => new vm.Script(portal), "portal.js must parse after customization changes");
});

test("Supabase customization migration is repeatable and keeps older projects publishing", () => {
  const schema = fs.readFileSync(path.join(root, "supabase-schema.sql"), "utf8");
  const migrationPath = path.join(root, "customize-proposals.sql");
  assert.ok(fs.existsSync(migrationPath), "missing customization migration");
  const migration = fs.readFileSync(migrationPath, "utf8");
  assert.match(schema, /custom_options jsonb not null default '\{\}'::jsonb/i);
  assert.match(migration, /add column if not exists custom_options jsonb/i);
  assert.match(migration, /jsonb_typeof\(custom_options\) = 'object'/i);
  const portal = fs.readFileSync(path.join(root, "portal.js"), "utf8");
  assert.match(portal, /legacyPayload/);
  assert.match(portal, /customizationSaved: false/);
});

test("Achvex Ltd website and Instagram links are visible across main pages", () => {
  for (const file of ["index.html", "create.html", "proposal.html", "dashboard.html", "inbox.html", "login.html"]) {
    const content = fs.readFileSync(path.join(root, file), "utf8");
    assert.ok(content.includes("https://achvex-website.vercel.app/"), `missing Achvex website in ${file}`);
    assert.ok(content.includes("https://www.instagram.com/achvexcodes/"), `missing Achvex Instagram in ${file}`);
    assert.match(content, /Achvex Ltd|ACHVEX LTD/);
  }
});
