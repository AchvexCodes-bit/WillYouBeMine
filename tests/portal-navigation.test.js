const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");

const portal = fs.readFileSync(path.join(__dirname, "..", "portal.js"), "utf8");

function extractFunction(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `missing function ${name}`);
  const open = source.indexOf("{", start);
  assert.notEqual(open, -1, `missing body for ${name}`);

  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    const next = source[i + 1];

    if (lineComment) {
      if (ch === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === "*" && next === "/") { blockComment = false; i++; }
      continue;
    }
    if (quote) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "/" && next === "/") { lineComment = true; i++; continue; }
    if (ch === "/" && next === "*") { blockComment = true; i++; continue; }
    if (ch === "'" || ch === '"' || ch === "`") { quote = ch; continue; }

    if (ch === "{") depth++;
    if (ch === "}" && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated function ${name}`);
}

function makePage() {
  const counter = { textContent: "" };
  return {
    hidden: true,
    classList: { add() {} },
    style: { setProperty() {} },
    querySelector(selector) { return selector === ".p-page-count" ? counter : null; },
    counter
  };
}

test("romantic scene collects every question page before applying animation classes", () => {
  const scene = extractFunction(portal, "initRomanticScene");
  assert.match(scene, /const pages = \$\$\("\[data-question-page\]", card\)/);
  assert.doesNotMatch(scene, /const pages = (?<!\$)\$\("\[data-question-page\]", card\)/);
});

test("recipient Next and Back navigate from the fixed intro through extras to the proposal", () => {
  const pageFn = extractFunction(portal, "initQuestionPages");
  const pages = [makePage(), makePage(), makePage()];
  pages[0].hidden = false;
  const handlers = {};
  const back = {
    disabled: false,
    addEventListener(event, handler) { handlers[`back:${event}`] = handler; }
  };
  const next = {
    hidden: false,
    addEventListener(event, handler) { handlers[`next:${event}`] = handler; }
  };
  const actions = { hidden: false };
  const card = {
    querySelector(selector) {
      if (selector === ".p-page-back") return back;
      if (selector === ".p-page-next") return next;
      if (selector === ".p-card-actions") return actions;
      if (selector === "[data-question-page]") return pages[0];
      return null;
    },
    querySelectorAll(selector) {
      return selector === "[data-question-page]" ? pages : [];
    }
  };
  const root = { querySelector(selector) { return selector === ".p-card" ? card : null; } };
  const $ = (selector, scope) => scope.querySelector(selector);
  const $$ = (selector, scope) => Array.from(scope.querySelectorAll(selector));
  const initQuestionPages = vm.runInNewContext(`(${pageFn})`, { $, $$ });

  assert.doesNotThrow(() => initQuestionPages(root));
  assert.deepEqual(pages.map(page => page.hidden), [false, true, true]);
  assert.equal(back.disabled, true);
  assert.equal(next.hidden, false);
  assert.equal(actions.hidden, true);
  assert.equal(pages[0].counter.textContent, "PAGE 1 OF 3");

  handlers["next:click"]();
  assert.deepEqual(pages.map(page => page.hidden), [true, false, true]);
  assert.equal(back.disabled, false);
  assert.equal(pages[1].counter.textContent, "PAGE 2 OF 3");

  handlers["next:click"]();
  assert.deepEqual(pages.map(page => page.hidden), [true, true, false]);
  assert.equal(next.hidden, true);
  assert.equal(actions.hidden, false);
  assert.equal(pages[2].counter.textContent, "PAGE 3 OF 3");

  handlers["back:click"]();
  assert.deepEqual(pages.map(page => page.hidden), [true, false, true]);
  assert.equal(next.hidden, false);
  assert.equal(actions.hidden, true);
});

test("answer form includes the responder name field that the submit handler saves", () => {
  assert.match(portal, /id="responder-name" maxlength="60"/);
  assert.match(portal, /const name = \$\("#responder-name"\)/);
  assert.match(portal, /recipient_name: recipientName \|\| ""/);
});

test("Supabase policy setup drops existing policies before recreating them", () => {
  const schema = fs.readFileSync(path.join(__dirname, "..", "supabase-schema.sql"), "utf8");
  const policyNames = [...schema.matchAll(/create policy "([^"]+)"/g)].map(match => match[1]);
  assert.ok(policyNames.length > 0, "schema contains policies");
  for (const name of new Set(policyNames)) {
    const dropped = schema.indexOf(`drop policy if exists "${name}"`);
    const created = schema.indexOf(`create policy "${name}"`);
    assert.ok(dropped >= 0 && created > dropped, `policy "${name}" should be dropped before it is created`);
  }
});
