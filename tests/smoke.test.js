const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

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
