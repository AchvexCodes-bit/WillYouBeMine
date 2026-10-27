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

test("recipient name and note controls stay hidden until the final proposal page", () => {
  const start = portal.indexOf("async function initProposal");
  const end = portal.indexOf("async function initInbox", start);
  const proposalInit = portal.slice(start, end);
  const details = proposalInit.indexOf('const extra = document.createElement("div")');
  const finalPage = proposalInit.indexOf('const finalPage = root.querySelector(".p-main-question-page")', details);
  const append = proposalInit.indexOf("finalPage.appendChild(extra)", finalPage);
  assert.ok(details >= 0, "recipient details are created");
  assert.ok(finalPage > details, "the final proposal page is selected after building the details");
  assert.ok(append > finalPage, "the details are appended inside the final proposal page");
  assert.doesNotMatch(proposalInit, /root\.querySelector\("\.p-card"\)\.appendChild\(extra\)/);
});


test("photo gallery is an optional navigation page between the fixed intro and extra questions", () => {
  const cardFn = extractFunction(portal, "cardMarkup");
  const themes = {
    sweet: { greeting: "Hey, you.", note: "A little note", no: "Maybe later" },
    midnight: { greeting: "Under these stars,", note: "A little note", no: "Let me think" },
    playful: { greeting: "Okay, so listen…", note: "A little note", no: "Not today!" }
  };
  const cardMarkup = vm.runInNewContext("(" + cardFn + ")", {
    themes,
    escapeText: value => String(value == null ? "" : value),
    MAX_PROPOSAL_PHOTOS: 5
  });

  const noPhotos = cardMarkup({ theme: "sweet", question: "Will you be my person?", question_pages: [] });
  assert.doesNotMatch(noPhotos, /p-photo-question-page/);
  assert.match(noPhotos, /data-question-page="0"/);
  assert.match(noPhotos, /p-main-question-page" data-question-page="1"/);
  assert.match(noPhotos, /PAGE 2 OF 2/);

  const withPhotos = cardMarkup({
    theme: "sweet",
    question: "Will you be my person?",
    question_pages: [{ question: "One more question", message: "" }],
    photo_gallery: [{ url: "blob:test-photo", caption: "Our first memory" }]
  });
  const introAt = withPhotos.indexOf("p-intro-question-page");
  const photoAt = withPhotos.indexOf("p-photo-question-page");
  const extraAt = withPhotos.indexOf("p-extra-question-page");
  const mainAt = withPhotos.indexOf("p-main-question-page");
  assert.ok(introAt >= 0 && photoAt > introAt && extraAt > photoAt && mainAt > extraAt);
  assert.match(withPhotos, /data-question-page="1" hidden/);
  assert.match(withPhotos, /data-question-page="2" hidden/);
  assert.match(withPhotos, /data-question-page="3" hidden/);
  assert.match(withPhotos, /Our first memory/);
  assert.match(withPhotos, /PAGE 4 OF 4/);

  const fivePhotoGallery = cardMarkup({
    theme: "sweet",
    question_pages: [{ question: "1" }, { question: "2" }, { question: "3" }],
    photo_gallery: Array.from({ length: 7 }, (_, i) => ({ url: "blob:" + i, caption: "" }))
  });
  assert.equal((fivePhotoGallery.match(/data-photo-open/g) || []).length, 5);
  assert.match(fivePhotoGallery, /PAGE 6 OF 6/);
});

test("creator provides bounded optional image selection and accessible caption controls", () => {
  const root = path.join(__dirname, "..");
  const createPage = fs.readFileSync(path.join(root, "create.html"), "utf8");
  const portalCss = fs.readFileSync(path.join(root, "portal.css"), "utf8");
  assert.match(createPage, /id="proposal-photos" type="file" accept="image\/jpeg,image\/png,image\/webp" multiple/);
  assert.match(createPage, /id="photo-selection-preview"/);
  assert.match(portal, /MAX_PROPOSAL_PHOTOS = 5/);
  assert.match(portal, /MAX_PHOTO_BYTES = 5 \* 1024 \* 1024/);
  assert.match(portal, /ALLOWED_PHOTO_TYPES = new Set\(\["image\/jpeg", "image\/png", "image\/webp"\]\)/);
  assert.match(portal, /data-photo-caption/);
  assert.match(portal, /URL\.createObjectURL/);
  assert.match(portalCss, /\.p-photo-question-page\[hidden\]/);
  assert.match(portalCss, /\.p-main-question-page\[hidden\]/);
  assert.match(portalCss, /\.p-photo-lightbox::backdrop/);
});

test("photo storage migration is private, owner-scoped, type-limited, and expiry-aware", () => {
  const migration = fs.readFileSync(path.join(__dirname, "..", "add-proposal-photos.sql"), "utf8");
  assert.match(migration, /add column if not exists photo_gallery jsonb/i);
  assert.match(migration, /'proposal-photos',[\s\S]*false,[\s\S]*5242880,[\s\S]*image\/jpeg[\s\S]*image\/png[\s\S]*image\/webp/i);
  assert.match(migration, /Proposal photos readable for active proposals/);
  assert.match(migration, /p\.created_at > now\(\) - interval '15 days'/);
  assert.match(migration, /Proposal owners can upload photos/);
  assert.match(migration, /Proposal owners can delete photos/);
  assert.match(migration, /grant update on public\.proposals to authenticated/i);
});

test("photo storage upload failures are rolled back and old databases fall back without photo support", () => {
  assert.match(portal, /Photo sharing needs one-time setup/);
  assert.match(portal, /Photo upload failed:/);
  assert.match(portal, /isMissingPhotoColumn\(result\.error\)/);
  assert.match(portal, /client\.storage\.from\(PHOTO_BUCKET\)\.remove/);
  assert.match(portal, /createSignedUrl\(photo\.path, PHOTO_URL_TTL_SECONDS\)/);
  assert.match(portal, /A missing\/expired image should never stop the proposal.s Yes\/No flow/);
});
