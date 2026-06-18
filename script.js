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
    canvasPostLoading: "Загружаю пост...",
    canvasPostLoadError: "Не получилось открыть пост.",
    closePost: "Закрыть пост",
    openPostPage: "Открыть страницу поста",
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
    canvasPostLoading: "Loading post...",
    canvasPostLoadError: "Could not open the post.",
    closePost: "Close post",
    openPostPage: "Open post page",
  },
};

let photoViewerState = null;
let homeCanvasDataPromise = null;

const homeCanvasSize = {
  width: 7000,
  height: 6600,
  centerX: 3500,
  centerY: 3300,
};

const homeCanvasThemes = [
  {
    id: "ai",
    angle: -1.62,
    color: "#7b65d8",
    label: { ru: "AI", en: "AI" },
    patterns: [/(^|\s)(ai|ии)(\s|$)/i, /gpt|openai|нейро|llm|chatgpt|midjourney|claude|генератив|agent|агент|codex/i],
  },
  {
    id: "photos",
    angle: -0.82,
    color: "#2fae91",
    label: { ru: "Фото", en: "Photos" },
    patterns: [/фото|камера|снимок|снимки|leica|iphone|hdr|объектив|пл[её]нк|фотограф|съ[её]мк/i],
  },
  {
    id: "products",
    angle: -0.08,
    color: "#2f8ad8",
    label: { ru: "Продукты", en: "Products" },
    patterns: [/продукт|стартап|сервис|прилож|пользователь|фича|запуск|подписк|монетиз|платформ|рекомендац/i],
  },
  {
    id: "design",
    angle: 0.58,
    color: "#df5c4f",
    label: { ru: "Дизайн", en: "Design" },
    patterns: [/дизайн|интерфейс|\bui\b|\bux\b|figma|шрифт|визуал|лендинг|экран|кнопк|цвет|типограф|анимац|микро/i],
  },
  {
    id: "myphotos",
    angle: 1.2,
    color: "#c7922f",
    label: { ru: "Мои фото", en: "My photos" },
    patterns: [],
  },
  {
    id: "games",
    angle: 2.42,
    color: "#6171d4",
    label: { ru: "Игры", en: "Games" },
    patterns: [/игр|\bgame\b|gaming|doom|silent hill|nintendo|playstation|xbox|steam|sekiro|dead space|гейм|mixtape|wicked/i],
  },
  {
    id: "brands",
    angle: -2.62,
    color: "#8b8780",
    label: { ru: "Бренды", en: "Brands" },
    patterns: [/бренд|\bbrand\b|nike|apple|google|teenage engineering|dyson|sony|tesla|ikea|leica|nothing|airbnb|ferrari|anthropic/i],
  },
];

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

  const homeCanvas = document.querySelector("[data-home-canvas]");
  if (homeCanvas && !homeCanvas.dataset.canvasReady) {
    homeCanvas.dataset.canvasReady = "true";
    initHomeCanvas(homeCanvas);
  }

  const barcelonaGuide = document.querySelector("[data-barcelona-guide]");
  if (barcelonaGuide && !barcelonaGuide.dataset.guideReady) {
    barcelonaGuide.dataset.guideReady = "true";
    initBarcelonaGuide(barcelonaGuide);
  }
}

async function initHomeCanvas(root) {
  const lang = currentLanguage();
  const viewport = root.querySelector("[data-canvas-viewport]");
  const surface = root.querySelector("[data-canvas-surface]");
  const toolbar = root.querySelector("[data-canvas-toolbar]");
  const fallback = root.querySelector("[data-canvas-fallback]");

  if (!viewport || !surface) return;

  try {
    const data = await loadHomeCanvasData();
    if (!root.isConnected) return;

    const items = layoutHomeCanvasItems(buildHomeCanvasItems(data, lang));
    const layers = document.createDocumentFragment();
    const nodes = document.createElement("div");

    surface.style.width = `${homeCanvasSize.width}px`;
    surface.style.height = `${homeCanvasSize.height}px`;
    surface.replaceChildren();

    nodes.className = "home-canvas-nodes";
    nodes.append(createHomeCanvasAvatar(lang));

    for (const [index, item] of items.entries()) {
      nodes.append(createHomeCanvasCard(item, index, lang));
    }

    layers.append(createHomeCanvasThemeLayer(lang), nodes);
    surface.append(layers);
    root.classList.add("is-ready");
    if (toolbar) toolbar.hidden = false;
    initHomeCanvasInteractions(root, viewport, surface, toolbar, lang);
  } catch (error) {
    root.classList.add("has-error");
    if (fallback) {
      fallback.querySelector("p").textContent =
        lang === "en" ? "Could not load the canvas yet." : "Пока не получилось загрузить карту.";
    }
    console.error(error);
  }
}

async function loadHomeCanvasData() {
  if (!homeCanvasDataPromise) {
    homeCanvasDataPromise = Promise.all([
      fetchJson("/assets/telegram/posts.json"),
      fetchJson("/assets/photos/photos.json").catch(() => ({ photos: [] })),
    ]).then(([postsData, photosData]) => ({
      posts: postsData.posts || [],
      photos: photosData.photos || [],
    }));
  }

  return homeCanvasDataPromise;
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function buildHomeCanvasItems(data, lang) {
  const postsByTheme = new Map(homeCanvasThemes.map((theme) => [theme.id, []]));
  const items = [];
  const themeLimits = {
    design: 10,
    products: 10,
    brands: 8,
    games: 8,
    ai: 8,
    photos: 7,
  };

  for (const post of data.posts || []) {
    if (!getPostText(post, lang) && !post.media?.length) continue;
    postsByTheme.get(classifyHomeCanvasPost(post, lang))?.push(post);
  }

  for (const theme of homeCanvasThemes) {
    if (theme.id === "myphotos") continue;

    const selected = selectSpread(postsByTheme.get(theme.id) || [], themeLimits[theme.id] || 9);
    for (const post of selected) {
      const text = getPostText(post, lang);
      const media = getHomePostMedia(post);
      const linkEntity = getHomePostLink(post, lang);

      items.push({
        id: `post-${post.id}`,
        kind: "post",
        themeId: theme.id,
        href: `${lang === "en" ? "/en" : ""}/screenshots/${post.id}/`,
        sourceUrl: post.telegramUrl,
        date: post.date,
        time: new Date(post.date).getTime(),
        title: homeCanvasTitle(text),
        text,
        media,
        linkEntity,
        variant: homeCanvasPostVariant(media, linkEntity, text),
      });
    }
  }

  for (const photo of selectSpread(getPhotosByUploadOrder(data.photos || []), 9)) {
    const title = photoCaption(photo, lang) || makePhotoCaption(photo, lang);
    items.push({
      id: `photo-${photo.id}`,
      kind: "photo",
      themeId: "myphotos",
      href: `${lang === "en" ? "/en" : ""}/photos/${photo.id}/`,
      date: photo.uploadedAt || photo.date,
      time: new Date(photo.uploadedAt || photo.date).getTime(),
      title,
      text: title,
      media: [
        {
          src: getHomePhotoAssetUrl(photo.src),
          width: photo.width,
          height: photo.height,
        },
      ],
      variant: "photo",
    });
  }

  return items;
}

function classifyHomeCanvasPost(post, lang) {
  const text = `${post.text || ""} ${post.translations?.en?.text || ""} ${getPostText(post, lang)}`.toLowerCase();
  let bestTheme = "products";
  let bestScore = 0;

  for (const theme of homeCanvasThemes) {
    if (theme.id === "myphotos") continue;

    const score = theme.patterns.reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0);
    if (score > bestScore) {
      bestTheme = theme.id;
      bestScore = score;
    }
  }

  return bestTheme;
}

function selectSpread(items, limit) {
  if (items.length <= limit) return items;

  const selected = new Map();
  const recentCount = Math.min(4, limit);

  for (const item of items.slice(0, recentCount)) {
    selected.set(item.id, item);
  }

  const rest = items.slice(recentCount);
  const spreadCount = limit - selected.size;

  for (let index = 0; index < spreadCount; index++) {
    const restIndex = spreadCount <= 1 ? 0 : Math.round((index * (rest.length - 1)) / (spreadCount - 1));
    const item = rest[restIndex];
    if (item) selected.set(item.id, item);
  }

  return [...selected.values()].slice(0, limit);
}

function layoutHomeCanvasItems(items) {
  const times = items.map((item) => item.time).filter((time) => Number.isFinite(time));
  const oldest = Math.min(...times);
  const newest = Math.max(...times);
  const range = newest - oldest || 1;
  const grouped = new Map();

  for (const item of items) {
    if (!grouped.has(item.themeId)) grouped.set(item.themeId, []);
    grouped.get(item.themeId).push(item);
  }

  for (const group of grouped.values()) {
    group.sort((first, second) => second.time - first.time);
  }

  const lanePattern = [0, -0.86, 0.88, -1.52, 1.46, -0.34, 0.36, -1.1, 1.08];

  return items.map((item) => {
    const theme = homeCanvasThemes.find((candidate) => candidate.id === item.themeId) || homeCanvasThemes[0];
    const group = grouped.get(item.themeId) || [];
    const themeIndex = Math.max(0, group.indexOf(item));
    const groupProgress = group.length > 1 ? themeIndex / (group.length - 1) : 0;
    const normalizedTime = Number.isFinite(item.time) ? (item.time - oldest) / range : 0.65;
    const ageProgress = clamp(1 - normalizedTime, 0, 1);
    const rayProgress = clamp(groupProgress * 0.86 + ageProgress * 0.14, 0, 1);
    const radialJitter = (homeCanvasNoise(item.id, "radial") - 0.5) * 120;
    const laneWidth = item.variant === "stack" ? 360 : item.variant === "photo" ? 310 : 260;
    const tangentJitter =
      lanePattern[themeIndex % lanePattern.length] * laneWidth + (homeCanvasNoise(item.id, "tangent") - 0.5) * 48;
    const angle = theme.angle + (homeCanvasNoise(item.id, "angle") - 0.5) * 0.045;
    const distance = clamp(680 + rayProgress * 3180 + radialJitter, 620, 3980);
    const normal = angle + Math.PI / 2;
    const x = homeCanvasSize.centerX + Math.cos(angle) * distance + Math.cos(normal) * tangentJitter;
    const y = homeCanvasSize.centerY + Math.sin(angle) * distance + Math.sin(normal) * tangentJitter;

    return {
      ...item,
      theme,
      x: clamp(x, 260, homeCanvasSize.width - 260),
      y: clamp(y, 240, homeCanvasSize.height - 240),
      rotation: (homeCanvasNoise(item.id, "rotation") - 0.5) * (item.variant === "note" ? 3 : 5),
      z: Math.round(6400 - distance) + themeIndex,
      size: homeCanvasNodeSize(item, themeIndex),
    };
  });
}

function homeCanvasNodeSize(item, index) {
  if (item.variant === "stack") return index % 2 ? "is-large" : "is-wide";
  if (item.variant === "photo") return index % 3 === 0 ? "is-tall" : "is-small";
  if (item.variant === "note") return index % 4 === 0 ? "is-large" : "is-small";
  if (item.variant === "link") return "is-small";
  return index % 5 === 0 ? "is-large" : "is-medium";
}

function createHomeCanvasThemeLayer(lang) {
  const fragment = document.createDocumentFragment();
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const labels = document.createElement("div");

  svg.classList.add("home-canvas-paths");
  svg.setAttribute("viewBox", `0 0 ${homeCanvasSize.width} ${homeCanvasSize.height}`);
  svg.setAttribute("aria-hidden", "true");
  labels.className = "home-canvas-theme-labels";

  for (const theme of homeCanvasThemes) {
    const endDistance = theme.id === "myphotos" ? 1720 : 1560;
    const endX = homeCanvasSize.centerX + Math.cos(theme.angle) * endDistance;
    const endY = homeCanvasSize.centerY + Math.sin(theme.angle) * endDistance;
    const normal = theme.angle + Math.PI / 2;
    const curve = theme.id === "products" ? -160 : (homeCanvasNoise(theme.id, "curve") - 0.5) * 320;
    const controlOneX = homeCanvasSize.centerX + Math.cos(theme.angle) * 430 + Math.cos(normal) * curve;
    const controlOneY = homeCanvasSize.centerY + Math.sin(theme.angle) * 430 + Math.sin(normal) * curve;
    const controlTwoX =
      homeCanvasSize.centerX + Math.cos(theme.angle) * (endDistance * 0.82) - Math.cos(normal) * curve * 0.55;
    const controlTwoY =
      homeCanvasSize.centerY + Math.sin(theme.angle) * (endDistance * 0.82) - Math.sin(normal) * curve * 0.55;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const label = document.createElement("div");

    path.setAttribute(
      "d",
      `M ${homeCanvasSize.centerX} ${homeCanvasSize.centerY} C ${controlOneX} ${controlOneY}, ${controlTwoX} ${controlTwoY}, ${endX} ${endY}`,
    );
    path.style.setProperty("--theme-color", theme.color);
    svg.append(path);

    label.className = "home-canvas-theme-label";
    label.textContent = theme.label[lang] || theme.label.ru;
    label.style.left = `${endX}px`;
    label.style.top = `${endY}px`;
    label.style.setProperty("--theme-color", theme.color);
    labels.append(label);
  }

  fragment.append(svg, labels);
  return fragment;
}

function createHomeCanvasAvatar(lang) {
  const avatar = document.createElement("a");
  const image = document.createElement("img");
  const caption = document.createElement("span");

  avatar.className = "home-canvas-avatar";
  avatar.href = lang === "en" ? "/en/about/" : "/about/";
  avatar.style.left = `${homeCanvasSize.centerX}px`;
  avatar.style.top = `${homeCanvasSize.centerY}px`;
  avatar.setAttribute("aria-label", lang === "en" ? "About Seryozha Tomilov" : "О Серёже Томилове");

  image.src = "/assets/og.png";
  image.alt = "";
  image.loading = "eager";
  image.decoding = "async";

  caption.textContent = "SS/84";
  avatar.append(image, caption);
  return avatar;
}

function createHomeCanvasCard(item, index, lang) {
  const link = document.createElement("a");

  link.className = `home-canvas-node is-${item.variant} ${item.size}`;
  link.href = item.href;
  link.draggable = false;
  link.dataset.homeNode = "true";
  link.style.left = `${item.x}px`;
  link.style.top = `${item.y}px`;
  link.style.setProperty("--rotation", `${item.rotation.toFixed(2)}deg`);
  link.style.setProperty("--z", String(item.z));
  link.style.setProperty("--theme-color", item.theme.color);
  link.setAttribute("aria-label", item.title || item.theme.label[lang] || item.theme.label.ru);

  if (item.variant === "stack") {
    link.append(createHomeMediaStack(item, index), createHomeCardText(item, lang, 120));
  } else if (item.variant === "media" || item.variant === "photo") {
    link.append(createHomeMediaFrame(item, index), createHomeCardText(item, lang, item.variant === "photo" ? 80 : 130));
  } else if (item.variant === "link") {
    link.append(createHomeLinkPreview(item, lang));
  } else {
    link.append(createHomeNote(item, lang));
  }

  return link;
}

function createHomeMediaStack(item, index) {
  const stack = document.createElement("div");
  stack.className = "home-canvas-media-stack";

  for (const [mediaIndex, media] of item.media.slice(0, 3).entries()) {
    stack.append(createHomeImage(media, item.title, index + mediaIndex));
  }

  return stack;
}

function createHomeMediaFrame(item, index) {
  const frame = document.createElement("div");
  frame.className = "home-canvas-media-frame";
  frame.append(createHomeImage(item.media[0], item.title, index));
  return frame;
}

function createHomeImage(media, alt, index) {
  const image = document.createElement("img");

  image.src = media.src;
  image.alt = alt || "";
  image.draggable = false;
  image.loading = index < 10 ? "eager" : "lazy";
  image.decoding = "async";

  if (media.width && media.height) {
    image.style.aspectRatio = `${media.width} / ${media.height}`;
  }

  image.addEventListener("error", () => {
    image.hidden = true;
    image.closest(".home-canvas-node")?.classList.add("has-missing-media");
  });

  return image;
}

function createHomeCardText(item, lang, maxLength) {
  const copy = document.createElement("div");
  const title = document.createElement("strong");
  const meta = document.createElement("time");

  copy.className = "home-canvas-card-copy";
  title.textContent = truncate(item.title || item.text || item.theme.label[lang], maxLength);
  meta.className = "home-canvas-date";
  meta.dateTime = item.date || "";
  meta.textContent = item.date ? formatDate(item.date, lang) : item.theme.label[lang] || item.theme.label.ru;
  copy.append(title, meta);

  return copy;
}

function createHomeLinkPreview(item, lang) {
  const preview = document.createElement("div");
  const domain = document.createElement("span");
  const title = document.createElement("strong");
  const excerpt = document.createElement("p");
  const meta = document.createElement("time");

  preview.className = "home-canvas-link-preview";
  domain.textContent = homeCanvasDomain(item.linkEntity?.href) || item.theme.label[lang] || item.theme.label.ru;
  title.textContent = truncate(item.linkEntity?.text || item.title, 78);
  excerpt.textContent = truncate(item.text, 170);
  meta.className = "home-canvas-date";
  meta.dateTime = item.date || "";
  meta.textContent = item.date ? formatDate(item.date, lang) : "";
  preview.append(domain, title, excerpt, meta);

  return preview;
}

function createHomeNote(item, lang) {
  const note = document.createElement("div");
  const text = document.createElement("p");
  const meta = document.createElement("time");

  note.className = "home-canvas-note";
  text.textContent = truncate(item.text || item.title || item.theme.label[lang], item.size === "is-large" ? 260 : 190);
  meta.className = "home-canvas-date";
  meta.dateTime = item.date || "";
  meta.textContent = item.date ? formatDate(item.date, lang) : "";
  note.append(text, meta);

  return note;
}

function initHomeCanvasInteractions(root, viewport, surface, toolbar, lang) {
  const state = {
    x: 0,
    y: 0,
    scale: homeCanvasDefaultScale(viewport),
  };
  const postOverlay = createHomeCanvasPostOverlay(root, lang);
  let pan = null;
  let nodeDrag = null;

  function applyView() {
    surface.style.setProperty("--canvas-x", `${state.x}px`);
    surface.style.setProperty("--canvas-y", `${state.y}px`);
    surface.style.setProperty("--canvas-scale", state.scale.toFixed(3));

    const reset = toolbar?.querySelector('[data-canvas-action="reset"]');
    if (reset) reset.textContent = `${Math.round(state.scale * 100)}%`;
  }

  function resetView() {
    state.scale = homeCanvasDefaultScale(viewport);
    state.x = viewport.clientWidth / 2 - homeCanvasSize.centerX * state.scale;
    state.y = viewport.clientHeight / 2 - homeCanvasSize.centerY * state.scale;
    applyView();
  }

  function zoomAt(clientX, clientY, nextScale) {
    const rect = viewport.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const contentX = (x - state.x) / state.scale;
    const contentY = (y - state.y) / state.scale;

    state.scale = clamp(nextScale, 0.22, 1.35);
    state.x = x - contentX * state.scale;
    state.y = y - contentY * state.scale;
    applyView();
  }

  resetView();

  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();

    if (event.metaKey || event.ctrlKey) {
      zoomAt(event.clientX, event.clientY, state.scale * (event.deltaY < 0 ? 1.1 : 0.9));
    } else {
      state.x -= event.deltaX;
      state.y -= event.deltaY;
      applyView();
    }
  }, { passive: false });

  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("[data-home-node]") || event.target.closest("[data-canvas-toolbar]")) {
      return;
    }

    event.preventDefault();
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add("is-panning");
    pan = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: state.x,
      y: state.y,
    };
  });

  viewport.addEventListener("pointermove", (event) => {
    if (!pan || pan.id !== event.pointerId) return;
    state.x = pan.x + event.clientX - pan.startX;
    state.y = pan.y + event.clientY - pan.startY;
    applyView();
  });

  viewport.addEventListener("pointerup", (event) => {
    if (!pan || pan.id !== event.pointerId) return;
    viewport.classList.remove("is-panning");
    pan = null;
  });

  viewport.addEventListener("pointercancel", () => {
    viewport.classList.remove("is-panning");
    pan = null;
  });

  for (const node of surface.querySelectorAll("[data-home-node]")) {
    node.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;

      event.stopPropagation();
      node.setPointerCapture(event.pointerId);
      root.classList.add("is-dragging-node");
      nodeDrag = {
        id: event.pointerId,
        node,
        startX: event.clientX,
        startY: event.clientY,
        left: parseFloat(node.style.left || "0"),
        top: parseFloat(node.style.top || "0"),
        moved: false,
      };
    });

    node.addEventListener("pointermove", (event) => {
      if (!nodeDrag || nodeDrag.id !== event.pointerId || nodeDrag.node !== node) return;

      const deltaX = (event.clientX - nodeDrag.startX) / state.scale;
      const deltaY = (event.clientY - nodeDrag.startY) / state.scale;
      nodeDrag.moved = nodeDrag.moved || Math.abs(deltaX) + Math.abs(deltaY) > 4;
      node.style.left = `${nodeDrag.left + deltaX}px`;
      node.style.top = `${nodeDrag.top + deltaY}px`;
      node.style.setProperty("--z", "7000");
    });

    node.addEventListener("pointerup", (event) => {
      if (!nodeDrag || nodeDrag.id !== event.pointerId || nodeDrag.node !== node) return;

      if (nodeDrag.moved) node.dataset.dragMoved = "true";
      root.classList.remove("is-dragging-node");
      nodeDrag = null;
    });

    node.addEventListener("pointercancel", () => {
      root.classList.remove("is-dragging-node");
      nodeDrag = null;
    });

    node.addEventListener("click", (event) => {
      if (node.dataset.dragMoved === "true") {
        event.preventDefault();
        delete node.dataset.dragMoved;
        return;
      }

      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      event.preventDefault();
      postOverlay.open(node.href, node);
    });
  }

  toolbar?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-canvas-action]");
    if (!button) return;

    const rect = viewport.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    if (button.dataset.canvasAction === "zoom-in") {
      zoomAt(centerX, centerY, state.scale * 1.14);
    } else if (button.dataset.canvasAction === "zoom-out") {
      zoomAt(centerX, centerY, state.scale * 0.86);
    } else {
      resetView();
    }
  });

  const resizeObserver = new ResizeObserver(() => {
    if (!root.isConnected) {
      resizeObserver.disconnect();
      return;
    }
    resetView();
  });

  resizeObserver.observe(viewport);
}

function createHomeCanvasPostOverlay(root, lang) {
  const strings = getUi(lang);
  const overlay = document.createElement("div");
  const scrim = document.createElement("button");
  const windowElement = document.createElement("section");
  const bar = document.createElement("div");
  const permalink = document.createElement("a");
  const close = document.createElement("button");
  const content = document.createElement("div");
  let activeRequest = 0;
  let restoreFocusTo = null;

  overlay.className = "home-canvas-post-overlay";
  overlay.hidden = true;
  overlay.dataset.canvasPostOverlay = "true";

  scrim.className = "home-canvas-post-scrim";
  scrim.type = "button";
  scrim.tabIndex = -1;
  scrim.setAttribute("aria-label", strings.closePost);

  windowElement.className = "home-canvas-post-window";
  windowElement.setAttribute("role", "dialog");
  windowElement.setAttribute("aria-modal", "true");
  windowElement.setAttribute("aria-label", lang === "en" ? "Canvas post" : "Пост на холсте");
  windowElement.tabIndex = -1;

  bar.className = "home-canvas-post-bar";

  permalink.className = "home-canvas-post-permalink";
  permalink.textContent = "↗";
  permalink.setAttribute("aria-label", strings.openPostPage);

  close.className = "home-canvas-post-close";
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", strings.closePost);

  content.className = "home-canvas-post-scroll";

  bar.append(permalink, close);
  windowElement.append(bar, content);
  overlay.append(scrim, windowElement);
  root.append(overlay);

  function closeOverlay() {
    activeRequest += 1;
    overlay.hidden = true;
    overlay.removeAttribute("data-state");
    root.classList.remove("has-post-overlay");
    content.replaceChildren();

    if (restoreFocusTo?.isConnected) {
      restoreFocusTo.focus({ preventScroll: true });
    }

    restoreFocusTo = null;
  }

  async function open(href, trigger) {
    const requestId = activeRequest + 1;
    activeRequest = requestId;
    restoreFocusTo = trigger || document.activeElement;
    permalink.href = href;
    overlay.hidden = false;
    overlay.dataset.state = "loading";
    root.classList.add("has-post-overlay");
    content.replaceChildren(createHomeCanvasPostStatus(strings.canvasPostLoading));
    close.focus({ preventScroll: true });

    try {
      const response = await fetch(href, { headers: { Accept: "text/html" } });
      if (!response.ok) throw new Error(`${href}: HTTP ${response.status}`);

      const html = await response.text();
      if (requestId !== activeRequest) return;

      const doc = new DOMParser().parseFromString(html, "text/html");
      const article = doc.querySelector(".screenshot-post, .photo-detail");
      if (!article) throw new Error(`${href}: article was not found`);

      const importedArticle = document.importNode(article, true);
      content.replaceChildren(importedArticle);
      overlay.dataset.state = "ready";
      windowElement.focus({ preventScroll: true });
    } catch (error) {
      if (requestId !== activeRequest) return;
      overlay.dataset.state = "error";
      content.replaceChildren(createHomeCanvasPostStatus(strings.canvasPostLoadError));
      console.error(error);
    }
  }

  scrim.addEventListener("click", closeOverlay);
  close.addEventListener("click", closeOverlay);

  overlay.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeOverlay();
    }
  });

  return {
    open,
    close: closeOverlay,
  };
}

function createHomeCanvasPostStatus(text) {
  const status = document.createElement("div");
  status.className = "home-canvas-post-status";
  status.textContent = text;
  return status;
}

function homeCanvasDefaultScale(viewport) {
  if (viewport.clientWidth < 560) return 0.25;
  return 0.6;
}

function getHomePostMedia(post) {
  return (post.media || [])
    .map((media) => {
      const src = media.type === "video" || media.type === "animation" ? media.poster : media.src;
      if (!src) return null;

      return {
        src: getTelegramAssetUrl(src),
        width: media.width,
        height: media.height,
      };
    })
    .filter(Boolean);
}

function getHomePhotoAssetUrl(src) {
  if (!src) return "";
  if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
    return `https://tomilov.com${src}`;
  }
  return src;
}

function getHomePostLink(post, lang) {
  return getPostEntities(post, lang).find((entity) => entity.href);
}

function homeCanvasPostVariant(media, linkEntity, text) {
  if (media.length > 1) return "stack";
  if (media.length === 1) return "media";
  if (linkEntity?.href) return "link";
  return text.length > 170 ? "note" : "link";
}

function homeCanvasTitle(text) {
  const [firstLine] = normalizeText(text).split(/\n+/);
  return firstLine || normalizeText(text);
}

function homeCanvasDomain(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function homeCanvasNoise(value, salt) {
  const text = `${value}:${salt}`;
  let hash = 2166136261;

  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return ((hash >>> 0) % 10000) / 10000;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
    const [singleMedia] = post.media;
    const isSinglePortrait =
      post.media.length === 1 &&
      (singleMedia.type === "photo" || singleMedia.type === "sticker") &&
      singleMedia.width &&
      singleMedia.height &&
      singleMedia.height > singleMedia.width;

    if (isSinglePortrait) {
      article.classList.add("has-single-portrait");
    }

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
