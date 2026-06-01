document.addEventListener("click", (event) => {
  const trigger = event.target.closest("[data-youtube]");

  if (!trigger) return;

  const videoId = trigger.getAttribute("data-youtube");
  const title = trigger.getAttribute("aria-label") || "YouTube video";
  const iframe = document.createElement("iframe");

  iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`;
  iframe.title = title;
  iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  iframe.allowFullscreen = true;

  trigger.replaceChildren(iframe);
  trigger.classList.add("is-playing");
});

const feed = document.querySelector("[data-telegram-feed]");
const telegramMediaBase = "https://s3.twcstorage.ru/00df5bd5-137f-492a-8d95-c7ee2cc2d851";
const photoFeed = document.querySelector("[data-photo-feed]");

if (feed) {
  initTelegramFeed(feed);
}

if (photoFeed) {
  initPhotoFeed(photoFeed);
}

async function initTelegramFeed(feedElement) {
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
      status.textContent = "Постов пока нет.";
      return;
    }

    status.remove();
    renderNextBatch();

    loadMore.addEventListener("click", renderNextBatch);
  } catch (error) {
    status.textContent = "Не получилось загрузить архив.";
    console.error(error);
  }

  function renderNextBatch() {
    const fragment = document.createDocumentFragment();
    const nextPosts = posts.slice(rendered, rendered + batchSize);

    for (const post of nextPosts) {
      fragment.append(createPost(post));
    }

    feedElement.append(fragment);
    rendered += nextPosts.length;
    loadMore.hidden = rendered >= posts.length;
  }
}

function createPost(post) {
  const article = document.createElement("article");
  article.className = "screenshot-post";
  article.id = `post-${post.id}`;

  if (post.media?.length) {
    article.append(createMedia(post.media));
  }

  const body = document.createElement("div");
  body.className = "screenshot-body";

  if (post.text) {
    const text = document.createElement("div");
    text.className = "screenshot-text";
    appendRichText(text, post);
    body.append(text);
  }

  const meta = document.createElement("div");
  meta.className = "screenshot-meta";

  const link = document.createElement("a");
  link.className = "screenshot-date";
  link.href = post.telegramUrl;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = formatDate(post.date);
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

function createMedia(mediaItems) {
  const wrapper = document.createElement("div");
  wrapper.className = `screenshot-media${mediaItems.length > 1 ? " is-grid" : " is-single"}`;

  for (const media of mediaItems) {
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
      img.alt = "";
      item.append(img);
    } else if (media.type === "video" || media.type === "animation") {
      item.classList.add("is-video");
      item.append(createVideoPreview(media));
    }

    wrapper.append(item);
  }

  return wrapper;
}

function createVideoPreview(media) {
  const trigger = document.createElement("button");
  trigger.className = "screenshot-video-preview";
  trigger.type = "button";
  trigger.setAttribute("aria-label", "Смотреть видео");

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

function appendRichText(container, post) {
  const entities = post.entities || [];
  const entityText = entities.map((entity) => entity.text).join("");

  if (!entities.length || entityText !== post.text) {
    container.textContent = post.text;
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

function formatDate(value) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

async function initPhotoFeed(feedElement) {
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
        status.textContent = "Фотографий пока нет.";
      }
      return;
    }

    feedElement.replaceChildren();
    feedElement.removeAttribute("data-static-photo-feed");
    status?.remove();
    renderPhotos(feedElement, photos);
    initPhotoViewer(photos);
  } catch (error) {
    if (status) {
      status.textContent = "Не получилось загрузить фотографии.";
    } else if (!hasStaticFeed) {
      feedElement.textContent = "Не получилось загрузить фотографии.";
    }
    console.error(error);
  }
}

function renderPhotos(feedElement, photos) {
  const fragment = document.createDocumentFragment();

  for (const [index, photo] of photos.entries()) {
    fragment.append(createPhotoCard(photo, index));
  }

  feedElement.append(fragment);
}

function getPhotosByUploadOrder(photos) {
  return [...photos].sort((first, second) => getPhotoUploadKey(second).localeCompare(getPhotoUploadKey(first)));
}

function getPhotoUploadKey(photo) {
  return photo.uploadedAt || photo.id || photo.date || "";
}

function createPhotoCard(photo, index) {
  const article = document.createElement("article");
  article.className = "photo-entry";

  const button = document.createElement("button");
  button.className = "photo-card";
  button.type = "button";
  button.dataset.photoIndex = String(index);
  button.setAttribute("aria-label", photo.caption || `Открыть фото ${index + 1}`);

  if (photo.width && photo.height) {
    button.style.aspectRatio = `${photo.width} / ${photo.height}`;
  }

  const img = document.createElement("img");
  img.src = photo.src;
  img.loading = index < 4 ? "eager" : "lazy";
  img.decoding = "async";
  img.alt = photo.caption || "";
  button.append(img);

  if (photo.hdr) {
    const badge = document.createElement("span");
    badge.className = "photo-hdr-badge";
    badge.textContent = "HDR";
    button.append(badge);
  }

  article.append(button, createPhotoInfo(photo));

  return article;
}

function createPhotoInfo(photo) {
  const technical = photo.technical || {};
  const location = photo.location || {};
  const wrapper = document.createElement("div");
  wrapper.className = "photo-info";

  const header = document.createElement("div");
  header.className = "photo-info-header";

  const title = document.createElement("strong");
  title.textContent = technical.cameraLine || "Leica M6 — плёнка";
  header.append(title);

  wrapper.append(header);

  const body = document.createElement("div");
  body.className = "photo-info-body";

  const lens = document.createElement("p");
  lens.textContent = technical.lensLine || "Плёночная фотография";
  body.append(lens);

  const summary = document.createElement("p");
  summary.textContent = technical.summary || compactText([formatDimensions(photo), formatFileSize(photo.size)]);
  body.append(summary);

  const locationLabel = normalizeLocationLabel(location.label || location.name);

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

function initPhotoViewer(photos) {
  const dialog = document.querySelector("[data-photo-dialog]");
  const image = document.querySelector("[data-photo-dialog-image]");
  const caption = document.querySelector("[data-photo-dialog-caption]");
  const close = document.querySelector("[data-photo-close]");
  const prev = document.querySelector("[data-photo-prev]");
  const next = document.querySelector("[data-photo-next]");
  const actual = document.querySelector("[data-photo-actual]");
  let activeIndex = 0;
  let isActualSize = false;

  if (!dialog || !image || !caption) return;

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-photo-index]");
    if (!trigger) return;

    activeIndex = Number(trigger.dataset.photoIndex || 0);
    openPhoto(activeIndex);
  });

  close?.addEventListener("click", () => dialog.close());
  prev?.addEventListener("click", () => openPhoto(activeIndex - 1));
  next?.addEventListener("click", () => openPhoto(activeIndex + 1));
  actual?.addEventListener("click", () => setActualSize(!isActualSize));
  image.addEventListener("click", () => setActualSize(!isActualSize));

  dialog.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      openPhoto(activeIndex - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      openPhoto(activeIndex + 1);
    }
  });

  dialog.addEventListener("close", () => {
    image.removeAttribute("src");
    setActualSize(false);
  });

  function openPhoto(index) {
    activeIndex = (index + photos.length) % photos.length;
    const photo = photos[activeIndex];

    setActualSize(false);
    image.src = photo.src;
    image.alt = photo.caption || "";
    caption.textContent = photo.caption || makePhotoCaption(photo);

    if (photo.width && photo.height) {
      image.style.aspectRatio = `${photo.width} / ${photo.height}`;
    } else {
      image.style.removeProperty("aspect-ratio");
    }

    if (!dialog.open) {
      dialog.showModal();
    }
  }

  function setActualSize(value) {
    isActualSize = value;
    dialog.classList.toggle("is-actual-size", isActualSize);
    actual.textContent = isActualSize ? "Вписать" : "100%";
  }
}

function makePhotoCaption(photo) {
  const technical = photo.technical || {};
  const location = photo.location || {};
  const locationLabel = normalizeLocationLabel(location.label || location.name);

  return compactText([
    technical.cameraLine,
    technical.lensLine,
    locationLabel,
    formatDate(photo.date),
  ]);
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
