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

test("recipient answer flow no longer asks for the responder name", () => {
  const proposalPage = fs.readFileSync(path.join(__dirname, "..", "proposal.html"), "utf8");
  assert.doesNotMatch(proposalPage, /id="responder-name"/);
  assert.doesNotMatch(portal, /const name = \$\("#responder-name"\)/);
  assert.match(portal, /const name = ""/);
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
  assert.match(migration, /public\.is_published_proposal_photo\(/);
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
  assert.match(portal, /storage\.createSignedUrl\(photo\.path, PHOTO_URL_TTL_SECONDS\)/);
  assert.match(portal, /createSignedUrls\(paths, PHOTO_URL_TTL_SECONDS\)/);
  assert.match(portal, /One Storage request for the whole gallery instead of one request per photo/);
});


test("dashboard photo cleanup removes only folders for expired/deleted proposals", async () => {
  const cleanupFn = extractFunction(portal, "cleanupOrphanedProposalPhotos");
  const userId = "11111111-1111-4111-8111-111111111111";
  const activeId = "22222222-2222-4222-8222-222222222222";
  const orphanId = "33333333-3333-4333-8333-333333333333";
  const removedPaths = [];
  const storage = {
    async list(path) {
      if (path === userId) {
        return { data: [{ name: activeId, id: null }, { name: orphanId, id: null }], error: null };
      }
      if (path === userId + "/" + orphanId) {
        return { data: [{ name: "old-photo.jpg", id: "file-object-id" }], error: null };
      }
      return { data: [], error: null };
    },
    async remove(paths) {
      removedPaths.push(...paths);
      return { data: null, error: null };
    }
  };
  const cleanup = vm.runInNewContext("(async " + cleanupFn + ")", {
    client: { storage: { from: bucket => { assert.equal(bucket, "proposal-photos"); return storage; } } },
    currentUser: { id: userId },
    PHOTO_BUCKET: "proposal-photos"
  });
  await cleanup([{ id: activeId }]);
  assert.deepEqual(removedPaths, [userId + "/" + orphanId + "/old-photo.jpg"]);
});

test("dashboard triggers best-effort orphaned photo cleanup without blocking proposal listing", () => {
  assert.match(portal, /await cleanupOrphanedProposalPhotos\(proposals\)/);
  assert.match(portal, /catch \(_\) \{\s*\/\/ Cleanup is best-effort: a Storage hiccup must not break the dashboard\./);
});


test("recipient proposal renders before signed photo URLs resolve", () => {
  const start = portal.indexOf("async function initProposal");
  const end = portal.indexOf("async function initInbox", start);
  const proposalInit = portal.slice(start, end);
  const resolveStart = proposalInit.indexOf("const photoResolution =");
  const renderCard = proposalInit.indexOf("root.innerHTML = cardMarkup(proposal)");
  const attachHandlers = proposalInit.indexOf("initQuestionPages(root)");
  const backgroundResolution = proposalInit.indexOf(".then(photos => renderResolvedPhotoGallery(root, photos))");
  assert.ok(resolveStart >= 0 && renderCard > resolveStart);
  assert.ok(attachHandlers > renderCard, "navigation is initialized immediately after the proposal renders");
  assert.ok(backgroundResolution > attachHandlers, "photo URLs update the gallery in the background");
  assert.doesNotMatch(proposalInit, /proposal\.photo_gallery = await resolveProposalPhotos/);
});

test("photo gallery shows lightweight placeholders while secure URLs are loading", () => {
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
  const markup = cardMarkup({
    theme: "sweet",
    question: "Will you be my person?",
    question_pages: [],
    photo_gallery: [{ path: "owner/proposal/photo.webp", caption: "A memory" }]
  });
  assert.match(markup, /p-photo-placeholder/);
  assert.match(markup, /Preparing photo/);
  assert.match(markup, /p-photo-question-page/);
  assert.match(markup, /p-main-question-page" data-question-page="2" hidden/);
  assert.match(markup, /PAGE 3 OF 3/);
});

test("large photos are resized and encoded as WebP before storage", async () => {
  const helperSource = extractFunction(portal, "prepareOptimizedPhoto");
  let closed = false;
  const canvas = {
    width: 0,
    height: 0,
    getContext() { return { drawImage() {} }; },
    toBlob(callback, type, quality) {
      assert.equal(type, "image/webp");
      assert.equal(quality, 0.78);
      callback(new Blob(["compressed-photo"], { type: "image/webp" }));
    }
  };
  const bitmap = { width: 4000, height: 3000, close() { closed = true; } };
  const prepare = vm.runInNewContext("(async " + helperSource + ")", {
    createImageBitmap: async () => bitmap,
    document: { createElement: () => canvas },
    MAX_PHOTO_BYTES: 5 * 1024 * 1024,
    Blob,
    File,
    Date,
    String,
    Math,
    Promise
  });
  const original = new File([Buffer.alloc(800 * 1024)], "holiday.jpg", { type: "image/jpeg" });
  const optimized = await prepare(original);
  assert.equal(canvas.width, 1600);
  assert.equal(canvas.height, 1200);
  assert.equal(optimized.type, "image/webp");
  assert.match(optimized.name, /\.webp$/);
  assert.ok(optimized.size < original.size);
  assert.equal(closed, true);
});

test("photo upload avoids serial network waits and keeps saved gallery order", () => {
  assert.match(portal, /Promise\.allSettled\(prepared\.map\(async \(item, index\)/);
  assert.match(portal, /sort\(\(a, b\) => a\.index - b\.index\)/);
  assert.match(portal, /loading="eager" decoding="async"/);
  assert.match(portal, /image\.loading = "eager"/);
  assert.match(portal, /image\.decoding = "async"/);
  assert.match(portal, /createSignedUrl\(photo\.path, PHOTO_URL_TTL_SECONDS\)/);
});


test("gallery signs every photo in one Storage request", async () => {
  const resolverSource = extractFunction(portal, "resolveProposalPhotos");
  const gallery = [
    { path: "owner/proposal/one.webp", caption: "One" },
    { path: "owner/proposal/two.webp", caption: "Two" }
  ];
  let batchCalls = 0;
  const storage = {
    async createSignedUrls(paths, expiry) {
      batchCalls++;
      assert.equal(expiry, 900);
      assert.deepEqual(Array.from(paths), gallery.map(photo => photo.path));
      return {
        error: null,
        data: gallery.map(photo => ({
          path: photo.path,
          signedUrl: "https://storage.example/signed/" + encodeURIComponent(photo.path),
          error: null
        }))
      };
    }
  };
  const resolver = vm.runInNewContext("(async " + resolverSource + ")", {
    configured: true,
    client: { storage: { from: bucket => { assert.equal(bucket, "proposal-photos"); return storage; } } },
    currentUser: null,
    PHOTO_BUCKET: "proposal-photos",
    MAX_PROPOSAL_PHOTOS: 5,
    PHOTO_URL_TTL_SECONDS: 900,
    initSupabase: async () => {},
    Promise,
    Map,
    Array
  });
  const resolved = await resolver({ photo_gallery: gallery });
  assert.equal(batchCalls, 1);
  assert.equal(resolved.length, 2);
  assert.ok(resolved.every(photo => photo.url.startsWith("https://storage.example/signed/")));
  assert.deepEqual(resolved.map(photo => photo.caption), ["One", "Two"]);
});


test("dashboard can optimize an existing gallery and update its paths safely", async () => {
  const optimizerSource = extractFunction(portal, "optimizeExistingProposalPhotos");
  const ownerId = "11111111-1111-4111-8111-111111111111";
  const proposalId = "22222222-2222-4222-8222-222222222222";
  const oldPath = ownerId + "/" + proposalId + "/original.jpg";
  const oldGallery = [{ path: oldPath, caption: "A memory" }];
  const uploadedPaths = [];
  const removedPaths = [];
  let savedGallery = null;
  const storage = {
    async download(path) {
      assert.equal(path, oldPath);
      return { data: new Blob([new Uint8Array(600 * 1024)], { type: "image/jpeg" }), error: null };
    },
    async upload(path, file, options) {
      uploadedPaths.push({ path, file, options });
      return { error: null };
    },
    async remove(paths) {
      removedPaths.push(...paths);
      return { error: null };
    }
  };
  const query = {
    select() { return this; },
    eq() { return this; },
    async maybeSingle() { return { data: { id: proposalId, photo_gallery: oldGallery }, error: null }; },
    update(value) {
      savedGallery = value.photo_gallery;
      return {
        eq() { return this; },
        then(resolve, reject) { return Promise.resolve({ error: null }).then(resolve, reject); }
      };
    }
  };
  const client = {
    from(table) { assert.equal(table, "proposals"); return query; },
    storage: { from(bucket) { assert.equal(bucket, "proposal-photos"); return storage; } }
  };
  const optimizer = vm.runInNewContext("(async " + optimizerSource + ")", {
    client,
    currentUser: { id: ownerId },
    MAX_PROPOSAL_PHOTOS: 5,
    PHOTO_BUCKET: "proposal-photos",
    ALLOWED_PHOTO_TYPES: new Set(["image/jpeg", "image/png", "image/webp"]),
    isMissingPhotoColumn: () => false,
    prepareOptimizedPhoto: async () => new File([new Uint8Array(32 * 1024)], "optimized.webp", { type: "image/webp" }),
    photoExtension: file => file.type === "image/webp" ? "webp" : file.type === "image/png" ? "png" : "jpg",
    makeId: () => "compressed-id",
    File,
    Blob,
    Date,
    String,
    Promise,
    Array
  });
  const result = await optimizer(proposalId);
  assert.equal(result.optimized, 1);
  assert.equal(result.total, 1);
  assert.equal(result.cleanupWarning, false);
  assert.equal(uploadedPaths.length, 1);
  assert.equal(uploadedPaths[0].path, ownerId + "/" + proposalId + "/optimized-compressed-id.webp");
  assert.equal(uploadedPaths[0].options.contentType, "image/webp");
  assert.equal(savedGallery[0].path, uploadedPaths[0].path);
  assert.equal(savedGallery[0].caption, "A memory");
  assert.deepEqual(removedPaths, [oldPath]);
});

test("dashboard offers optimization only for proposals with stored photo paths", () => {
  assert.match(portal, /data-optimize-photos/);
  assert.match(portal, /optimizeExistingProposalPhotos\(btn\.dataset\.optimizePhotos\)/);
  assert.match(portal, /select\(fields \+ ",photo_gallery"\)/);
  assert.match(portal, /const photoCount = Array\.isArray\(p\.photo_gallery\) \? p\.photo_gallery\.filter\(photo => photo && photo\.path\)\.length : 0/);
});

test("extra question pages offer ready-made starters and keep starter text editable", () => {
  const presetStart = portal.indexOf("const extraQuestionPresets = ");
  const presetEnd = portal.indexOf("\n  function applyExtraQuestionPreset", presetStart);
  assert.ok(presetStart >= 0 && presetEnd > presetStart, "pre-made question starter list exists");
  const presetExpression = portal.slice(presetStart, presetEnd)
    .replace("const extraQuestionPresets = ", "")
    .trim()
    .replace(/;$/, "");
  const presets = vm.runInNewContext("(" + presetExpression + ")");
  assert.ok(Object.keys(presets).length >= 6, "several starter ideas are available");
  assert.ok(Object.values(presets).every(preset => preset.label && preset.question && preset.message),
    "each starter supplies a label, question and message");

  const applyFn = extractFunction(portal, "applyExtraQuestionPreset");
  const applyPreset = vm.runInNewContext("(" + applyFn + ")");
  const questionField = { value: "My old question" };
  const messageField = { value: "My old message" };
  assert.equal(applyPreset(presets, "favoriteMemory", questionField, messageField), true);
  assert.equal(questionField.value, presets.favoriteMemory.question);
  assert.equal(messageField.value, presets.favoriteMemory.message);

  questionField.value += " (edited)";
  messageField.value = "My own words";
  assert.equal(questionField.value.endsWith("(edited)"), true);
  assert.equal(messageField.value, "My own words");
  assert.equal(applyPreset(presets, "does-not-exist", questionField, messageField), false);
  assert.match(portal, /data-extra-preset/);
  assert.match(portal, /select\.addEventListener\("change"/);
  assert.match(portal, /\$\$\("\[data-extra-preset\]", pageEditor\)\.forEach\(select => select\.addEventListener\("change"/);
  assert.match(portal, /Choose a question starter…/);
  assert.match(portal, /Write my own \(blank\)/);
  assert.match(portal, /question_pages:\s*\$\$\("\.p-extra-page-editor"\)/);
});

test("live preview re-renders retain the current question page while typing", () => {
  const pageFn = extractFunction(portal, "initQuestionPages");
  const pages = [makePage(), makePage(), makePage(), makePage()];
  const handlers = {};
  const back = {
    disabled: false,
    addEventListener(event, handler) { handlers[`back:${event}`] = handler; }
  };
  const next = {
    hidden: false,
    addEventListener(event, handler) { handlers[`next:${event}`] = handler; }
  };
  const actions = { hidden: true };
  const card = {
    querySelector(selector) {
      if (selector === ".p-page-back") return back;
      if (selector === ".p-page-next") return next;
      if (selector === ".p-card-actions") return actions;
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

  // Simulate rebuilding the preview while the creator is typing on page 3.
  assert.doesNotThrow(() => initQuestionPages(root, 2));
  assert.deepEqual(pages.map(page => page.hidden), [true, true, false, true]);
  assert.equal(pages[2].counter.textContent, "PAGE 3 OF 4");
  assert.equal(back.disabled, false);
  assert.equal(next.hidden, false);
  assert.equal(actions.hidden, true);

  // Navigation must keep working after the preview is initialized at that page.
  handlers["next:click"]();
  assert.deepEqual(pages.map(page => page.hidden), [true, true, true, false]);
  assert.equal(actions.hidden, false);
  assert.equal(next.hidden, true);

  // If the page count shrinks while editing, the index is safely clamped.
  assert.doesNotThrow(() => initQuestionPages(root, 99));
  assert.deepEqual(pages.map(page => page.hidden), [true, true, true, false]);
  assert.match(portal, /const existingPages = \$\$\("\[data-question-page\]", preview\)/);
  assert.match(portal, /const visiblePageIndex = existingPages\.findIndex\(page => !page\.hidden\)/);
  assert.match(portal, /initQuestionPages\(preview, currentPageIndex\)/);
});

test("malformed public proposal links are rejected before a Supabase request", async () => {
  const fetchFn = extractFunction(portal, "fetchProposal");
  let databaseCalls = 0;
  let initCalls = 0;
  const fetchProposal = vm.runInNewContext("(async " + fetchFn + ")", {
    configured: true,
    client: { from() { databaseCalls++; throw new Error("A malformed UUID should not reach Supabase."); } },
    initSupabase: async () => { initCalls++; }
  });

  for (const id of ["", "invalid", "123e4567-e89b-12d3-a456-42661417400", "not-a-uuid"]) {
    assert.equal(await fetchProposal(id), null, "malformed proposal IDs should render as unavailable");
  }
  assert.equal(databaseCalls, 0, "malformed IDs must not generate a database request");
  assert.equal(initCalls, 0, "malformed IDs should be rejected before initializing the backend");
});



test("link-scoped public proposal RPC is preferred over direct table reads", async () => {
  const fetchFn = extractFunction(portal, "fetchProposal");
  const id = "123e4567-e89b-12d3-a456-426614174000";
  let rpcCalls = 0;
  let directReads = 0;
  const fetchProposal = vm.runInNewContext("(async " + fetchFn + ")", {
    configured: true,
    client: {
      async rpc(name, args) {
        rpcCalls++;
        assert.equal(name, "get_published_proposal");
        assert.equal(args.p_proposal_id, id);
        return { data: { id, question: "Will you be my person?" }, error: null };
      },
      from() { directReads++; throw new Error("Direct public table reads should not be used when RPC works."); }
    },
    initSupabase: async () => {},
    isMissingPublicProposalFunction: () => false
  });
  const row = await fetchProposal(id);
  assert.equal(row.id, id);
  assert.deepEqual(Array.from(row.question_pages), []);
  assert.deepEqual(JSON.parse(JSON.stringify(row.custom_options)), {});
  assert.deepEqual(Array.from(row.photo_gallery), []);
  assert.equal(rpcCalls, 1);
  assert.equal(directReads, 0);
});

test("missing public-proposal RPC fails closed instead of reading the public table", async () => {
  const fetchFn = extractFunction(portal, "fetchProposal");
  const id = "123e4567-e89b-12d3-a456-426614174000";
  let directReads = 0;
  const fetchProposal = vm.runInNewContext("(async " + fetchFn + ")", {
    configured: true,
    client: {
      async rpc() { return { data: null, error: { code: "PGRST202", message: "Could not find get_published_proposal in schema cache" } }; },
      from() { directReads++; throw new Error("Public direct table access is forbidden."); }
    },
    initSupabase: async () => {},
    isMissingPublicProposalFunction: error => error.code === "PGRST202"
  });
  await assert.rejects(fetchProposal(id), /secure-public-proposals\\.sql/);
  assert.equal(directReads, 0, "the public page must never fall back to querying proposal rows directly");
});

test("public-proposal hardening migration removes table-wide anonymous SELECT", () => {
  const migration = fs.readFileSync(path.join(__dirname, "..", "secure-public-proposals.sql"), "utf8");
  assert.match(migration, /create or replace function public\.get_published_proposal\(p_proposal_id uuid\)/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /drop policy if exists "Anyone can view unexpired published proposals"/i);
  assert.match(migration, /revoke all on public\.proposals from public, anon/i);
  assert.match(migration, /grant execute on function public\.get_published_proposal\(uuid\) to anon, authenticated/i);
  assert.doesNotMatch(migration, /create policy "Anyone can view (?:unexpired )?published proposals"/i);
});


test("canonical and expiry SQL do not recreate anonymous table-wide proposal reads", () => {
  const schema = fs.readFileSync(path.join(__dirname, "..", "supabase-schema.sql"), "utf8");
  const expiry = fs.readFileSync(path.join(__dirname, "..", "expire-proposals-after-15-days.sql"), "utf8");
  for (const [name, sql] of [["supabase-schema.sql", schema], ["expire-proposals-after-15-days.sql", expiry]]) {
    assert.match(sql, /create or replace function public\.get_published_proposal\(p_proposal_id uuid\)/i, `${name} must provide link-scoped reads`);
    assert.match(sql, /public\.is_published_proposal\(proposal_id\)/i, `${name} must guard anonymous answers`);
    assert.doesNotMatch(sql, /create policy "Anyone can view (?:unexpired )?published proposals"/i, `${name} must not add table-wide public reads`);
    assert.match(sql, /revoke all on public\.proposals from public, anon/i, `${name} must revoke anonymous table privileges`);
  }
});

test("Vercel production security headers include CSP and clickjacking protection", () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "vercel.json"), "utf8"));
  const rule = config.headers.find(item => item.source === "/(.*)");
  assert.ok(rule, "security headers apply to every route");
  const headers = Object.fromEntries(rule.headers.map(item => [item.key.toLowerCase(), item.value]));
  for (const key of ["content-security-policy", "x-content-type-options", "x-frame-options", "referrer-policy", "permissions-policy", "strict-transport-security"]) {
    assert.ok(headers[key], `missing ${key}`);
  }
  assert.match(headers["content-security-policy"], /default-src 'self'/);
  assert.match(headers["content-security-policy"], /frame-ancestors 'none'/);
  assert.match(headers["content-security-policy"], /https:\/\/cdn\.jsdelivr\.net/);
  assert.match(headers["content-security-policy"], /https:\/\/\*\.supabase\.co/);
});

