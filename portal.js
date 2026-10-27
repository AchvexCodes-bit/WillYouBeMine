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
    firstdate: { question: "Would you go on our first date with me?", message: "I would love to get to know you better, hear your stories, and turn an ordinary day into a lovely memory. ☕", yes: "Let's make a memory! ♥", theme: "sweet" },
    prom: { question: "Would you make this special night even better and go with me?", message: "There's one person I'd love to share this moment with — you. What do you say? ✨", yes: "Let's go together! ♥", theme: "playful" },
    apology: { question: "Can we talk and try to make things right?", message: "I know words can't fix everything, but I want to listen, take responsibility, and make room for an honest conversation. 🌷", yes: "Let's talk ♥", theme: "sweet" },
    justbecause: { question: "Can I make your day a little more special?", message: "No big occasion needed. I just wanted to remind you that you matter to me and you make life a little brighter. 💗", yes: "Of course! ♥", theme: "playful" },
    custom: { question: "", message: "", yes: "Yes, absolutely! ♥", theme: "sweet" }
  };
  const demoKey = "wybm-demo-proposals-v1";
  const demoResponseKey = "wybm-demo-responses-v1";
  const query = new URLSearchParams(location.search);
  const PHOTO_BUCKET = "proposal-photos";
  const MAX_PROPOSAL_PHOTOS = 5;
  const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
  const PHOTO_URL_TTL_SECONDS = 15 * 60;
  const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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
  function isMissingPhotoColumn(error) {
    const message = String(error && error.message || "").toLowerCase();
    return message.includes("photo_gallery") && (
      error.code === "42703" ||
      error.code === "PGRST204" ||
      message.includes("does not exist") ||
      message.includes("schema cache") ||
      message.includes("could not find")
    );
  }
  function isMissingCustomOptionsColumn(error) {
    const message = String(error && error.message || "").toLowerCase();
    return message.includes("custom_options") && (
      error.code === "42703" ||
      error.code === "PGRST204" ||
      message.includes("does not exist") ||
      message.includes("schema cache") ||
      message.includes("could not find")
    );
  }
  function photoExtension(file) {
    return file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "";
  }
  async function resolveProposalPhotos(proposal) {
    const photos = Array.isArray(proposal && proposal.photo_gallery)
      ? proposal.photo_gallery.filter(photo => photo && (photo.path || photo.url)).slice(0, MAX_PROPOSAL_PHOTOS)
      : [];
    if (!photos.length) return [];
    const signedUrls = new Map();
    const storedPhotos = photos.filter(photo => photo.path);
    if (storedPhotos.length && configured) {
      try {
        if (!client) await initSupabase();
        const storage = client && client.storage.from(PHOTO_BUCKET);
        const paths = storedPhotos.map(photo => photo.path);
        if (storage && typeof storage.createSignedUrls === "function") {
          // One Storage request for the whole gallery instead of one request per photo.
          const result = await storage.createSignedUrls(paths, PHOTO_URL_TTL_SECONDS);
          if (!result.error && Array.isArray(result.data)) {
            result.data.forEach((item, index) => {
              const path = item && item.path ? item.path : paths[index];
              if (item && item.signedUrl && !item.error && path) signedUrls.set(path, item.signedUrl);
            });
          }
        } else if (storage) {
          // Compatibility fallback for older versions of the Storage JS client.
          const results = await Promise.all(storedPhotos.map(photo =>
            storage.createSignedUrl(photo.path, PHOTO_URL_TTL_SECONDS)
          ));
          results.forEach((result, index) => {
            if (result && !result.error && result.data && result.data.signedUrl) {
              signedUrls.set(storedPhotos[index].path, result.data.signedUrl);
            }
          });
        }
      } catch (_) {
        // A photo URL failure must never block the proposal or its Yes/No answer flow.
      }
    }
    return photos.map(photo => {
      if (photo.url && !photo.path) return { ...photo, failed: false };
      const url = photo.path ? signedUrls.get(photo.path) || "" : "";
      return { ...photo, url, failed: !url };
    });
  }
  function renderResolvedPhotoGallery(root, photos) {
    const card = root && root.querySelector(".p-card");
    const grid = card && card.querySelector(".p-photo-grid");
    if (!grid || !Array.isArray(photos)) return;
    photos.slice(0, MAX_PROPOSAL_PHOTOS).forEach((photo, index) => {
      const figure = grid.querySelector('[data-photo-index="' + index + '"]');
      if (!figure) return;
      figure.replaceChildren();
      if (photo && photo.url) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "p-photo-open";
        button.dataset.photoOpen = "";
        button.dataset.photoUrl = photo.url;
        button.dataset.photoAlt = photo.caption || ("Memory " + (index + 1));
        button.dataset.photoCaption = photo.caption || "";
        button.setAttribute("aria-label", "View photo " + (index + 1) + " full size");
        const image = document.createElement("img");
        image.src = photo.url;
        image.alt = photo.caption || ("Memory " + (index + 1));
        image.loading = "eager";
        image.decoding = "async";
        image.fetchPriority = index === 0 ? "high" : "auto";
        image.addEventListener("load", () => button.classList.add("is-loaded"), { once: true });
        image.addEventListener("error", () => {
          button.replaceChildren();
          button.disabled = true;
          button.classList.add("p-photo-load-failed");
          button.textContent = "This photo couldn't load.";
          button.removeAttribute("data-photo-open");
        }, { once: true });
        button.appendChild(image);
        figure.appendChild(button);
      } else {
        const placeholder = document.createElement("div");
        placeholder.className = "p-photo-placeholder p-photo-load-failed";
        placeholder.setAttribute("role", "status");
        placeholder.textContent = "This photo couldn't load. Refresh to try again.";
        figure.appendChild(placeholder);
      }
      if (photo && photo.caption) {
        const caption = document.createElement("figcaption");
        caption.className = "p-photo-caption";
        caption.textContent = photo.caption;
        figure.appendChild(caption);
      }
    });
  }
  async function prepareOptimizedPhoto(file) {
    if (typeof createImageBitmap !== "function" || !document.createElement) return file;
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      const maxDimension = 1600;
      const largestSide = Math.max(bitmap.width, bitmap.height);
      const scale = Math.min(1, maxDimension / largestSide);
      const shouldResize = scale < 1;
      if (!shouldResize && file.size <= 300 * 1024) return file;

      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) return file;
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", 0.78));
      if (!blob) return file;
      if (!shouldResize && blob.size >= file.size) return file;
      if (blob.size > MAX_PHOTO_BYTES) return file;
      const baseName = String(file.name || "memory").replace(/\.[^.]+$/, "");
      return new File([blob], baseName + ".webp", {
        type: "image/webp",
        lastModified: Date.now()
      });
    } catch (_) {
      // Some browsers cannot decode a selected format with createImageBitmap.
      // Keep the original file so a compression issue won't block publishing.
      return file;
    } finally {
      if (bitmap && typeof bitmap.close === "function") bitmap.close();
    }
  }
  async function uploadProposalPhotos(proposalId, selectedPhotos) {
    if (!client || !currentUser) throw new Error("Please sign in again before uploading photos.");
    const uploadedPaths = [];
    try {
      const prepared = [];
      for (const item of selectedPhotos) {
        if (!item || !item.file || !ALLOWED_PHOTO_TYPES.has(item.file.type)) {
          throw new Error("Only JPG, PNG, and WebP photos are supported.");
        }
        if (item.file.size > MAX_PHOTO_BYTES) {
          throw new Error("Each photo must be 5 MB or smaller.");
        }
        const file = await prepareOptimizedPhoto(item.file);
        if (file.size > MAX_PHOTO_BYTES) {
          throw new Error("An optimized photo is still larger than 5 MB. Please choose a smaller image.");
        }
        const extension = photoExtension(file);
        if (!extension) throw new Error("Your browser couldn't prepare this photo format. Please use JPG, PNG, or WebP.");
        prepared.push({ file, caption: String(item.caption || "").trim().slice(0, 120) });
      }

      // Upload in parallel so a five-photo gallery doesn't wait for five serial network trips.
      const results = await Promise.allSettled(prepared.map(async (item, index) => {
        const path = currentUser.id + "/" + proposalId + "/" + (index + 1) + "-" + makeId() + "." + photoExtension(item.file);
        const result = await client.storage.from(PHOTO_BUCKET).upload(path, item.file, {
          cacheControl: "3600",
          contentType: item.file.type,
          upsert: false
        });
        if (result.error) throw result.error;
        uploadedPaths.push(path);
        return { index, path, caption: item.caption };
      }));
      const failed = results.find(result => result.status === "rejected");
      if (failed) throw failed.reason;
      const gallery = results
        .map(result => result.value)
        .sort((a, b) => a.index - b.index)
        .map(({ path, caption }) => ({ path, caption }));

      const saved = await client.from("proposals")
        .update({ photo_gallery: gallery })
        .eq("id", proposalId)
        .eq("owner_id", currentUser.id);
      if (saved.error) throw saved.error;
      return gallery;
    } catch (error) {
      if (uploadedPaths.length) {
        try { await client.storage.from(PHOTO_BUCKET).remove(uploadedPaths); }
        catch (_) { /* Keep the original upload error; cleanup is best-effort. */ }
      }
      const detail = error && error.message ? error.message : "Please check the Supabase photo setup.";
      throw new Error("Photo upload failed: " + detail);
    }
  }

  async function optimizeExistingProposalPhotos(proposalId) {
    if (!client || !currentUser) throw new Error("Please sign in before optimizing photos.");
    const lookup = await client.from("proposals")
      .select("id,photo_gallery")
      .eq("id", proposalId)
      .eq("owner_id", currentUser.id)
      .maybeSingle();
    if (lookup.error) {
      if (isMissingPhotoColumn(lookup.error)) {
        throw new Error("Photo storage setup is missing. Run add-proposal-photos.sql in Supabase first.");
      }
      throw lookup.error;
    }
    if (!lookup.data) throw new Error("This proposal is not available in your account.");
    const gallery = Array.isArray(lookup.data.photo_gallery) ? lookup.data.photo_gallery.slice(0, MAX_PROPOSAL_PHOTOS) : [];
    if (!gallery.length) return { optimized: 0, total: 0 };
    const storage = client.storage.from(PHOTO_BUCKET);
    const uploadedPaths = [];
    const oldPaths = [];
    const nextGallery = [];
    let optimizedCount = 0;
    let metadataSaved = false;
    try {
      for (const photo of gallery) {
        if (!photo || !photo.path) {
          nextGallery.push(photo);
          continue;
        }
        const downloaded = await storage.download(photo.path);
        if (downloaded.error || !downloaded.data) {
          throw downloaded.error || new Error("Could not download an existing photo.");
        }
        const extension = String(photo.path).split(".").pop().toLowerCase();
        const inferredType = extension === "jpg" || extension === "jpeg" ? "image/jpeg" :
          extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "";
        const type = ALLOWED_PHOTO_TYPES.has(downloaded.data.type) ? downloaded.data.type : inferredType;
        if (!ALLOWED_PHOTO_TYPES.has(type)) {
          throw new Error("An existing gallery photo has an unsupported format. Please replace it with JPG, PNG, or WebP.");
        }
        const sourceFile = new File([downloaded.data], "existing-photo." + (type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : "webp"), {
          type,
          lastModified: Date.now()
        });
        const optimized = await prepareOptimizedPhoto(sourceFile);
        if (optimized === sourceFile) {
          nextGallery.push(photo);
          continue;
        }
        const newPath = currentUser.id + "/" + proposalId + "/optimized-" + makeId() + "." + photoExtension(optimized);
        const uploaded = await storage.upload(newPath, optimized, {
          cacheControl: "3600",
          contentType: optimized.type,
          upsert: false
        });
        if (uploaded.error) throw uploaded.error;
        uploadedPaths.push(newPath);
        oldPaths.push(photo.path);
        nextGallery.push({ path: newPath, caption: String(photo.caption || "").slice(0, 120) });
        optimizedCount++;
      }

      if (!optimizedCount) return { optimized: 0, total: gallery.length };
      const saved = await client.from("proposals")
        .update({ photo_gallery: nextGallery })
        .eq("id", proposalId)
        .eq("owner_id", currentUser.id);
      if (saved.error) throw saved.error;
      metadataSaved = true;

      // The new gallery is live now; cleanup of old files is best-effort and won't break it.
      let cleanupWarning = false;
      if (oldPaths.length) {
        try {
          const removed = await storage.remove(oldPaths);
          cleanupWarning = Boolean(removed.error);
        } catch (_) {
          cleanupWarning = true;
        }
      }
      return { optimized: optimizedCount, total: gallery.length, cleanupWarning };
    } catch (error) {
      if (!metadataSaved && uploadedPaths.length) {
        try { await storage.remove(uploadedPaths); }
        catch (_) { /* Preserve the original error. */ }
      }
      throw new Error("Could not optimize existing photos: " + (error && error.message ? error.message : "Please try again."));
    }
  }

  async function cleanupOrphanedProposalPhotos(proposals) {
    if (!client || !currentUser) return;
    try {
      const storage = client.storage.from(PHOTO_BUCKET);
      const { data: folders, error } = await storage.list(currentUser.id, { limit: 1000 });
      if (error || !Array.isArray(folders)) return;
      const retainedIds = new Set((proposals || []).map(proposal => String(proposal.id)));
      for (const folder of folders) {
        const proposalId = String(folder && folder.name || "");
        // Supabase Storage represents directories as entries without a file id.
        if (folder.id || !/^[0-9a-f-]{36}$/i.test(proposalId) || retainedIds.has(proposalId)) continue;
        const listing = await storage.list(currentUser.id + "/" + proposalId, { limit: 20 });
        if (listing.error || !Array.isArray(listing.data)) continue;
        const paths = listing.data
          .filter(item => item && item.id && item.name)
          .map(item => currentUser.id + "/" + proposalId + "/" + item.name);
        if (paths.length) {
          const removed = await storage.remove(paths);
          if (removed.error) continue;
        }
      }
    } catch (_) {
      // Cleanup is best-effort: a Storage hiccup must not break the dashboard.
    }
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
      let fields = "id,creator_name,recipient_name,question,message,yes_text,theme,status,created_at,question_pages,dodge_no,custom_options";
      let includePhotos = true;
      let result = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const selectedFields = fields + (includePhotos ? ",photo_gallery" : "");
        result = await client.from("proposals").select(selectedFields).eq("id", id).eq("status", "published").maybeSingle();
        if (!result.error) break;
        if (includePhotos && isMissingPhotoColumn(result.error)) {
          includePhotos = false;
          continue;
        }
        if (fields.includes(",custom_options") && isMissingCustomOptionsColumn(result.error)) {
          fields = fields.replace(",custom_options", "");
          continue;
        }
        break;
      }
      if (result.error) throw result.error;
      if (result.data && !includePhotos) result.data.photo_gallery = [];
      if (result.data && !fields.includes("custom_options")) result.data.custom_options = {};
      return result.data;
    }
    return demoProposals().find(p => p.id === id && p.status === "published") || null;
  }
  async function createProposal(payload) {
    if (configured) {
      if (!client) await initSupabase();
      if (!client) throw new Error("Publishing is unavailable. Check the Supabase setup in config.js.");
      if (!currentUser) throw new Error("Please sign in before publishing.");
      const insertPayload = { ...payload, owner_id: currentUser.id, status: "published" };
      let result = await client.from("proposals").insert(insertPayload).select("id").single();
      if (result.error && isMissingCustomOptionsColumn(result.error) && Object.prototype.hasOwnProperty.call(insertPayload, "custom_options")) {
        // Keep publishing functional on older Supabase schemas; send a clear upgrade notice after redirect.
        const legacyPayload = { ...insertPayload };
        delete legacyPayload.custom_options;
        result = await client.from("proposals").insert(legacyPayload).select("id").single();
        if (result.error) throw result.error;
        return { id: result.data.id, customizationSaved: false };
      }
      if (result.error) throw result.error;
      return { id: result.data.id, customizationSaved: true };
    }
    const id = makeId();
    const list = demoProposals();
    list.unshift({ ...payload, id, owner_id: "demo", status: "published", created_at: new Date().toISOString() });
    saveDemoProposals(list);
    return { id, customizationSaved: true };
  }
  async function listMyProposals() {
    if (configured) {
      if (!client) await initSupabase();
      if (!currentUser) return [];
      const fields = "id,creator_name,recipient_name,question,theme,status,created_at";
      let result = await client.from("proposals").select(fields + ",photo_gallery").eq("owner_id", currentUser.id).order("created_at", { ascending: false });
      if (result.error && isMissingPhotoColumn(result.error)) {
        result = await client.from("proposals").select(fields).eq("owner_id", currentUser.id).order("created_at", { ascending: false });
        if (!result.error && Array.isArray(result.data)) result.data.forEach(proposal => { proposal.photo_gallery = []; });
      }
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
      // Remove stored images before removing the parent row, while the owner-scoped
      // Storage delete policy can still confirm that this account owns the proposal.
      const gallery = await client.from("proposals").select("photo_gallery").eq("id", id).eq("owner_id", currentUser.id).maybeSingle();
      if (gallery.error && !isMissingPhotoColumn(gallery.error)) throw gallery.error;
      const paths = gallery.data && Array.isArray(gallery.data.photo_gallery)
        ? gallery.data.photo_gallery.map(photo => photo && photo.path).filter(Boolean)
        : [];
      if (paths.length) {
        const removed = await client.storage.from(PHOTO_BUCKET).remove(paths);
        if (removed.error) throw new Error("Could not remove this proposal's photos: " + removed.error.message);
      }
      const result = await client.from("proposals").delete().eq("id", id).eq("owner_id", currentUser.id);
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
    const customOptions = p.custom_options && typeof p.custom_options === "object" ? p.custom_options : {};
    const accents = new Set(["rose", "lavender", "ocean", "sage", "gold"]);
    const fonts = new Set(["serif", "sans", "classic"]);
    const accent = accents.has(customOptions.accent_color) ? customOptions.accent_color : "rose";
    const font = fonts.has(customOptions.font_style) ? customOptions.font_style : "serif";
    const effects = customOptions.effects !== false;
    const customGreeting = String(customOptions.greeting || "").trim().slice(0, 80);
    const customNoText = String(customOptions.no_text || "").trim().slice(0, 40);
    const greeting = customGreeting || (p.recipient_name ? "Hey, " + p.recipient_name + "." : theme.greeting);
    const questionPages = Array.isArray(p.question_pages) ? p.question_pages.slice(0, 3) : [];
    const photos = Array.isArray(p.photo_gallery) ? p.photo_gallery.filter(photo => photo && (photo.url || photo.path)).slice(0, MAX_PROPOSAL_PHOTOS) : [];
    const photoOffset = photos.length ? 1 : 0;
    const extraStartIndex = photoOffset + 1;
    const finalPageIndex = questionPages.length + extraStartIndex;
    const totalPages = finalPageIndex + 1;
    const photoPage = photos.length
      ? '<section class="p-photo-question-page" data-question-page="1" hidden><p class="p-page-count">PAGE 2 OF ' + totalPages + '</p><p class="p-fixed-eyebrow">A FEW MEMORIES</p><h2 class="p-card-question">Little moments, kept close.</h2><p class="p-card-message">A few photos to look back on before the big question. ♡</p><div class="p-photo-grid">' +
        photos.map((photo, index) => '<figure class="p-photo-item" data-photo-index="' + index + '">' +
          (photo.url
            ? '<button type="button" class="p-photo-open" data-photo-open data-photo-url="' + escapeText(photo.url) + '" data-photo-alt="' + escapeText(photo.caption || ("Memory " + (index + 1))) + '" data-photo-caption="' + escapeText(photo.caption || "") + '" aria-label="View photo ' + (index + 1) + ' full size"><img src="' + escapeText(photo.url) + '" alt="' + escapeText(photo.caption || ("Memory " + (index + 1))) + '" loading="eager" decoding="async"></button>'
            : '<div class="p-photo-placeholder" role="status"><span class="p-photo-loader" aria-hidden="true"></span><span>Preparing photo…</span></div>') +
          (photo.caption ? '<figcaption class="p-photo-caption">' + escapeText(photo.caption) + '</figcaption>' : '') + '</figure>').join("") +
        '</div></section><dialog class="p-photo-lightbox" aria-label="Expanded photo"><button type="button" class="p-photo-lightbox-close" aria-label="Close photo">×</button><img src="" alt="Expanded memory"><p class="p-photo-lightbox-caption"></p></dialog>'
      : "";
    return '<div class="p-card" data-theme="' + escapeText(p.theme || "sweet") + '" data-accent="' + accent + '" data-font="' + font + '" data-effects="' + (effects ? "true" : "false") + '" data-dodge-no="' + (p.dodge_no ? "true" : "false") + '">' +
      '<div class="p-card-top"><span>A LITTLE MOMENT FOR YOU</span><span>♥</span></div>' +
      '<div class="p-card-art"><span class="p-card-orb"></span><span class="p-card-heart">♥</span></div>' +
      '<p class="p-card-greeting">' + escapeText(greeting) + '</p>' +
      '<section class="p-intro-question-page" data-question-page="0">' +
      '<p class="p-page-count">PAGE 1 OF ' + totalPages + '</p>' +
      '<p class="p-fixed-eyebrow">A NOTE FROM THE HEART</p>' +
      '<h1 class="p-card-question">Before you answer…</h1>' +
      '<p class="p-card-message">Someone made this little page especially for you. Take your time, enjoy each question, and know that every word here was chosen to share a feeling with you. There is no rush and no pressure — just a small moment to read, smile, and be honest with your heart. ♥</p>' +
      '</section>' +
      photoPage +
      (questionPages.length ? questionPages.map((page,index) => '<section class="p-extra-question-page" data-question-page="' + (index + extraStartIndex) + '" hidden><p class="p-page-count">PAGE ' + (index + extraStartIndex + 1) + ' OF ' + totalPages + '</p><h2 class="p-card-question">' + escapeText(page.question || "One more little question…") + '</h2><p class="p-card-message">' + escapeText(page.message || "") + '</p></section>').join("") : '') +
      '<section class="p-main-question-page" data-question-page="' + finalPageIndex + '" hidden>' +
      '<p class="p-page-count">PAGE ' + totalPages + ' OF ' + totalPages + '</p>' +
      '<h1 class="p-card-question">' + escapeText(p.question || "Will you be my person?") + '</h1><p class="p-card-message">' + escapeText(p.message || theme.note) + '</p></section>' +
      '<div class="p-page-navigation"><button type="button" class="p-page-back" disabled>← Back</button><button type="button" class="p-page-next">Next →</button></div>' +
      '<div class="p-card-actions" hidden><button class="p-card-yes" id="recipient-yes">' + escapeText(p.yes_text || "Yes, absolutely! ♥") + '</button><button class="p-card-no" id="recipient-no">' + escapeText(customNoText || theme.no) + '</button></div>' +
      '<p class="p-card-response" id="recipient-feedback" aria-live="polite"></p>' +
      '<div class="p-card-foot"><span>MADE WITH A LITTLE NERVE</span><span>♡ JUST FOR YOU</span></div></div>';
  }
  function initRomanticScene(root) {
    const card = root && root.querySelector(".p-card");
    if (!card || card.dataset.sceneReady === "true") return;
    card.dataset.sceneReady = "true";
    card.classList.add("p-romantic-scene");
    if (card.dataset.effects === "false") return;
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

  function initPhotoGallery(root) {
    const card = root && root.querySelector(".p-card");
    if (!card) return;
    const dialog = $(".p-photo-lightbox", card);
    if (!dialog || dialog.dataset.galleryReady === "true") return;
    dialog.dataset.galleryReady = "true";
    const image = $("img", dialog);
    const caption = $(".p-photo-lightbox-caption", dialog);
    const closeButton = $(".p-photo-lightbox-close", dialog);
    function closeDialog() {
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
      else dialog.removeAttribute("open");
    }
    // Use delegation because signed image URLs are filled in after the proposal renders.
    // Preview galleries have local blob URLs already; reveal them as soon as decoding completes.
    $$(".p-photo-open img", card).forEach(existingImage => {
      const button = existingImage.closest(".p-photo-open");
      if (button && existingImage.complete && existingImage.naturalWidth > 0) button.classList.add("is-loaded");
      existingImage.addEventListener("load", () => button && button.classList.add("is-loaded"), { once: true });
      existingImage.addEventListener("error", () => {
        if (button) {
          button.classList.add("p-photo-load-failed");
          button.classList.remove("is-loaded");
        }
      }, { once: true });
    });
    card.addEventListener("click", event => {
      const button = event.target && event.target.closest ? event.target.closest("[data-photo-open]") : null;
      if (!button || !card.contains(button) || !image || !button.dataset.photoUrl) return;
      image.src = button.dataset.photoUrl;
      image.alt = button.dataset.photoAlt || "Memory";
      if (caption) caption.textContent = button.dataset.photoCaption || "";
      if (typeof dialog.showModal === "function") {
        try { dialog.showModal(); } catch (_) { dialog.setAttribute("open", ""); }
      } else {
        dialog.setAttribute("open", "");
      }
    });
    if (closeButton) closeButton.addEventListener("click", closeDialog);
    dialog.addEventListener("click", event => {
      if (event.target === dialog) closeDialog();
    });
    dialog.addEventListener("close", () => {
      if (image) image.removeAttribute("src");
      if (caption) caption.textContent = "";
    });
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
    const photoInput = $("#proposal-photos");
    const photoEditor = $("#photo-selection-preview");
    let selectedPhotos = [];

    function updatePageCountLabels() {
      if (!pageCount) return;
      Array.from(pageCount.options).forEach(option => {
        const count = Math.max(0, Number(option.value) || 0);
        const total = count + 2 + (selectedPhotos.length ? 1 : 0);
        const label = count === 0 ? "No extra question pages" : count + " extra question " + (count === 1 ? "page" : "pages");
        option.textContent = label + " (" + total + " total)";
      });
    }
    function releasePhotoPreviews() {
      selectedPhotos.forEach(photo => {
        if (photo.previewUrl) URL.revokeObjectURL(photo.previewUrl);
      });
    }
    function renderPhotoEditor() {
      if (!photoEditor) return;
      photoEditor.innerHTML = selectedPhotos.map((photo, index) =>
        '<div class="p-photo-editor-item"><img src="' + escapeText(photo.previewUrl) + '" alt="Selected photo ' + (index + 1) + '">' +
        '<div class="p-field"><label for="photo-caption-' + index + '">Caption (optional)</label><input id="photo-caption-' + index + '" data-photo-caption="' + index + '" maxlength="120" placeholder="A little note about this memory" value="' + escapeText(photo.caption || "") + '"></div>' +
        '<button type="button" class="p-button ghost p-photo-remove" data-photo-remove="' + index + '">Remove</button></div>'
      ).join("");
      $$("[data-photo-caption]", photoEditor).forEach(input => input.addEventListener("input", () => {
        const photo = selectedPhotos[Number(input.dataset.photoCaption)];
        if (photo) photo.caption = input.value.slice(0, 120);
        renderDraft();
      }));
      $$("[data-photo-remove]", photoEditor).forEach(button => button.addEventListener("click", () => {
        const index = Number(button.dataset.photoRemove);
        const photo = selectedPhotos[index];
        if (photo && photo.previewUrl) URL.revokeObjectURL(photo.previewUrl);
        selectedPhotos.splice(index, 1);
        if (photoInput) photoInput.value = "";
        renderPhotoEditor();
        updatePageCountLabels();
        renderExtraPageEditors();
      }));
    }
    function renderExtraPageEditors() {
      if (!pageCount || !pageEditor) return;
      const count = Math.max(0, Math.min(3, Number(pageCount.value) || 0));
      const previous = $$(".p-extra-page-editor", pageEditor).map(el => ({ question: $("[data-extra-question]", el).value, message: $("[data-extra-message]", el).value }));
      const pageOffset = selectedPhotos.length ? 1 : 0;
      pageEditor.innerHTML = Array.from({ length: count }, (_, index) => {
        const item = previous[index] || {};
        return '<div class="p-extra-page-editor"><h3>Extra question page ' + (index + 2 + pageOffset) + '</h3><div class="p-field"><label>Question</label><input data-extra-question maxlength="180" placeholder="What else would you like to ask?" value="' + escapeText(item.question || "") + '"></div><div class="p-field"><label>Message (optional)</label><textarea data-extra-message maxlength="500" rows="2" placeholder="Add a little context…">' + escapeText(item.message || "") + '</textarea></div></div>';
      }).join("");
      pageEditor.querySelectorAll("input,textarea").forEach(el => el.addEventListener("input", renderDraft));
      renderDraft();
    }
    pageCount?.addEventListener("change", renderExtraPageEditors);
    photoInput?.addEventListener("change", () => {
      const files = Array.from(photoInput.files || []);
      if (files.some(file => !ALLOWED_PHOTO_TYPES.has(file.type) || file.size > MAX_PHOTO_BYTES)) {
        releasePhotoPreviews();
        selectedPhotos = [];
        photoInput.value = "";
        renderPhotoEditor();
        updatePageCountLabels();
        renderExtraPageEditors();
        notice("Use JPG, PNG, or WebP photos, with each file no larger than 5 MB.", "error");
        return;
      }
      releasePhotoPreviews();
      selectedPhotos = files.slice(0, MAX_PROPOSAL_PHOTOS).map(file => ({
        file,
        caption: "",
        previewUrl: URL.createObjectURL(file)
      }));
      renderPhotoEditor();
      updatePageCountLabels();
      renderExtraPageEditors();
      if (files.length > MAX_PROPOSAL_PHOTOS) {
        notice("Only the first 5 photos were selected. You can remove any photo before publishing.", "success");
      }
    });

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
        dodge_no: Boolean($("#dodge-no") && $("#dodge-no").checked),
        custom_options: {
          greeting: ($("#custom-greeting")?.value || "").trim().slice(0, 80),
          no_text: ($("#no-text")?.value || "").trim().slice(0, 40),
          accent_color: $("#accent-color")?.value || "rose",
          font_style: $("#font-style")?.value || "serif",
          effects: $("#romantic-effects") ? $("#romantic-effects").checked : true
        }
      };
    }
    function renderDraft() {
      const d = draft();
      const preview = $("#create-preview");
      const photoGallery = selectedPhotos.map(photo => ({ url: photo.previewUrl, caption: photo.caption }));
      preview.innerHTML = cardMarkup({ ...d, photo_gallery: photoGallery, status: "published" });
      initRomanticScene(preview);
      initQuestionPages(preview);
      initPhotoGallery(preview);
      $("#recipient-yes", preview).disabled = true;
      $("#recipient-no", preview).disabled = true;
    }
    form.addEventListener("input", event => {
      if (event.target.closest("#photo-selection-preview")) return;
      if (!event.target.closest("#proposal-ideas")) ideaButtons.forEach(b => { b.classList.remove("is-selected"); b.setAttribute("aria-pressed", "false"); });
      renderDraft();
    });
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const submit = $("#publish-button");
      const payload = draft();
      const missingPage = payload.question_pages.findIndex(page => !page.question);
      if (missingPage !== -1) {
        const offset = selectedPhotos.length ? 1 : 0;
        notice("Please enter a question for extra question page " + (missingPage + 2 + offset) + " or reduce the number of extra pages.", "error");
        return;
      }
      submit.disabled = true;
      const originalLabel = submit.textContent;
      submit.textContent = selectedPhotos.length ? "Uploading your photos…" : "Publishing…";
      let createdId = null;
      let customizationSaved = true;
      try {
        if (selectedPhotos.length) {
          if (!configured || !client || !currentUser) throw new Error("Please sign in before publishing photos.");
          const schemaCheck = await client.from("proposals").select("photo_gallery").limit(1);
          if (schemaCheck.error) {
            if (isMissingPhotoColumn(schemaCheck.error)) {
              throw new Error("Photo sharing needs one-time setup. Run add-proposal-photos.sql in your Supabase SQL Editor, then try again.");
            }
            throw schemaCheck.error;
          }
        }
        const created = await createProposal(payload);
        createdId = created.id;
        customizationSaved = created.customizationSaved;
        if (selectedPhotos.length) {
          try {
            await uploadProposalPhotos(createdId, selectedPhotos);
          } catch (uploadError) {
            try { await deleteProposal(createdId); }
            catch (_) { throw new Error((uploadError.message || "Photo upload failed.") + " Cleanup also failed, so please check your dashboard before publishing again."); }
            throw uploadError;
          }
        }
        location.href = "dashboard.html?created=" + encodeURIComponent(createdId) + (customizationSaved ? "" : "&customization-upgrade-needed=1");
      } catch (error) {
        notice(error.message || "Could not publish this proposal.", "error");
      } finally {
        submit.disabled = false;
        submit.textContent = originalLabel;
      }
    });
    updatePageCountLabels();
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
      await cleanupOrphanedProposalPhotos(proposals);
      const responses = await listResponses(proposals.map(p => p.id));
      $("#stat-proposals").textContent = String(proposals.length);
      $("#stat-answers").textContent = String(responses.length);
      $("#stat-open").textContent = String(proposals.filter(p => p.status === "published").length);
      const createdId = query.get("created");
      if (query.get("customization-upgrade-needed") === "1") {
        notice("Your proposal was published, but its new greeting, accent, font, and motion settings were not saved because this Supabase table needs an update. Run customize-proposals.sql in the Supabase SQL Editor, then publish again.", "error");
      }
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
        const photoCount = Array.isArray(p.photo_gallery) ? p.photo_gallery.filter(photo => photo && photo.path).length : 0;
        return '<article class="p-list-item"><div><span class="p-pill">' + (count ? count + ' response(s)' : 'Waiting for a response') + '</span><h3>' + escapeText(p.recipient_name || "A special person") + '</h3><p>' + escapeText(p.question) + '<br>Created ' + escapeText(dateLabel(p.created_at)) + '</p></div><div class="p-list-actions"><button class="p-button ghost" data-copy="' + escapeText(p.id) + '">Copy link</button><a class="p-button ghost" href="inbox.html?id=' + encodeURIComponent(p.id) + '">View replies</a>' + (photoCount ? '<button class="p-button ghost" data-optimize-photos="' + escapeText(p.id) + '">Optimize photos (' + photoCount + ')</button>' : '') + '<button class="p-button ghost" data-delete="' + escapeText(p.id) + '">Delete</button></div></article>';
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
      $$("[data-optimize-photos]").forEach(btn => btn.addEventListener("click", async () => {
        const originalLabel = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Optimizing photos…";
        try {
          const result = await optimizeExistingProposalPhotos(btn.dataset.optimizePhotos);
          btn.textContent = result.optimized
            ? "Optimized " + result.optimized + " photo(s)"
            : "Already optimized";
          if (result.cleanupWarning) btn.title = "The gallery was optimized, but old file cleanup can be retried later.";
        } catch (error) {
          btn.textContent = originalLabel;
          alert(error.message || "Could not optimize photos.");
        } finally {
          btn.disabled = false;
        }
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
      const photoMetadata = Array.isArray(proposal.photo_gallery)
        ? proposal.photo_gallery.filter(photo => photo && (photo.path || photo.url)).slice(0, MAX_PROPOSAL_PHOTOS)
        : [];
      // Start signed-URL requests without awaiting them, so the intro/Next button renders immediately.
      const photoResolution = photoMetadata.length ? resolveProposalPhotos({ ...proposal, photo_gallery: photoMetadata }) : null;
      proposal.photo_gallery = photoMetadata.map(photo => ({ ...photo, url: photo.url || "" }));
      root.innerHTML = cardMarkup(proposal);
      initRomanticScene(root);
      const card = root.querySelector(".p-card");
      initQuestionPages(root);
      initPhotoGallery(root);
      if (photoResolution) {
        photoResolution
          .then(photos => renderResolvedPhotoGallery(root, photos))
          .catch(() => renderResolvedPhotoGallery(root, photoMetadata.map(photo => ({ ...photo, url: "", failed: true }))));
      }
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
        const name = "";
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
      extra.innerHTML = '<div class="p-divider"></div><div class="p-field"><label for="recipient-message">Want to say a little more? (optional)</label><textarea id="recipient-message" maxlength="600" rows="3" placeholder="Share a note with your answer..."></textarea></div>';
      const finalPage = root.querySelector(".p-main-question-page");
      if (!finalPage) throw new Error("The final proposal page could not be initialized.");
      finalPage.appendChild(extra);
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