const telegramMediaBase = "https://s3.twcstorage.ru/00df5bd5-137f-492a-8d95-c7ee2cc2d851";
const storedLanguageKey = "tomilov-language";

const ui = {
  ru: {
    postsEmpty: "Постов пока нет.",
    postsLoadError: "Не получилось загрузить архив.",
    photosEmpty: "Фотографий пока нет.",
    photosLoadError: "Не получилось загрузить фотографии.",
    openPhoto: "Открыть фото",
    viewer: "Просмотр фотографии",
    previousPhoto: "Предыдущее фото",
    nextPhoto: "Следующее фото",
    closePhoto: "Закрыть",
    allTechniques: "Все",
    filmTechnique: "Плёнка",
    iphoneTechnique: "iPhone",
    watchVideo: "Смотреть видео",
    filmCamera: "Leica M6 — плёнка",
    filmPhoto: "Плёночная фотография",
    fit: "Вписать",
    actual: "Увеличить",
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
    viewer: "Photo viewer",
    previousPhoto: "Previous photo",
    nextPhoto: "Next photo",
    closePhoto: "Close",
    allTechniques: "All",
    filmTechnique: "Film",
    iphoneTechnique: "iPhone",
    watchVideo: "Watch video",
    filmCamera: "Leica M6 — film",
    filmPhoto: "Film photograph",
    fit: "Fit",
    actual: "Zoom",
    canvasPostLoading: "Loading post...",
    canvasPostLoadError: "Could not open the post.",
    closePost: "Close post",
    openPostPage: "Open post page",
  },
};

let photoViewerState = null;
let photoViewerScrollLockState = null;

const photoViewerSwipeCloseThreshold = 72;
const photoViewerSwipeDirectionRatio = 1.25;

const homeCanvasSize = {
  width: 7000,
  height: 6600,
  centerX: 3500,
  centerY: 3300,
};
const homeCanvasZoomAnimationMs = 240;
const homeCanvasView = {
  minScale: 0.12,
  maxScale: 2.5,
  toolbarZoomStep: 1.2,
  wheelZoomSensitivity: 0.006,
};
const homeCanvasHydration = {
  cardsPerView: 16,
  mediaPerView: 8,
  overscanRatio: 0.3,
  delayMs: 48,
};

const homeCanvasThemes = [
  {
    id: "ai",
    angle: -1.62,
    color: "#7b65d8",
    label: { ru: "AI", en: "AI" },
  },
  {
    id: "photos",
    angle: -0.82,
    color: "#2fae91",
    label: { ru: "Фото", en: "Photos" },
  },
  {
    id: "products",
    angle: -0.08,
    color: "#2f8ad8",
    label: { ru: "Продукты", en: "Products" },
  },
  {
    id: "design",
    angle: 0.58,
    color: "#df5c4f",
    label: { ru: "Дизайн", en: "Design" },
  },
  {
    id: "myphotos",
    angle: 1.2,
    color: "#c7922f",
    label: { ru: "Мои фото", en: "My photos" },
  },
  {
    id: "games",
    angle: 2.42,
    color: "#6171d4",
    label: { ru: "Игры", en: "Games" },
  },
  {
    id: "brands",
    angle: -2.62,
    color: "#8b8780",
    label: { ru: "Бренды", en: "Brands" },
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

  const screenshotImageTrigger = event.target.closest("[data-screenshot-image]");
  if (screenshotImageTrigger) {
    event.preventDefault();
    const image = screenshotImageTrigger.querySelector("img");
    if (image) openScreenshotImage(image);
    return;
  }

  const screenshotImage = event.target.closest(".screenshot-media-item.is-image > img");
  if (screenshotImage) {
    event.preventDefault();
    openScreenshotImage(screenshotImage);
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

function initHomeCanvas(root) {
  const lang = currentLanguage();
  const viewport = root.querySelector("[data-canvas-viewport]");
  const surface = root.querySelector("[data-canvas-surface]");
  const toolbar = root.querySelector("[data-canvas-toolbar]");
  const nodes = surface?.querySelector("[data-canvas-nodes]");

  if (!viewport || !surface || !nodes) return;

  const canvasSize = readHomeCanvasSize(surface);
  surface.prepend(createHomeCanvasThemeLayer(lang, canvasSize));
  root.classList.add("is-ready");
  if (toolbar) toolbar.hidden = false;

  const visibility = initHomeCanvasVisibility(viewport, surface);
  initHomeCanvasInteractions(root, viewport, surface, toolbar, lang, canvasSize, visibility.update);
}

function readHomeCanvasSize(surface) {
  return {
    width: Number(surface.dataset.canvasWidth) || homeCanvasSize.width,
    height: Number(surface.dataset.canvasHeight) || homeCanvasSize.height,
    centerX: Number(surface.dataset.canvasCenterX) || homeCanvasSize.centerX,
    centerY: Number(surface.dataset.canvasCenterY) || homeCanvasSize.centerY,
  };
}

function initHomeCanvasVisibility(viewport, surface) {
  const nodes = [...surface.querySelectorAll("[data-home-node]")].map((node) => ({
    node,
    x: Number(node.dataset.canvasX),
    y: Number(node.dataset.canvasY),
    width: Number(node.dataset.canvasWidth) || 224,
    height: Number(node.dataset.canvasHeight) || 320,
  }));
  let latestState = null;
  let hydrationTimer = 0;
  let viewKey = "";
  let hydratedForView = 0;
  let mediaForView = 0;

  function hydrateVisible() {
    hydrationTimer = 0;
    if (!surface.isConnected || !latestState || latestState.scale < 0.22) return;

    const { x, y, scale } = latestState;
    const worldLeft = -x / scale;
    const worldTop = -y / scale;
    const worldWidth = viewport.clientWidth / scale;
    const worldHeight = viewport.clientHeight / scale;
    const overscan = Math.max(worldWidth, worldHeight) * homeCanvasHydration.overscanRatio;
    const centerX = worldLeft + worldWidth / 2;
    const centerY = worldTop + worldHeight / 2;
    const nextViewKey = [
      Math.round(centerX / Math.max(400, worldWidth * 0.25)),
      Math.round(centerY / Math.max(400, worldHeight * 0.25)),
      Math.round(scale * 10),
    ].join(":");
    if (nextViewKey !== viewKey) {
      viewKey = nextViewKey;
      hydratedForView = 0;
      mediaForView = 0;
    }
    const remainingBudget = Math.max(0, homeCanvasHydration.cardsPerView - hydratedForView);
    const nearby = nodes
      .filter((item) => {
        if (item.width * scale < 48) return false;
        return (
          item.x + item.width / 2 >= worldLeft - overscan
          && item.x - item.width / 2 <= worldLeft + worldWidth + overscan
          && item.y + item.height / 2 >= worldTop - overscan
          && item.y - item.height / 2 <= worldTop + worldHeight + overscan
        );
      })
      .sort((first, second) => (
        Math.hypot(first.x - centerX, first.y - centerY)
        - Math.hypot(second.x - centerX, second.y - centerY)
      ));
    const visible = nearby
      .filter((item) => !item.node.classList.contains("is-hydrated"))
      .slice(0, remainingBudget);

    for (const item of visible) {
      hydrateHomeCanvasNode(item.node);
    }
    hydratedForView += visible.length;

    for (const item of nearby) {
      if (mediaForView >= homeCanvasHydration.mediaPerView) break;
      if (!item.node.classList.contains("is-hydrated")) continue;
      mediaForView += loadHomeCanvasNodeMedia(item.node, 1);
    }
  }

  function update(state) {
    latestState = { ...state };
    if (hydrationTimer) clearTimeout(hydrationTimer);
    hydrationTimer = window.setTimeout(hydrateVisible, homeCanvasHydration.delayMs);
  }

  return { update };
}

function hydrateHomeCanvasNode(node, mediaLimit = 0) {
  const template = node.querySelector("[data-canvas-card-template]");
  if (!template) return { loadedMedia: 0 };

  const content = template.content.cloneNode(true);
  for (const image of content.querySelectorAll("img[data-src]")) {
    image.addEventListener("error", () => {
      const fallbackSrc = image.dataset.fallbackSrc;
      if (fallbackSrc) {
        delete image.dataset.fallbackSrc;
        image.src = fallbackSrc;
        return;
      }
      image.hidden = true;
      node.classList.add("has-missing-media");
    });
  }

  node.querySelector(".home-canvas-card-placeholder")?.remove();
  node.insertBefore(content, template);
  template.remove();
  node.classList.remove("is-placeholder");
  node.classList.add("is-hydrated");
  const loadedMedia = loadHomeCanvasNodeMedia(node, mediaLimit);

  if (node.querySelector("img[data-src]")) {
    const loadRemainingMedia = () => loadHomeCanvasNodeMedia(node, Infinity);
    node.addEventListener("pointerenter", loadRemainingMedia, { once: true, passive: true });
    node.addEventListener("focus", loadRemainingMedia, { once: true });
  }

  return { loadedMedia };
}

function loadHomeCanvasNodeMedia(node, limit = Infinity) {
  let loaded = 0;
  for (const image of node.querySelectorAll("img[data-src]")) {
    if (loaded >= limit) break;
    const src = image.dataset.src;
    delete image.dataset.src;
    if (src) {
      image.src = src;
      loaded += 1;
    }
  }
  return loaded;
}

function createHomeCanvasThemeLayer(lang, canvasSize) {
  const fragment = document.createDocumentFragment();
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const labels = document.createElement("div");

  svg.classList.add("home-canvas-paths");
  svg.setAttribute("viewBox", `0 0 ${canvasSize.width} ${canvasSize.height}`);
  svg.setAttribute("aria-hidden", "true");
  labels.className = "home-canvas-theme-labels";

  for (const theme of homeCanvasThemes) {
    const endDistance = theme.id === "myphotos" ? 1720 : 1560;
    const endX = canvasSize.centerX + Math.cos(theme.angle) * endDistance;
    const endY = canvasSize.centerY + Math.sin(theme.angle) * endDistance;
    const normal = theme.angle + Math.PI / 2;
    const curve = theme.id === "products" ? -160 : (homeCanvasNoise(theme.id, "curve") - 0.5) * 320;
    const controlOneX = canvasSize.centerX + Math.cos(theme.angle) * 430 + Math.cos(normal) * curve;
    const controlOneY = canvasSize.centerY + Math.sin(theme.angle) * 430 + Math.sin(normal) * curve;
    const controlTwoX =
      canvasSize.centerX + Math.cos(theme.angle) * (endDistance * 0.82) - Math.cos(normal) * curve * 0.55;
    const controlTwoY =
      canvasSize.centerY + Math.sin(theme.angle) * (endDistance * 0.82) - Math.sin(normal) * curve * 0.55;
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const label = document.createElement("div");

    path.setAttribute(
      "d",
      `M ${canvasSize.centerX} ${canvasSize.centerY} C ${controlOneX} ${controlOneY}, ${controlTwoX} ${controlTwoY}, ${endX} ${endY}`,
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

function initHomeCanvasInteractions(root, viewport, surface, toolbar, lang, canvasSize, updateVisibility) {
  const state = {
    x: 0,
    y: 0,
    scale: homeCanvasDefaultScale(viewport),
  };
  const postOverlay = createHomeCanvasPostOverlay(root, lang);
  const resetButton = toolbar?.querySelector('[data-canvas-action="reset"]');
  const zoomInButton = toolbar?.querySelector('[data-canvas-action="zoom-in"]');
  const zoomOutButton = toolbar?.querySelector('[data-canvas-action="zoom-out"]');
  const activePointers = new Map();
  let pan = null;
  let pinch = null;
  let nodeDrag = null;
  let renderFrame = 0;
  let viewAnimationFrame = 0;
  let spacePanning = false;
  let suppressClickUntil = 0;
  let renderedZoomLabel = "";
  let viewportSize = {
    width: viewport.clientWidth,
    height: viewport.clientHeight,
  };
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");

  function applyView() {
    renderFrame = 0;
    const scale = state.scale.toFixed(4);
    surface.style.transform = `translate3d(${state.x.toFixed(2)}px, ${state.y.toFixed(2)}px, 0) scale(${scale})`;

    const zoomLabel = `${Math.round(state.scale * 100)}%`;
    if (resetButton && renderedZoomLabel !== zoomLabel) {
      resetButton.textContent = zoomLabel;
      resetButton.setAttribute(
        "aria-label",
        lang === "en" ? `Zoom ${zoomLabel}. Return to center` : `Масштаб ${zoomLabel}. Вернуться к центру`,
      );
      renderedZoomLabel = zoomLabel;
    }

    if (zoomInButton) zoomInButton.disabled = state.scale >= homeCanvasView.maxScale - 0.0001;
    if (zoomOutButton) zoomOutButton.disabled = state.scale <= homeCanvasView.minScale + 0.0001;
    updateVisibility(state);
  }

  function scheduleView() {
    if (!renderFrame) renderFrame = requestAnimationFrame(applyView);
  }

  function cancelScheduledView() {
    if (!renderFrame) return;
    cancelAnimationFrame(renderFrame);
    renderFrame = 0;
  }

  function cancelViewAnimation() {
    if (!viewAnimationFrame) return;
    cancelAnimationFrame(viewAnimationFrame);
    viewAnimationFrame = 0;
  }

  function setView(nextState) {
    state.x = nextState.x;
    state.y = nextState.y;
    state.scale = nextState.scale;
    scheduleView();
  }

  function animateViewTo(nextState) {
    cancelViewAnimation();
    cancelScheduledView();

    if (reduceMotion?.matches) {
      state.x = nextState.x;
      state.y = nextState.y;
      state.scale = nextState.scale;
      applyView();
      return;
    }

    const start = {
      x: state.x,
      y: state.y,
      scale: state.scale,
    };
    let startTime = null;

    function step(timestamp) {
      if (!root.isConnected) {
        viewAnimationFrame = 0;
        return;
      }

      if (startTime === null) startTime = timestamp;
      const progress = clamp((timestamp - startTime) / homeCanvasZoomAnimationMs, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 4);

      state.scale = start.scale * Math.pow(nextState.scale / start.scale, eased);
      if (Number.isFinite(nextState.anchorX) && Number.isFinite(nextState.anchorY)) {
        state.x = nextState.anchorX - nextState.contentX * state.scale;
        state.y = nextState.anchorY - nextState.contentY * state.scale;
      } else {
        state.x = start.x + (nextState.x - start.x) * eased;
        state.y = start.y + (nextState.y - start.y) * eased;
      }
      applyView();

      if (progress < 1) {
        viewAnimationFrame = requestAnimationFrame(step);
      } else {
        viewAnimationFrame = 0;
        setView(nextState);
      }
    }

    viewAnimationFrame = requestAnimationFrame(step);
  }

  function getResetState() {
    const scale = homeCanvasDefaultScale(viewport);

    return {
      scale,
      x: viewport.clientWidth / 2 - canvasSize.centerX * scale,
      y: viewport.clientHeight / 2 - canvasSize.centerY * scale,
    };
  }

  function resetView(options = {}) {
    cancelViewAnimation();

    if (options.animated) {
      animateViewTo(getResetState());
    } else {
      setView(getResetState());
    }
  }

  function getZoomState(clientX, clientY, nextScale) {
    const rect = viewport.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const contentX = (x - state.x) / state.scale;
    const contentY = (y - state.y) / state.scale;
    const scale = clamp(nextScale, homeCanvasView.minScale, homeCanvasView.maxScale);

    return {
      scale,
      x: x - contentX * scale,
      y: y - contentY * scale,
      anchorX: x,
      anchorY: y,
      contentX,
      contentY,
    };
  }

  function zoomAt(clientX, clientY, nextScale, options = {}) {
    const nextState = getZoomState(clientX, clientY, nextScale);

    if (options.animated) {
      animateViewTo(nextState);
    } else {
      cancelViewAnimation();
      setView(nextState);
    }
  }

  resetView();
  cancelScheduledView();
  applyView();

  function normalizeWheelDelta(event) {
    if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 16;
    if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * viewport.clientHeight;
    return event.deltaY;
  }

  viewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    cancelViewAnimation();

    if (event.metaKey || event.ctrlKey) {
      const delta = normalizeWheelDelta(event);
      const factor = clamp(
        Math.exp(-delta * homeCanvasView.wheelZoomSensitivity),
        0.8,
        1.25,
      );
      zoomAt(event.clientX, event.clientY, state.scale * factor);
    } else {
      const useShiftAxis = event.shiftKey && Math.abs(event.deltaX) < Math.abs(event.deltaY);
      state.x -= useShiftAxis ? normalizeWheelDelta(event) : event.deltaX;
      state.y -= useShiftAxis ? 0 : normalizeWheelDelta(event);
      scheduleView();
    }
  }, { passive: false });

  viewport.addEventListener("pointerdown", (event) => {
    const isTouch = event.pointerType === "touch";
    const isPanButton = event.button === 1 || (event.button === 0 && (spacePanning || !event.target.closest("[data-home-node]")));

    if ((!isTouch && !isPanButton) || event.target.closest("[data-canvas-toolbar]")) {
      return;
    }

    event.preventDefault();
    cancelViewAnimation();
    viewport.focus({ preventScroll: true });
    viewport.setPointerCapture(event.pointerId);
    viewport.classList.add("is-panning");

    activePointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (activePointers.size >= 2) {
      const [first, second] = [...activePointers.values()];
      const rect = viewport.getBoundingClientRect();
      const centerX = (first.x + second.x) / 2 - rect.left;
      const centerY = (first.y + second.y) / 2 - rect.top;
      pinch = {
        distance: Math.hypot(second.x - first.x, second.y - first.y) || 1,
        scale: state.scale,
        contentX: (centerX - state.x) / state.scale,
        contentY: (centerY - state.y) / state.scale,
      };
      pan = null;
      suppressClickUntil = performance.now() + 400;
      return;
    }

    pan = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: state.x,
      y: state.y,
      moved: false,
      tapNode: isTouch ? event.target.closest("[data-home-node]") : null,
    };
  });

  viewport.addEventListener("pointermove", (event) => {
    if (activePointers.has(event.pointerId)) {
      activePointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
    }

    if (pinch && activePointers.size >= 2) {
      const [first, second] = [...activePointers.values()];
      const rect = viewport.getBoundingClientRect();
      const centerX = (first.x + second.x) / 2 - rect.left;
      const centerY = (first.y + second.y) / 2 - rect.top;
      const distance = Math.hypot(second.x - first.x, second.y - first.y) || 1;
      const scale = clamp(
        pinch.scale * (distance / pinch.distance),
        homeCanvasView.minScale,
        homeCanvasView.maxScale,
      );

      state.scale = scale;
      state.x = centerX - pinch.contentX * scale;
      state.y = centerY - pinch.contentY * scale;
      scheduleView();
      suppressClickUntil = performance.now() + 400;
      return;
    }

    if (!pan || pan.id !== event.pointerId) return;
    const deltaX = event.clientX - pan.startX;
    const deltaY = event.clientY - pan.startY;
    pan.moved = pan.moved || Math.hypot(deltaX, deltaY) > 3;
    state.x = pan.x + deltaX;
    state.y = pan.y + deltaY;
    scheduleView();

    if (pan.moved) suppressClickUntil = performance.now() + 250;
  });

  function finishPointer(event) {
    activePointers.delete(event.pointerId);

    if (pinch && activePointers.size === 1) {
      const [remainingId, remaining] = activePointers.entries().next().value;
      pinch = null;
      pan = {
        id: remainingId,
        startX: remaining.x,
        startY: remaining.y,
        x: state.x,
        y: state.y,
        moved: true,
      };
      return;
    }

    if (pan?.id === event.pointerId) {
      const tappedNode = event.type === "pointerup" && !pan.moved ? pan.tapNode : null;
      pan = null;

      if (tappedNode) {
        suppressClickUntil = performance.now() + 250;
        postOverlay.open(tappedNode.href, tappedNode);
      }
    }
    if (!activePointers.size) {
      pinch = null;
      viewport.classList.remove("is-panning");
    }
  }

  viewport.addEventListener("pointerup", finishPointer);
  viewport.addEventListener("pointercancel", finishPointer);

  for (const node of surface.querySelectorAll("[data-home-node]")) {
    node.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.pointerType === "touch" || spacePanning) return;

      event.stopPropagation();
      cancelViewAnimation();
      node.setPointerCapture(event.pointerId);
      root.classList.add("is-dragging-node");
      nodeDrag = {
        id: event.pointerId,
        node,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: parseFloat(node.style.getPropertyValue("--drag-x") || "0"),
        offsetY: parseFloat(node.style.getPropertyValue("--drag-y") || "0"),
        moved: false,
      };
    });

    node.addEventListener("pointermove", (event) => {
      if (!nodeDrag || nodeDrag.id !== event.pointerId || nodeDrag.node !== node) return;

      const deltaX = (event.clientX - nodeDrag.startX) / state.scale;
      const deltaY = (event.clientY - nodeDrag.startY) / state.scale;
      nodeDrag.moved = nodeDrag.moved || Math.abs(deltaX) + Math.abs(deltaY) > 4;
      node.style.setProperty("--drag-x", `${nodeDrag.offsetX + deltaX}px`);
      node.style.setProperty("--drag-y", `${nodeDrag.offsetY + deltaY}px`);
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
      if (node.dataset.dragMoved === "true" || performance.now() < suppressClickUntil) {
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
      zoomAt(centerX, centerY, state.scale * homeCanvasView.toolbarZoomStep, { animated: true });
    } else if (button.dataset.canvasAction === "zoom-out") {
      zoomAt(centerX, centerY, state.scale / homeCanvasView.toolbarZoomStep, { animated: true });
    } else {
      resetView({ animated: true });
    }
  });

  root.addEventListener("keydown", (event) => {
    if (root.classList.contains("has-post-overlay") || event.target.closest("button, input, textarea, select")) {
      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      if (!event.repeat) {
        spacePanning = true;
        root.classList.add("is-space-panning");
      }
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const rect = viewport.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomAt(centerX, centerY, state.scale * homeCanvasView.toolbarZoomStep, { animated: true });
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoomAt(centerX, centerY, state.scale / homeCanvasView.toolbarZoomStep, { animated: true });
    } else if (event.key === "0") {
      event.preventDefault();
      resetView({ animated: true });
    }
  });

  root.addEventListener("keyup", (event) => {
    if (event.code !== "Space") return;
    spacePanning = false;
    root.classList.remove("is-space-panning");
  });

  root.addEventListener("focusout", (event) => {
    if (root.contains(event.relatedTarget)) return;
    spacePanning = false;
    root.classList.remove("is-space-panning");
  });

  const resizeObserver = new ResizeObserver(() => {
    if (!root.isConnected) {
      resizeObserver.disconnect();
      cancelScheduledView();
      cancelViewAnimation();
      return;
    }

    const nextSize = {
      width: viewport.clientWidth,
      height: viewport.clientHeight,
    };
    state.x += (nextSize.width - viewportSize.width) / 2;
    state.y += (nextSize.height - viewportSize.height) / 2;
    viewportSize = nextSize;
    scheduleView();
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

      const trigger = document.createElement("button");
      trigger.className = "screenshot-image-trigger";
      trigger.type = "button";
      trigger.dataset.screenshotImage = "";
      trigger.setAttribute("aria-label", img.alt || `${getUi(lang).openPhoto} ${index + 1}`);
      trigger.append(img);
      item.append(trigger);
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

function openScreenshotImage(image) {
  const photos = getScreenshotViewerPhotos();
  if (!photos.length) return;

  const index = Math.max(
    0,
    photos.findIndex((photo) => photo.element === image),
  );

  initPhotoViewer(photos, currentLanguage());
  openPhoto(index);
}

function getScreenshotViewerPhotos() {
  return [...document.querySelectorAll(".screenshot-media-item.is-image img")]
    .map((image) => {
      const article = image.closest(".screenshot-post");
      const dateLabel = article?.querySelector(".screenshot-date")?.textContent.trim();
      const caption = compactText([image.alt, dateLabel]);

      return {
        element: image,
        src: image.currentSrc || image.src,
        alt: image.alt || caption,
        caption,
        width: image.naturalWidth || undefined,
        height: image.naturalHeight || undefined,
      };
    })
    .filter((photo) => photo.src);
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
  const filterElement = document.querySelector("[data-photo-filter]");
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
    const initialFilter = getCurrentPhotoFilterValue();
    renderTechniqueFilters(filterElement, photos, lang, initialFilter, (filteredPhotos) => {
      renderFilteredPhotos(feedElement, filteredPhotos, lang);
      updatePhotoViewerPhotos(filteredPhotos, lang);
    });
    const initialPhotos = getPhotosByTechnique(photos, initialFilter);
    renderFilteredPhotos(feedElement, initialPhotos, lang);
    initPhotoViewer(initialPhotos, lang);
  } catch (error) {
    if (status) {
      status.textContent = strings.photosLoadError;
    } else if (!hasStaticFeed) {
      feedElement.textContent = strings.photosLoadError;
    }
    console.error(error);
  }
}

function renderTechniqueFilters(filterElement, photos, lang, activeValue, onChange) {
  if (!filterElement) return;

  const options = getPhotoTechniqueOptions(photos, lang);
  filterElement.replaceChildren();

  for (const option of options) {
    const link = document.createElement("a");
    link.href = getPhotoFilterPath(option.value, lang);
    link.dataset.photoFilterValue = option.value;

    if (option.value === activeValue) {
      link.setAttribute("aria-current", "page");
    }

    const label = document.createElement("span");
    label.textContent = option.label;
    link.append(label);

    const count = document.createElement("span");
    count.className = "photo-filter-count";
    count.textContent = String(option.count);
    link.append(count);

    link.addEventListener("click", (event) => {
      event.preventDefault();

      for (const sibling of filterElement.querySelectorAll("[data-photo-filter-value]")) {
        if (sibling === link) {
          sibling.setAttribute("aria-current", "page");
        } else {
          sibling.removeAttribute("aria-current");
        }
      }

      history.pushState({}, "", link.href);
      onChange(getPhotosByTechnique(photos, option.value));
    });

    filterElement.append(link);
  }
}

function renderFilteredPhotos(feedElement, photos, lang) {
  feedElement.replaceChildren();
  renderPhotos(feedElement, photos, lang);
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

function getPhotoTechniqueOptions(photos, lang) {
  const strings = getUi(lang);
  return [
    { value: "all", label: strings.allTechniques, count: photos.length },
    { value: "film", label: strings.filmTechnique, count: getPhotosByTechnique(photos, "film").length },
    { value: "iphone", label: strings.iphoneTechnique, count: getPhotosByTechnique(photos, "iphone").length },
  ];
}

function getPhotosByTechnique(photos, value) {
  if (value === "all") return photos;
  return photos.filter((photo) => getPhotoTechniqueKey(photo) === value);
}

function getPhotoTechniqueKey(photo) {
  if (isFilmPhoto(photo)) return "film";
  if (isIphonePhoto(photo)) return "iphone";
  return "other";
}

function getPhotoCameraLine(photo) {
  const technical = photo.technical || {};
  return technical.cameraLine || technical.camera || "Camera";
}

function getCurrentPhotoFilterValue() {
  const path = window.location.pathname.replace(/\/+$/, "");
  if (path.endsWith("/photos/film") || path.endsWith("/en/photos/film")) return "film";
  if (path.endsWith("/photos/iphone") || path.endsWith("/en/photos/iphone")) return "iphone";
  return "all";
}

function getPhotoFilterPath(value, lang) {
  const prefix = lang === "en" ? "/en" : "";
  if (value === "film") return `${prefix}/photos/film/`;
  if (value === "iphone") return `${prefix}/photos/iphone/`;
  return `${prefix}/photos/`;
}

function isFilmPhoto(photo) {
  const technical = photo.technical || {};
  return technical.hasExif === false;
}

function isIphonePhoto(photo) {
  return /iphone/i.test(getPhotoCameraLine(photo));
}

function createPhotoCard(photo, index, lang) {
  const article = document.createElement("article");
  article.className = "photo-entry";
  article.dataset.photoTechnique = getPhotoTechniqueKey(photo);

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

function ensurePhotoViewerDialog(lang) {
  const existing = document.querySelector("[data-photo-dialog]");
  if (existing) return existing;

  const strings = getUi(lang);
  const dialog = document.createElement("dialog");
  dialog.className = "photo-viewer";
  dialog.dataset.photoDialog = "";
  dialog.setAttribute("aria-label", strings.viewer);

  const bar = document.createElement("div");
  bar.className = "photo-viewer-bar";

  const prev = document.createElement("button");
  prev.type = "button";
  prev.dataset.photoPrev = "";
  prev.setAttribute("aria-label", strings.previousPhoto);
  prev.textContent = "‹";

  const actual = document.createElement("button");
  actual.type = "button";
  actual.dataset.photoActual = "";
  actual.textContent = strings.actual;

  const next = document.createElement("button");
  next.type = "button";
  next.dataset.photoNext = "";
  next.setAttribute("aria-label", strings.nextPhoto);
  next.textContent = "›";

  const close = document.createElement("button");
  close.type = "button";
  close.dataset.photoClose = "";
  close.textContent = strings.closePhoto;

  const figure = document.createElement("figure");
  figure.className = "photo-viewer-stage";

  const image = document.createElement("img");
  image.dataset.photoDialogImage = "";
  image.alt = "";

  const caption = document.createElement("figcaption");
  caption.dataset.photoDialogCaption = "";

  bar.append(prev, actual, next, close);
  figure.append(image, caption);
  dialog.append(bar, figure);
  document.body.append(dialog);

  return dialog;
}

function initPhotoViewer(photos, lang) {
  const dialog = ensurePhotoViewerDialog(lang);
  const image = dialog.querySelector("[data-photo-dialog-image]");
  const caption = dialog.querySelector("[data-photo-dialog-caption]");
  const close = dialog.querySelector("[data-photo-close]");
  const prev = dialog.querySelector("[data-photo-prev]");
  const next = dialog.querySelector("[data-photo-next]");
  const actual = dialog.querySelector("[data-photo-actual]");
  const stage = image?.closest(".photo-viewer-stage");

  if (!dialog || !image || !caption || !stage) return;

  photoViewerState = {
    photos,
    lang,
    dialog,
    image,
    caption,
    actual,
    stage,
    activeIndex: 0,
    isActualSize: false,
  };

  if (dialog.dataset.photoViewerReady === "true") {
    return;
  }

  dialog.dataset.photoViewerReady = "true";

  close?.addEventListener("click", () => closePhotoViewer(dialog));
  prev?.addEventListener("click", () => openPhoto(photoViewerState.activeIndex - 1));
  next?.addEventListener("click", () => openPhoto(photoViewerState.activeIndex + 1));
  actual?.addEventListener("click", () => setActualSize(!photoViewerState.isActualSize));
  image.addEventListener("click", () => setActualSize(!photoViewerState.isActualSize));
  initPhotoViewerSwipeToClose(dialog, stage);

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
    unlockPhotoViewerScroll();
  });
}

function initPhotoViewerSwipeToClose(dialog, stage) {
  let swipe = null;
  let pointerSwipe = null;

  dialog.addEventListener("pointerdown", (event) => {
    if (!shouldTrackPhotoViewerPointer(event) || !dialog.open || event.target.closest(".photo-viewer-bar")) {
      pointerSwipe = null;
      return;
    }

    pointerSwipe = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      scrollTop: stage.scrollTop,
    };

    event.target.setPointerCapture?.(event.pointerId);
  });

  dialog.addEventListener("pointermove", (event) => {
    if (!pointerSwipe || pointerSwipe.id !== event.pointerId) return;

    pointerSwipe.currentX = event.clientX;
    pointerSwipe.currentY = event.clientY;

    const deltaY = pointerSwipe.currentY - pointerSwipe.startY;
    const deltaX = pointerSwipe.currentX - pointerSwipe.startX;

    if (isPhotoViewerCloseSwipe(deltaX, deltaY, pointerSwipe.scrollTop)) {
      event.preventDefault();
    }
  });

  dialog.addEventListener("pointerup", (event) => {
    if (!pointerSwipe || pointerSwipe.id !== event.pointerId) return;

    const deltaY = pointerSwipe.currentY - pointerSwipe.startY;
    const deltaX = pointerSwipe.currentX - pointerSwipe.startX;
    const startScrollTop = pointerSwipe.scrollTop;
    pointerSwipe = null;

    if (isPhotoViewerCloseSwipe(deltaX, deltaY, startScrollTop)) {
      event.preventDefault();
      closePhotoViewer(dialog);
    }
  });

  dialog.addEventListener("pointercancel", () => {
    pointerSwipe = null;
  });

  dialog.addEventListener(
    "touchstart",
    (event) => {
      if (!dialog.open || event.touches.length !== 1 || event.target.closest(".photo-viewer-bar")) {
        swipe = null;
        return;
      }

      const touch = event.touches[0];
      swipe = {
        startX: touch.clientX,
        startY: touch.clientY,
        currentX: touch.clientX,
        currentY: touch.clientY,
        scrollTop: stage.scrollTop,
      };
    },
    { passive: true },
  );

  dialog.addEventListener(
    "touchmove",
    (event) => {
      if (!swipe || event.touches.length !== 1) return;

      const touch = event.touches[0];
      swipe.currentX = touch.clientX;
      swipe.currentY = touch.clientY;

      const deltaY = swipe.currentY - swipe.startY;
      const deltaX = swipe.currentX - swipe.startX;

      if (!isPhotoViewerCloseSwipe(deltaX, deltaY, swipe.scrollTop)) return;

      if (event.cancelable) {
        event.preventDefault();
      }
    },
    { passive: false },
  );

  dialog.addEventListener(
    "touchend",
    () => {
      if (!swipe) return;

      const deltaY = swipe.currentY - swipe.startY;
      const deltaX = swipe.currentX - swipe.startX;
      const startScrollTop = swipe.scrollTop;
      swipe = null;

      if (isPhotoViewerCloseSwipe(deltaX, deltaY, startScrollTop)) {
        closePhotoViewer(dialog);
      }
    },
    { passive: true },
  );

  dialog.addEventListener(
    "touchcancel",
    () => {
      swipe = null;
    },
    { passive: true },
  );
}

function isPhotoViewerCloseSwipe(deltaX, deltaY, startScrollTop) {
  if (startScrollTop > 0 || deltaY < photoViewerSwipeCloseThreshold) return false;

  return deltaY > Math.abs(deltaX) * photoViewerSwipeDirectionRatio;
}

function shouldTrackPhotoViewerPointer(event) {
  return event.pointerType !== "mouse" || window.matchMedia("(max-width: 600px)").matches;
}

function closePhotoViewer(dialog) {
  if (dialog.open) {
    dialog.close();
  }
}

function lockPhotoViewerScroll() {
  if (photoViewerScrollLockState) return;

  const { style } = document.body;
  photoViewerScrollLockState = {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    position: style.position,
    top: style.top,
    left: style.left,
    right: style.right,
    width: style.width,
    overflow: style.overflow,
  };

  document.documentElement.classList.add("is-photo-viewer-open");
  document.body.classList.add("is-photo-viewer-open");
  style.position = "fixed";
  style.top = `-${photoViewerScrollLockState.scrollY}px`;
  style.left = `-${photoViewerScrollLockState.scrollX}px`;
  style.right = "0";
  style.width = "100%";
  style.overflow = "hidden";
}

function unlockPhotoViewerScroll() {
  if (!photoViewerScrollLockState) return;

  const state = photoViewerScrollLockState;
  const { style } = document.body;
  photoViewerScrollLockState = null;

  document.documentElement.classList.remove("is-photo-viewer-open");
  document.body.classList.remove("is-photo-viewer-open");
  style.position = state.position;
  style.top = state.top;
  style.left = state.left;
  style.right = state.right;
  style.width = state.width;
  style.overflow = state.overflow;
  window.scrollTo(state.scrollX, state.scrollY);
}

function updatePhotoViewerPhotos(photos, lang) {
  if (!photoViewerState) return;

  photoViewerState.photos = photos;
  photoViewerState.lang = lang;
  photoViewerState.activeIndex = 0;
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
  state.stage.scrollTo({ top: 0, left: 0, behavior: "auto" });

  if (photo.width && photo.height) {
    state.image.style.aspectRatio = `${photo.width} / ${photo.height}`;
  } else {
    state.image.style.removeProperty("aspect-ratio");
  }

  if (!state.dialog.open) {
    state.dialog.showModal();
    lockPhotoViewerScroll();
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
    photo.date ? formatDate(photo.date, lang) : "",
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
