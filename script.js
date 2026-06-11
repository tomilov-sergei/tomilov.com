const telegramMediaBase = "https://s3.twcstorage.ru/00df5bd5-137f-492a-8d95-c7ee2cc2d851";
const storedLanguageKey = "tomilov-language";

const ui = {
  ru: {
    postsEmpty: "Постов пока нет.",
    postsLoadError: "Не получилось загрузить архив.",
    photosEmpty: "Фотографий пока нет.",
    photosLoadError: "Не получилось загрузить фотографии.",
    openPhoto: "Открыть фото",
    watchVideo: "Смотреть видео",
    filmCamera: "Leica M6 — плёнка",
    filmPhoto: "Плёночная фотография",
    fit: "Вписать",
    actual: "100%",
  },
  en: {
    postsEmpty: "No posts yet.",
    postsLoadError: "Could not load the archive.",
    photosEmpty: "No photos yet.",
    photosLoadError: "Could not load photos.",
    openPhoto: "Open photo",
    watchVideo: "Watch video",
    filmCamera: "Leica M6 — film",
    filmPhoto: "Film photograph",
    fit: "Fit",
    actual: "100%",
  },
};

let photoViewerState = null;

document.addEventListener("click", (event) => {
  const languageLink = event.target.closest("[data-language-link]");
  if (languageLink) {
    handleLanguageClick(event, languageLink);
    return;
  }

  const photoTrigger = event.target.closest("[data-photo-index]");
  if (photoTrigger) {
    event.preventDefault();
    openPhoto(Number(photoTrigger.dataset.photoIndex || 0));
    return;
  }

  const youtubeTrigger = event.target.closest("[data-youtube]");
  if (youtubeTrigger) {
    activateYouTube(youtubeTrigger);
  }
});

window.addEventListener("popstate", () => {
  swapPage(location.href, { push: false, remember: false }).catch(() => {
    location.reload();
  });
});

initPage();
applySavedLanguage();

function initPage() {
  updateLanguageSwitcherState();

  const feed = document.querySelector("[data-telegram-feed]");
  if (feed && !feed.dataset.feedReady) {
    feed.dataset.feedReady = "true";
    initTelegramFeed(feed);
  }

  const photoFeed = document.querySelector("[data-photo-feed]");
  if (photoFeed && !photoFeed.dataset.feedReady) {
    photoFeed.dataset.feedReady = "true";
    initPhotoFeed(photoFeed);
  }

  const barcelonaGuide = document.querySelector("[data-barcelona-guide]");
  if (barcelonaGuide && !barcelonaGuide.dataset.guideReady) {
    barcelonaGuide.dataset.guideReady = "true";
    initBarcelonaGuide(barcelonaGuide);
  }
}

function initBarcelonaGuide(root) {
  const search = root.querySelector("[data-guide-search]");
  const filters = Array.from(root.querySelectorAll("[data-guide-filter]"));
  const queryButtons = Array.from(root.querySelectorAll("[data-guide-query]"));
  const reset = root.querySelector("[data-guide-reset]");
  const cards = Array.from(root.querySelectorAll("[data-guide-place]"));
  const empty = root.querySelector("[data-guide-empty]");
  let activeFilter = "all";

  for (const card of cards) {
    ensureGuidePlacePreview(card);
  }

  const grid = root.querySelector(".guide-grid");
  if (grid) {
    cards
      .sort((first, second) => guideRank(first) - guideRank(second))
      .forEach((card) => grid.append(card));
  }

  function applyFilters() {
    const needle = normalizeGuideText(search?.value);
    let shown = 0;

    for (const card of cards) {
      const categories = (card.dataset.categories || "").split(/\s+/).filter(Boolean);
      const categoryMatch = activeFilter === "all" || categories.includes(activeFilter);
      const haystack = normalizeGuideText(`${card.textContent} ${card.dataset.search || ""}`);
      const searchMatch = !needle || haystack.includes(needle);
      const isVisible = categoryMatch && searchMatch;

      card.hidden = !isVisible;
      if (isVisible) shown++;
    }

    if (empty) {
      empty.hidden = shown > 0;
    }
  }

  function setActiveFilter(nextFilter) {
    activeFilter = nextFilter;
    for (const item of filters) {
      item.setAttribute("aria-pressed", item.dataset.guideFilter === activeFilter ? "true" : "false");
    }
  }

  function resetQuickButtons() {
    for (const button of queryButtons) {
      button.setAttribute("aria-pressed", "false");
    }
  }

  for (const filter of filters) {
    filter.addEventListener("click", () => {
      setActiveFilter(filter.dataset.guideFilter || "all");
      resetQuickButtons();
      applyFilters();
    });
  }

  for (const button of queryButtons) {
    button.addEventListener("click", () => {
      if (search) search.value = button.dataset.guideQuery || "";
      setActiveFilter("all");
      resetQuickButtons();
      button.setAttribute("aria-pressed", "true");
      applyFilters();
    });
  }

  for (const routeLink of root.querySelectorAll(".guide-route-steps a[href^=\"#\"]")) {
    routeLink.addEventListener("click", () => {
      setActiveFilter("all");
      if (search) search.value = "";
      resetQuickButtons();
      applyFilters();
    });
  }

  search?.addEventListener("input", () => {
    resetQuickButtons();
    applyFilters();
  });

  reset?.addEventListener("click", () => {
    setActiveFilter("all");
    if (search) search.value = "";
    resetQuickButtons();
    applyFilters();
    search?.focus();
  });

  search?.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      search.value = "";
      resetQuickButtons();
      applyFilters();
    }
  });

  applyFilters();
}

function normalizeGuideText(value) {
  return normalizeText(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function guideRank(card) {
  const value = Number(card.dataset.guideRank);
  return Number.isFinite(value) ? value : 999;
}

function ensureGuidePlacePreview(card) {
  if (card.querySelector(".guide-place-preview")) return;

  const mapLink = card.querySelector(".guide-map-link");
  const map = card.querySelector(".guide-map");
  if (!mapLink || !map) return;

  const title = normalizeText(card.querySelector("h2")?.textContent);
  const address = normalizeText(card.querySelector(".guide-address")?.textContent);
  const imageSrc = normalizeText(card.dataset.image);
  const categories = (card.dataset.categories || "").split(/\s+/).filter(Boolean);
  const category = categories[0] || "place";
  const theme = guidePreviewTheme(categories);
  const preview = document.createElement("a");
  preview.className = "guide-place-preview";
  preview.href = mapLink.href;
  preview.target = "_blank";
  preview.rel = "noopener";
  preview.dataset.previewTheme = theme;
  preview.setAttribute("aria-label", `${title}: открыть в Google Maps`);

  const visual = document.createElement("div");
  visual.className = "guide-preview-visual";

  if (imageSrc) {
    const image = document.createElement("img");
    image.className = "guide-preview-image";
    image.src = imageSrc;
    image.loading = "lazy";
    image.decoding = "async";
    image.alt = title;
    visual.append(image);
  }

  const badge = document.createElement("span");
  badge.className = "guide-preview-badge";
  badge.textContent = mapLink.hostname.replace(/^www\./, "");
  visual.append(badge);

  const caption = document.createElement("div");
  caption.className = "guide-preview-caption";

  const previewTitle = document.createElement("strong");
  previewTitle.className = "guide-preview-title";
  previewTitle.textContent = compactText([title, "Barcelona"]);

  const subtitle = document.createElement("span");
  subtitle.className = "guide-preview-subtitle";
  subtitle.textContent = compactText([guideCategoryLabel(category), address]);

  caption.append(previewTitle, subtitle);
  preview.append(visual, caption);
  card.insertBefore(preview, map);
}

function guidePreviewTheme(categories) {
  for (const theme of ["culture", "food", "coffee", "shop", "walk", "bar"]) {
    if (categories.includes(theme)) return theme;
  }
  return "place";
}

function guideCategoryLabel(category) {
  const labels = {
    bar: "Places, Bar",
    coffee: "Places, Coffee",
    culture: "Places, Culture",
    food: "Places, Food",
    shop: "Places, Shopping",
    walk: "Places, Navigation & Traffic",
  };

  return labels[category] || "Places, Navigation & Traffic";
}

function currentLanguage() {
  const page = document.querySelector("[data-page-lang]");
  if (page?.dataset.pageLang) return page.dataset.pageLang;
  return location.pathname.startsWith("/en/") || location.pathname === "/en" ? "en" : "ru";
}

function getUi(lang = currentLanguage()) {
  return ui[lang] || ui.ru;
}

function handleLanguageClick(event, link) {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;

  event.preventDefault();
  const lang = link.dataset.lang || "ru";
  localStorage.setItem(storedLanguageKey, lang);

  swapPage(link.href, { push: true, remember: true }).catch(() => {
    window.location.href = link.href;
  });
}

function applySavedLanguage() {
  const saved = localStorage.getItem(storedLanguageKey);
  if (!saved || saved === currentLanguage()) return;

  const link = document.querySelector(`[data-language-link][data-lang="${saved}"]`);
  if (!link) return;

  swapPage(link.href, { push: false, replace: true, remember: false }).catch(() => {});
}

async function swapPage(url, options = {}) {
  const nextUrl = new URL(url, location.href);
  if (nextUrl.origin !== location.origin) {
    window.location.href = nextUrl.href;
    return;
  }

  const response = await fetch(nextUrl.href, {
    headers: { Accept: "text/html" },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  const nextDocument = new DOMParser().parseFromString(html, "text/html");
  const nextBody = nextDocument.body;

  if (!nextBody?.children.length) {
    throw new Error("empty_document");
  }

  document.documentElement.lang = nextDocument.documentElement.lang || document.documentElement.lang;
  replaceHead(nextDocument);
  replaceBody(nextBody);

  if (options.push) {
    history.pushState({}, "", nextUrl.href);
  } else if (options.replace) {
    history.replaceState({}, "", nextUrl.href);
  }

  if (options.remember) {
    localStorage.setItem(storedLanguageKey, currentLanguage());
  }

  initPage();
  window.scrollTo({ top: 0, behavior: "auto" });
}

function replaceHead(nextDocument) {
  document.title = nextDocument.title;

  const selectors = [
    'meta[name="description"]',
    'meta[property^="og:"]',
    'meta[name^="twitter:"]',
    'meta[property^="article:"]',
    'link[rel="canonical"]',
    'link[rel="alternate"]',
    'link[rel="license"]',
    'script[type="application/ld+json"]',
  ];

  document.head.querySelectorAll(selectors.join(",")).forEach((node) => node.remove());

  for (const node of nextDocument.head.querySelectorAll(selectors.join(","))) {
    document.head.append(document.importNode(node, true));
  }
}

function replaceBody(nextBody) {
  for (const attribute of [...document.body.attributes]) {
    document.body.removeAttribute(attribute.name);
  }

  for (const attribute of [...nextBody.attributes]) {
    document.body.setAttribute(attribute.name, attribute.value);
  }

  document.body.replaceChildren(...[...nextBody.childNodes].map((node) => document.importNode(node, true)));
}

function updateLanguageSwitcherState() {
  const lang = currentLanguage();

  for (const link of document.querySelectorAll("[data-language-link]")) {
    if (link.dataset.lang === lang) {
      link.setAttribute("aria-current", "true");
    } else {
      link.removeAttribute("aria-current");
    }
  }
}

function activateYouTube(trigger) {
  const videoId = trigger.getAttribute("data-youtube");
  const title = trigger.getAttribute("aria-label") || "YouTube video";
  const iframe = document.createElement("iframe");

  iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`;
  iframe.title = title;
  iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  iframe.allowFullscreen = true;

  trigger.replaceChildren(iframe);
  trigger.classList.add("is-playing");
}

async function initTelegramFeed(feedElement) {
  const lang = currentLanguage();
  const strings = getUi(lang);
  const status = document.querySelector("[data-feed-status]");
  const loadMore = document.querySelector("[data-load-more]");
  const batchSize = 18;
  let posts = [];
  let rendered = 0;

  try {
    const response = await fetch("/assets/telegram/posts.json");

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    posts = data.posts || [];

    if (!posts.length) {
      if (status) status.textContent = strings.postsEmpty;
      return;
    }

    status?.remove();
    renderNextBatch();
    loadMore?.addEventListener("click", renderNextBatch);
  } catch (error) {
    if (status) status.textContent = strings.postsLoadError;
    console.error(error);
  }

  function renderNextBatch() {
    const fragment = document.createDocumentFragment();
    const nextPosts = posts.slice(rendered, rendered + batchSize);

    for (const post of nextPosts) {
      fragment.append(createPost(post, lang));
    }

    feedElement.append(fragment);
    rendered += nextPosts.length;

    if (loadMore) {
      loadMore.hidden = rendered >= posts.length;
    }
  }
}

function createPost(post, lang) {
  const article = document.createElement("article");
  article.className = "screenshot-post";
  article.id = `post-${post.id}`;

  if (post.media?.length) {
    article.append(createMedia(post.media, post, lang));
  }

  const body = document.createElement("div");
  body.className = "screenshot-body";

  const postText = getPostText(post, lang);
  if (postText) {
    const text = document.createElement("div");
    text.className = "screenshot-text";
    appendRichText(text, post, lang);
    body.append(text);
  }

  const meta = document.createElement("div");
  meta.className = "screenshot-meta";

  const link = document.createElement("a");
  link.className = "screenshot-date";
  link.href = post.telegramUrl;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = formatDate(post.date, lang);
  meta.append(link);

  if (post.reactions?.length) {
    const reactions = document.createElement("div");
    reactions.className = "screenshot-reactions";

    for (const reaction of post.reactions) {
      const item = document.createElement("span");
      item.textContent = `${reaction.emoji} ${reaction.count}`;
      reactions.append(item);
    }

    meta.append(reactions);
  }

  body.append(meta);
  article.append(body);

  return article;
}

function createMedia(mediaItems, post, lang) {
  const wrapper = document.createElement("div");
  wrapper.className = `screenshot-media${mediaItems.length > 1 ? " is-grid" : " is-single"}`;

  for (const [index, media] of mediaItems.entries()) {
    const item = document.createElement("div");
    item.className = "screenshot-media-item";

    if (media.type === "photo" || media.type === "sticker") {
      item.classList.add("is-image");

      if (media.width && media.height) {
        item.style.aspectRatio = `${media.width} / ${media.height}`;
      }

      const img = document.createElement("img");
      img.src = getTelegramAssetUrl(media.src);
      img.loading = "lazy";
      img.decoding = "async";
      img.alt = mediaAlt(post, index, lang);
      item.append(img);
    } else if (media.type === "video" || media.type === "animation") {
      item.classList.add("is-video");
      item.append(createVideoPreview(media, lang));
    }

    wrapper.append(item);
  }

  return wrapper;
}

function createVideoPreview(media, lang) {
  const trigger = document.createElement("button");
  trigger.className = "screenshot-video-preview";
  trigger.type = "button";
  trigger.setAttribute("aria-label", getUi(lang).watchVideo);

  if (media.poster) {
    const poster = document.createElement("img");
    poster.className = "screenshot-video-poster";
    poster.src = getTelegramAssetUrl(media.poster);
    poster.loading = "lazy";
    poster.decoding = "async";
    poster.alt = "";
    trigger.append(poster);
  }

  const play = document.createElement("span");
  play.className = "screenshot-video-play";
  play.setAttribute("aria-hidden", "true");
  trigger.append(play);

  trigger.addEventListener("click", () => {
    const video = document.createElement("video");
    video.src = getTelegramAssetUrl(media.src);
    video.controls = true;
    video.autoplay = true;
    video.preload = "metadata";
    video.playsInline = true;

    if (media.poster) {
      video.poster = getTelegramAssetUrl(media.poster);
    }

    if (media.type === "animation") {
      video.loop = true;
      video.muted = true;
    }

    trigger.replaceWith(video);
    video.play?.().catch(() => {});
  });

  return trigger;
}

function getTelegramAssetUrl(src) {
  if (!src?.startsWith("/assets/telegram/")) {
    return src;
  }

  return `${telegramMediaBase}${src}`;
}

function appendRichText(container, post, lang) {
  const text = getPostText(post, lang);
  const entities = getPostEntities(post, lang);
  const entityText = entities.map((entity) => entity.text).join("");

  if (!entities.length || entityText !== text) {
    container.textContent = text;
    return;
  }

  for (const entity of entities) {
    if (entity.type === "text_link" && entity.href) {
      const link = document.createElement("a");
      link.href = entity.href;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = entity.text;
      container.append(link);
    } else {
      container.append(document.createTextNode(entity.text));
    }
  }
}

function getPostText(post, lang) {
  if (lang === "en") {
    const value = normalizeText(post.translations?.en?.text);
    if (value) return value;
  }

  return normalizeText(post.text);
}

function getPostEntities(post, lang) {
  if (lang === "en" && Array.isArray(post.translations?.en?.entities)) {
    return post.translations.en.entities;
  }

  return post.entities || [];
}

function mediaAlt(post, index, lang) {
  const title = truncate(getPostText(post, lang), 90);
  if (!title) return "";
  return index === 0 ? title : `${title}, ${lang === "en" ? "media" : "медиа"} ${index + 1}`;
}

async function initPhotoFeed(feedElement) {
  const lang = currentLanguage();
  const strings = getUi(lang);
  const status = document.querySelector("[data-photo-status]");
  const hasStaticFeed = feedElement.hasAttribute("data-static-photo-feed");

  try {
    const response = await fetch("/assets/photos/photos.json", { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const photos = getPhotosByUploadOrder(data.photos || []);

    if (!photos.length) {
      if (status) {
        status.textContent = strings.photosEmpty;
      }
      return;
    }

    feedElement.replaceChildren();
    feedElement.removeAttribute("data-static-photo-feed");
    status?.remove();
    renderPhotos(feedElement, photos, lang);
    initPhotoViewer(photos, lang);
  } catch (error) {
    if (status) {
      status.textContent = strings.photosLoadError;
    } else if (!hasStaticFeed) {
      feedElement.textContent = strings.photosLoadError;
    }
    console.error(error);
  }
}

function renderPhotos(feedElement, photos, lang) {
  const fragment = document.createDocumentFragment();

  for (const [index, photo] of photos.entries()) {
    fragment.append(createPhotoCard(photo, index, lang));
  }

  feedElement.append(fragment);
}

function getPhotosByUploadOrder(photos) {
  return [...photos].sort((first, second) => getPhotoUploadKey(second).localeCompare(getPhotoUploadKey(first)));
}

function getPhotoUploadKey(photo) {
  return photo.uploadedAt || photo.id || photo.date || "";
}

function createPhotoCard(photo, index, lang) {
  const article = document.createElement("article");
  article.className = "photo-entry";

  const button = document.createElement("button");
  button.className = "photo-card";
  button.type = "button";
  button.dataset.photoIndex = String(index);
  button.setAttribute("aria-label", photoAlt(photo, lang) || `${getUi(lang).openPhoto} ${index + 1}`);

  if (photo.width && photo.height) {
    button.style.aspectRatio = `${photo.width} / ${photo.height}`;
  }

  const img = document.createElement("img");
  img.src = photo.src;
  img.loading = index < 4 ? "eager" : "lazy";
  img.decoding = "async";
  img.alt = photoAlt(photo, lang);
  button.append(img);

  if (photo.hdr) {
    const badge = document.createElement("span");
    badge.className = "photo-hdr-badge";
    badge.textContent = "HDR";
    button.append(badge);
  }

  article.append(button, createPhotoInfo(photo, lang));

  return article;
}

function createPhotoInfo(photo, lang) {
  const technical = photo.technical || {};
  const wrapper = document.createElement("div");
  wrapper.className = "photo-info";

  const header = document.createElement("div");
  header.className = "photo-info-header";

  const title = document.createElement("strong");
  title.textContent = technical.cameraLine || getUi(lang).filmCamera;
  header.append(title);

  wrapper.append(header);

  const body = document.createElement("div");
  body.className = "photo-info-body";

  const lens = document.createElement("p");
  lens.textContent = technical.lensLine || getUi(lang).filmPhoto;
  body.append(lens);

  const summary = document.createElement("p");
  summary.textContent = technical.summary || compactText([formatDimensions(photo), formatFileSize(photo.size)]);
  body.append(summary);

  const locationLabel = photoLocation(photo, lang);

  if (locationLabel) {
    const locationLine = document.createElement("p");
    locationLine.className = "photo-location";
    locationLine.textContent = locationLabel;
    body.append(locationLine);
  }

  wrapper.append(body);

  const settings = (technical.settings || []).filter((item) => item.value);

  if (settings.length) {
    const settingsRow = document.createElement("div");
    settingsRow.className = "photo-settings";

    for (const setting of settings) {
      const item = document.createElement("span");
      item.textContent = setting.label === "ISO" ? `ISO ${setting.value}` : setting.value;
      settingsRow.append(item);
    }

    wrapper.append(settingsRow);
  }

  return wrapper;
}

function initPhotoViewer(photos, lang) {
  const dialog = document.querySelector("[data-photo-dialog]");
  const image = document.querySelector("[data-photo-dialog-image]");
  const caption = document.querySelector("[data-photo-dialog-caption]");
  const close = document.querySelector("[data-photo-close]");
  const prev = document.querySelector("[data-photo-prev]");
  const next = document.querySelector("[data-photo-next]");
  const actual = document.querySelector("[data-photo-actual]");

  if (!dialog || !image || !caption) return;

  photoViewerState = {
    photos,
    lang,
    dialog,
    image,
    caption,
    actual,
    activeIndex: 0,
    isActualSize: false,
  };

  close?.addEventListener("click", () => dialog.close());
  prev?.addEventListener("click", () => openPhoto(photoViewerState.activeIndex - 1));
  next?.addEventListener("click", () => openPhoto(photoViewerState.activeIndex + 1));
  actual?.addEventListener("click", () => setActualSize(!photoViewerState.isActualSize));
  image.addEventListener("click", () => setActualSize(!photoViewerState.isActualSize));

  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      openPhoto(photoViewerState.activeIndex - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      openPhoto(photoViewerState.activeIndex + 1);
    }
  });

  dialog.addEventListener("close", () => {
    image.removeAttribute("src");
    setActualSize(false);
  });
}

function openPhoto(index) {
  if (!photoViewerState?.photos.length) return;

  const state = photoViewerState;
  state.activeIndex = (index + state.photos.length) % state.photos.length;
  const photo = state.photos[state.activeIndex];

  setActualSize(false);
  state.image.src = photo.src;
  state.image.alt = photoAlt(photo, state.lang);
  state.caption.textContent = photoCaption(photo, state.lang) || makePhotoCaption(photo, state.lang);

  if (photo.width && photo.height) {
    state.image.style.aspectRatio = `${photo.width} / ${photo.height}`;
  } else {
    state.image.style.removeProperty("aspect-ratio");
  }

  if (!state.dialog.open) {
    state.dialog.showModal();
  }
}

function setActualSize(value) {
  if (!photoViewerState) return;

  photoViewerState.isActualSize = value;
  photoViewerState.dialog.classList.toggle("is-actual-size", value);
  if (photoViewerState.actual) {
    photoViewerState.actual.textContent = value ? getUi(photoViewerState.lang).fit : getUi(photoViewerState.lang).actual;
  }
}

function makePhotoCaption(photo, lang) {
  const technical = photo.technical || {};

  return compactText([
    technical.cameraLine,
    technical.lensLine,
    photoLocation(photo, lang),
    formatDate(photo.date, lang),
  ]);
}

function photoCaption(photo, lang) {
  if (lang === "en") {
    const value = normalizeText(photo.translations?.en?.caption);
    if (value) return value;
  }

  return normalizeText(photo.caption);
}

function photoAlt(photo, lang) {
  if (lang === "en") {
    const value = normalizeText(photo.translations?.en?.alt);
    if (value) return value;
  }

  return normalizeText(photo.alt) || photoCaption(photo, lang) || makePhotoCaption(photo, lang);
}

function photoLocation(photo, lang) {
  if (lang === "en") {
    const value = normalizeLocationLabel(photo.translations?.en?.locationLabel || photo.translations?.en?.location);
    if (value) return value;
  }

  const location = photo.location || {};
  return normalizeLocationLabel(location.label || location.name);
}

function compactText(values) {
  return values.filter(Boolean).join(" · ");
}

function formatDimensions(photo) {
  return photo.width && photo.height ? `${photo.width} × ${photo.height}` : "";
}

function formatFileSize(value) {
  if (!value) return "";
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function normalizeLocationLabel(value) {
  if (!value) return "";

  const text = String(value).trim();
  const normalized = text.toLowerCase().replace(/^локация:?\s*/, "");

  if (!text || normalized === "не указана" || /^-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?$/.test(text)) {
    return "";
  }

  return text;
}

function normalizeText(value) {
  return value == null ? "" : String(value).trim();
}

function truncate(value, maxLength) {
  if (!value || value.length <= maxLength) return value || "";
  return `${value.slice(0, maxLength - 1).trim()}…`;
}

function formatDate(value, lang = currentLanguage()) {
  return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}
