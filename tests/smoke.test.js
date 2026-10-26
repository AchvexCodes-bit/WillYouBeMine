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
});


test("multi-page portal JavaScript parses and preserves publishing/link and auth recovery paths", () => {
  const portal = fs.readFileSync(path.join(root, "portal.js"), "utf8");
  assert.doesNotThrow(() => new vm.Script(portal), "portal.js must be valid JavaScript");
  assert.match(portal, /created-link-banner/);
  assert.match(portal, /copy-created-link/);
  assert.match(portal, /Could not sign out:/);
  assert.match(portal, /This proposal is not available/);
});
