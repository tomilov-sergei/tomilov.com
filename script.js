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

if (feed) {
  initTelegramFeed(feed);
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
