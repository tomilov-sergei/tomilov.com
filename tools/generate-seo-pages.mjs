#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const screenshotsDir = path.join(rootDir, "screenshots");
const postsIndexDir = path.join(screenshotsDir, "posts");
const photosDir = path.join(rootDir, "photos");
const photosArchiveDir = path.join(photosDir, "archive");
const postsJsonPath = path.join(rootDir, "assets", "telegram", "posts.json");
const photosJsonPath = path.join(rootDir, "assets", "photos", "photos.json");
const sitemapPath = path.join(rootDir, "sitemap.xml");
const feedPath = path.join(rootDir, "feed.xml");
const screenshotsFeedPath = path.join(screenshotsDir, "feed.xml");
const photosFeedPath = path.join(photosDir, "feed.xml");
const siteUrl = "https://tomilov.com";
const siteName = "Серёжа Томилов";
const channelTitle = "Screenshot of the Day";
const photosTitle = "Фото";
const photosDescription = "Витрина лучших снимков Серёжи Томилова.";
const licenseUrl = "https://creativecommons.org/licenses/by/4.0/";
const licenseName = "CC BY 4.0";
const telegramMediaBase = "https://s3.twcstorage.ru/00df5bd5-137f-492a-8d95-c7ee2cc2d851";
const feedLimit = 50;
const assetVersion = getCurrentAssetVersion();

const data = readJsonIfExists(postsJsonPath, { posts: [] });
const photosData = readJsonIfExists(photosJsonPath, { photos: [] });
const posts = [...(data.posts || [])].sort((a, b) => Number(b.dateUnixtime || 0) - Number(a.dateUnixtime || 0));
const photos = [...(photosData.photos || [])].sort((a, b) => getPhotoSortKey(b).localeCompare(getPhotoSortKey(a)));
const postIds = new Set(posts.map((post) => String(post.id)));
const photoIds = new Set(photos.map((photo) => String(photo.id)));

mkdirSync(screenshotsDir, { recursive: true });
removeStalePostDirs(postIds);

for (const [index, post] of posts.entries()) {
  const postDir = path.join(screenshotsDir, String(post.id));
  mkdirSync(postDir, { recursive: true });
  writeFileSync(path.join(postDir, "index.html"), renderPostPage(post, posts[index - 1], posts[index + 1]));
}

mkdirSync(postsIndexDir, { recursive: true });
writeFileSync(path.join(postsIndexDir, "index.html"), renderPostsIndex(posts));

mkdirSync(photosDir, { recursive: true });
removeStalePhotoDirs(photoIds);

for (const [index, photo] of photos.entries()) {
  const photoDir = path.join(photosDir, String(photo.id));
  mkdirSync(photoDir, { recursive: true });
  writeFileSync(path.join(photoDir, "index.html"), renderPhotoPage(photo, photos[index - 1], photos[index + 1]));
}

mkdirSync(photosArchiveDir, { recursive: true });
writeFileSync(path.join(photosDir, "index.html"), renderPhotosPage(photos));
writeFileSync(path.join(photosArchiveDir, "index.html"), renderPhotosArchive(photos));
writeFileSync(sitemapPath, renderSitemap(posts, photos));
writeFileSync(feedPath, renderMainFeed(posts, photos));
writeFileSync(screenshotsFeedPath, renderScreenshotsFeed(posts));
writeFileSync(photosFeedPath, renderPhotosFeed(photos));

console.log(`Generated ${posts.length} post pages`);
console.log(`Generated ${photos.length} photo pages`);
console.log(path.relative(rootDir, postsIndexDir));
console.log(path.relative(rootDir, photosArchiveDir));
console.log(path.relative(rootDir, sitemapPath));
console.log(path.relative(rootDir, feedPath));
console.log(path.relative(rootDir, screenshotsFeedPath));
console.log(path.relative(rootDir, photosFeedPath));

function renderPostPage(post, newerPost, olderPost) {
  const url = `${siteUrl}/screenshots/${post.id}/`;
  const title = `${makePostTitle(post)} — ${channelTitle}`;
  const description = makeDescription(post);
  const image = getSocialImage(post);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: makePostTitle(post, 110),
    description,
    datePublished: toIsoDate(post.date),
    dateModified: toIsoDate(post.edited || post.date),
    mainEntityOfPage: url,
    url,
    author: {
      "@type": "Person",
      name: siteName,
      url: siteUrl,
    },
    publisher: {
      "@type": "Person",
      name: siteName,
      url: siteUrl,
    },
    isPartOf: {
      "@type": "Blog",
      name: channelTitle,
      url: `${siteUrl}/screenshots/`,
    },
  };

  if (image) {
    jsonLd.image = [image];
  }

  return `<!doctype html>
<html lang="ru-RU">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeAttribute(description)}">
    <link rel="canonical" href="${url}">
    <link rel="alternate" type="application/rss+xml" title="${escapeAttribute(channelTitle)}" href="${siteUrl}/screenshots/feed.xml">
    <meta property="og:type" content="article">
    <meta property="og:title" content="${escapeAttribute(makePostTitle(post, 90))}">
    <meta property="og:description" content="${escapeAttribute(description)}">
    <meta property="og:image" content="${escapeAttribute(image || `${siteUrl}/assets/og.png`)}">
    <meta property="og:url" content="${url}">
    <meta property="article:published_time" content="${escapeAttribute(toIsoDate(post.date))}">
    <meta property="article:modified_time" content="${escapeAttribute(toIsoDate(post.edited || post.date))}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeAttribute(makePostTitle(post, 90))}">
    <meta name="twitter:description" content="${escapeAttribute(description)}">
    <meta name="twitter:image" content="${escapeAttribute(image || `${siteUrl}/assets/og.png`)}">
    <link rel="icon" href="/assets/favicon.png">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;700&family=Lora:wght@600&family=Manrope:wght@800&display=swap">
    <link rel="stylesheet" href="/styles.css?v=${assetVersion}">
    <script type="application/ld+json">${escapeJsonLd(jsonLd)}</script>
  </head>
  <body>
    <main class="page screenshots-page">
      ${renderHeader(`/screenshots/${post.id}/`)}

      <nav class="post-breadcrumb" aria-label="Хлебные крошки">
        <a href="/screenshots/">Блог</a>
        <span aria-hidden="true">/</span>
        <a href="/screenshots/posts/">Все посты</a>
      </nav>

      ${renderStaticPost(post)}

      <nav class="post-nav" aria-label="Соседние посты">
        ${newerPost ? `<a href="/screenshots/${newerPost.id}/">Новее</a>` : "<span></span>"}
        ${olderPost ? `<a href="/screenshots/${olderPost.id}/">Старее</a>` : "<span></span>"}
      </nav>
    </main>
    <script src="/script.js?v=${assetVersion}"></script>
  </body>
</html>
`;
}

function renderPostsIndex(posts) {
  const description = `Статический индекс всех постов канала ${channelTitle}.`;

  return `<!doctype html>
<html lang="ru-RU">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>Все посты — ${channelTitle}</title>
    <meta name="description" content="${escapeAttribute(description)}">
    <link rel="canonical" href="${siteUrl}/screenshots/posts/">
    <link rel="alternate" type="application/rss+xml" title="${escapeAttribute(channelTitle)}" href="${siteUrl}/screenshots/feed.xml">
    <meta property="og:type" content="website">
    <meta property="og:title" content="Все посты — ${channelTitle}">
    <meta property="og:description" content="${escapeAttribute(description)}">
    <meta property="og:image" content="${siteUrl}/assets/og.png">
    <meta property="og:url" content="${siteUrl}/screenshots/posts/">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Все посты — ${channelTitle}">
    <meta name="twitter:description" content="${escapeAttribute(description)}">
    <meta name="twitter:image" content="${siteUrl}/assets/og.png">
    <link rel="icon" href="/assets/favicon.png">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;700&family=Lora:wght@600&family=Manrope:wght@800&display=swap">
    <link rel="stylesheet" href="/styles.css?v=${assetVersion}">
  </head>
  <body>
    <main class="page screenshots-page">
      ${renderHeader("/screenshots/posts/")}

      <section class="screenshots-intro compact" aria-labelledby="posts-title">
        <p class="eyebrow">Static index</p>
        <h1 id="posts-title">Все посты</h1>
        <a href="/screenshots/">Вернуться в блог</a>
      </section>

      <section class="post-index-list" aria-label="Все посты Screenshot of the Day">
        ${posts.map(renderPostIndexLink).join("\n        ")}
      </section>
    </main>
  </body>
</html>
`;

  function renderPostIndexLink(post) {
    return `<a class="post-index-item" href="/screenshots/${post.id}/">
          <time datetime="${escapeAttribute(toIsoDate(post.date))}">${escapeHtml(formatDate(post.date))}</time>
          <span>${escapeHtml(makePostTitle(post, 120))}</span>
        </a>`;
  }
}

function renderPhotosPage(photos) {
  const image = photos[0] ? getPhotoAssetUrl(photos[0].src) : `${siteUrl}/assets/og.png`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: photosTitle,
    description: photosDescription,
    url: `${siteUrl}/photos/`,
    isPartOf: {
      "@type": "WebSite",
      name: siteName,
      url: siteUrl,
    },
    creator: {
      "@type": "Person",
      name: siteName,
      url: siteUrl,
    },
    license: licenseUrl,
  };

  return `<!doctype html>
<html lang="ru-RU">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>${photosTitle} — ${siteName}</title>
    <meta name="description" content="${escapeAttribute(photosDescription)}">
    <link rel="canonical" href="${siteUrl}/photos/">
    <link rel="alternate" type="application/rss+xml" title="${escapeAttribute(photosTitle)}" href="${siteUrl}/photos/feed.xml">
    <meta property="og:type" content="website">
    <meta property="og:title" content="${photosTitle}">
    <meta property="og:description" content="${escapeAttribute(photosDescription)}">
    <meta property="og:image" content="${escapeAttribute(image)}">
    <meta property="og:url" content="${siteUrl}/photos/">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${photosTitle}">
    <meta name="twitter:description" content="${escapeAttribute(photosDescription)}">
    <meta name="twitter:image" content="${escapeAttribute(image)}">
    <link rel="icon" href="/assets/favicon.png">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;700&family=Lora:wght@600&family=Manrope:wght@800&display=swap">
    <link rel="stylesheet" href="/styles.css?v=${assetVersion}">
    <script type="application/ld+json">${escapeJsonLd(jsonLd)}</script>
  </head>
  <body>
    <main class="page photos-page">
      ${renderHeader("/photos/")}

      <section class="photos-intro" aria-labelledby="photos-title">
        <h1 id="photos-title">Фото</h1>
      </section>

      <section class="photo-feed" data-photo-feed data-static-photo-feed aria-live="polite">
        ${photos.length ? photos.map((photo, index) => renderPhotoCard(photo, index)).join("\n        ") : '<p class="feed-status" data-photo-status>Фотографий пока нет.</p>'}
      </section>

      <footer class="photos-footer">
        <p>Витрина лучших снимков. Использование разрешено по лицензии <a href="${licenseUrl}" target="_blank" rel="license noopener">${licenseName}</a> с указанием авторства.</p>
        <a href="/photos/archive/">Все фото</a>
      </footer>
    </main>

    ${renderPhotoDialog()}
    <script src="/script.js?v=${assetVersion}"></script>
  </body>
</html>
`;
}

function renderPhotosArchive(photos) {
  const description = `Статический индекс всех фото из раздела ${photosTitle}.`;

  return `<!doctype html>
<html lang="ru-RU">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>Все фото — ${siteName}</title>
    <meta name="description" content="${escapeAttribute(description)}">
    <link rel="canonical" href="${siteUrl}/photos/archive/">
    <link rel="alternate" type="application/rss+xml" title="${escapeAttribute(photosTitle)}" href="${siteUrl}/photos/feed.xml">
    <meta property="og:type" content="website">
    <meta property="og:title" content="Все фото — ${siteName}">
    <meta property="og:description" content="${escapeAttribute(description)}">
    <meta property="og:image" content="${siteUrl}/assets/og.png">
    <meta property="og:url" content="${siteUrl}/photos/archive/">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Все фото — ${siteName}">
    <meta name="twitter:description" content="${escapeAttribute(description)}">
    <meta name="twitter:image" content="${siteUrl}/assets/og.png">
    <link rel="icon" href="/assets/favicon.png">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;700&family=Lora:wght@600&family=Manrope:wght@800&display=swap">
    <link rel="stylesheet" href="/styles.css?v=${assetVersion}">
  </head>
  <body>
    <main class="page photos-page">
      ${renderHeader("/photos/archive/")}

      <section class="photos-intro compact" aria-labelledby="photos-archive-title">
        <p class="eyebrow">Static index</p>
        <h1 id="photos-archive-title">Все фото</h1>
        <a href="/photos/">Вернуться в фотоленту</a>
      </section>

      <section class="post-index-list" aria-label="Все фото">
        ${photos.map(renderPhotoIndexLink).join("\n        ")}
      </section>
    </main>
  </body>
</html>
`;

  function renderPhotoIndexLink(photo) {
    return `<a class="post-index-item" href="/photos/${photo.id}/">
          <time datetime="${escapeAttribute(toIsoDate(photo.date || photo.uploadedAt))}">${escapeHtml(formatDate(photo.date || photo.uploadedAt))}</time>
          <span>${escapeHtml(makePhotoTitle(photo, 120))}</span>
        </a>`;
  }
}

function renderPhotoPage(photo, newerPhoto, olderPhoto) {
  const url = `${siteUrl}/photos/${photo.id}/`;
  const title = `${makePhotoTitle(photo)} — ${photosTitle}`;
  const description = makePhotoDescription(photo);
  const image = getPhotoAssetUrl(photo.src);
  const imageObject = renderPhotoJsonLd(photo, url, description);

  return `<!doctype html>
<html lang="ru-RU">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeAttribute(description)}">
    <link rel="canonical" href="${url}">
    <link rel="alternate" type="application/rss+xml" title="${escapeAttribute(photosTitle)}" href="${siteUrl}/photos/feed.xml">
    <meta property="og:type" content="article">
    <meta property="og:title" content="${escapeAttribute(makePhotoTitle(photo, 90))}">
    <meta property="og:description" content="${escapeAttribute(description)}">
    <meta property="og:image" content="${escapeAttribute(image)}">
    <meta property="og:url" content="${url}">
    <meta property="article:published_time" content="${escapeAttribute(toIsoDate(photo.date || photo.uploadedAt))}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeAttribute(makePhotoTitle(photo, 90))}">
    <meta name="twitter:description" content="${escapeAttribute(description)}">
    <meta name="twitter:image" content="${escapeAttribute(image)}">
    <link rel="license" href="${licenseUrl}">
    <link rel="icon" href="/assets/favicon.png">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;700&family=Lora:wght@600&family=Manrope:wght@800&display=swap">
    <link rel="stylesheet" href="/styles.css?v=${assetVersion}">
    <script type="application/ld+json">${escapeJsonLd(imageObject)}</script>
  </head>
  <body>
    <main class="page photo-detail-page">
      ${renderHeader(`/photos/${photo.id}/`)}

      <nav class="post-breadcrumb" aria-label="Хлебные крошки">
        <a href="/photos/">Фото</a>
        <span aria-hidden="true">/</span>
        <a href="/photos/archive/">Все фото</a>
      </nav>

      <article class="photo-detail">
        <figure class="photo-detail-figure">
          <a href="${escapeAttribute(photo.src)}">
            <img src="${escapeAttribute(photo.src)}" width="${escapeAttribute(photo.width || "")}" height="${escapeAttribute(photo.height || "")}" decoding="async" alt="${escapeAttribute(makePhotoAlt(photo))}">
          </a>
          <figcaption>
            <h1>${escapeHtml(makePhotoTitle(photo, 140))}</h1>
            ${photo.caption ? `<p>${escapeHtml(photo.caption)}</p>` : ""}
          </figcaption>
        </figure>

        ${renderPhotoMeta(photo)}
      </article>

      <nav class="post-nav" aria-label="Соседние фото">
        ${newerPhoto ? `<a href="/photos/${newerPhoto.id}/">Новее</a>` : "<span></span>"}
        ${olderPhoto ? `<a href="/photos/${olderPhoto.id}/">Старее</a>` : "<span></span>"}
      </nav>
    </main>
  </body>
</html>
`;
}

function renderPhotoJsonLd(photo, url, description) {
  const object = {
    "@context": "https://schema.org",
    "@type": "ImageObject",
    name: makePhotoTitle(photo, 110),
    caption: photo.caption || makePhotoTitle(photo, 110),
    description,
    contentUrl: getPhotoAssetUrl(photo.src),
    url,
    thumbnailUrl: getPhotoAssetUrl(photo.src),
    datePublished: toIsoDate(photo.date || photo.uploadedAt),
    uploadDate: toIsoDate(photo.uploadedAt || photo.date),
    creator: {
      "@type": "Person",
      name: siteName,
      url: siteUrl,
    },
    creditText: siteName,
    copyrightNotice: `© ${siteName}`,
    license: licenseUrl,
    acquireLicensePage: url,
    isPartOf: {
      "@type": "CollectionPage",
      name: photosTitle,
      url: `${siteUrl}/photos/`,
    },
  };

  if (photo.width) object.width = `${photo.width}px`;
  if (photo.height) object.height = `${photo.height}px`;

  const location = getPhotoLocationLabel(photo);
  if (location) {
    object.contentLocation = {
      "@type": "Place",
      name: location,
    };
  }

  return object;
}

function renderPhotoCard(photo, index) {
  const style = photo.width && photo.height ? ` style="aspect-ratio: ${Number(photo.width)} / ${Number(photo.height)}"` : "";
  const title = makePhotoTitle(photo, 100);

  return `<article class="photo-entry">
          <a class="photo-card" href="/photos/${photo.id}/"${style} aria-label="${escapeAttribute(title)}">
            <img src="${escapeAttribute(photo.src)}" loading="${index < 4 ? "eager" : "lazy"}" decoding="async" alt="${escapeAttribute(makePhotoAlt(photo))}">
            ${photo.hdr ? '<span class="photo-hdr-badge">HDR</span>' : ""}
          </a>
          ${renderPhotoInfo(photo)}
        </article>`;
}

function renderPhotoInfo(photo) {
  const technical = photo.technical || {};
  const settings = (technical.settings || []).filter((item) => item.value);
  const location = getPhotoLocationLabel(photo);

  return `<div class="photo-info">
            <div class="photo-info-header">
              <strong>${escapeHtml(technical.cameraLine || "Leica M6 — плёнка")}</strong>
            </div>
            <div class="photo-info-body">
              <p>${escapeHtml(technical.lensLine || "Плёночная фотография")}</p>
              <p>${escapeHtml(technical.summary || compactText([formatDimensions(photo), formatFileSize(photo.size)]))}</p>
              ${location ? `<p class="photo-location">${escapeHtml(location)}</p>` : ""}
            </div>
            ${settings.length ? `<div class="photo-settings">
              ${settings.map((setting) => `<span>${escapeHtml(setting.label === "ISO" ? `ISO ${setting.value}` : setting.value)}</span>`).join("\n              ")}
            </div>` : ""}
          </div>`;
}

function renderPhotoMeta(photo) {
  const technical = photo.technical || {};
  const location = getPhotoLocationLabel(photo);
  const settings = (technical.settings || []).filter((item) => item.value);

  return `<aside class="photo-detail-meta" aria-label="Информация о фото">
          <dl>
            <div>
              <dt>Дата</dt>
              <dd><time datetime="${escapeAttribute(toIsoDate(photo.date || photo.uploadedAt))}">${escapeHtml(formatDate(photo.date || photo.uploadedAt))}</time></dd>
            </div>
            <div>
              <dt>Камера</dt>
              <dd>${escapeHtml(technical.cameraLine || "Leica M6 — плёнка")}</dd>
            </div>
            <div>
              <dt>Объектив</dt>
              <dd>${escapeHtml(technical.lensLine || "Плёночная фотография")}</dd>
            </div>
            ${location ? `<div>
              <dt>Место</dt>
              <dd>${escapeHtml(location)}</dd>
            </div>` : ""}
            ${settings.length ? `<div>
              <dt>Настройки</dt>
              <dd>${escapeHtml(settings.map((setting) => setting.label === "ISO" ? `ISO ${setting.value}` : setting.value).join(" · "))}</dd>
            </div>` : ""}
            <div>
              <dt>Файл</dt>
              <dd>${escapeHtml(compactText([formatDimensions(photo), formatFileSize(photo.size), photo.mimeType]))}</dd>
            </div>
            <div>
              <dt>Лицензия</dt>
              <dd><a href="${licenseUrl}" target="_blank" rel="license noopener">${licenseName}</a>. Использование разрешено с указанием авторства и ссылки на эту страницу.</dd>
            </div>
          </dl>
        </aside>`;
}

function renderPhotoDialog() {
  return `<dialog class="photo-viewer" data-photo-dialog aria-label="Просмотр фотографии">
      <div class="photo-viewer-bar">
        <button type="button" data-photo-prev aria-label="Предыдущее фото">‹</button>
        <button type="button" data-photo-actual>100%</button>
        <button type="button" data-photo-next aria-label="Следующее фото">›</button>
        <button type="button" data-photo-close>Закрыть</button>
      </div>
      <figure class="photo-viewer-stage">
        <img data-photo-dialog-image alt="">
        <figcaption data-photo-dialog-caption></figcaption>
      </figure>
    </dialog>`;
}

function renderStaticPost(post) {
  const date = toIsoDate(post.date);
  const mediaHtml = post.media?.length ? `        ${renderMedia(post.media, post)}\n` : "";
  const textHtml = post.text ? `          <div class="screenshot-text">${renderRichText(post)}</div>\n` : "";
  const reactionsHtml = post.reactions?.length ? `\n            ${renderReactions(post.reactions)}` : "";

  return `<article class="screenshot-post" id="post-${escapeAttribute(post.id)}">
${mediaHtml}        <div class="screenshot-body">
          <h1 class="post-title">${escapeHtml(makePostTitle(post, 140))}</h1>
${textHtml}          <div class="screenshot-meta">
            <a class="screenshot-date" href="${escapeAttribute(post.telegramUrl)}" target="_blank" rel="noopener"><time datetime="${escapeAttribute(date)}">${escapeHtml(formatDate(post.date))}</time></a>${reactionsHtml}
          </div>
        </div>
      </article>`;
}

function renderMedia(mediaItems, post) {
  const className = `screenshot-media${mediaItems.length > 1 ? " is-grid" : " is-single"}`;

  return `<div class="${className}">
          ${mediaItems.map((media, index) => renderMediaItem(media, post, index)).join("\n          ")}
        </div>`;
}

function renderMediaItem(media, post, index) {
  const aspect = media.width && media.height ? ` style="aspect-ratio: ${Number(media.width)} / ${Number(media.height)}"` : "";
  const alt = makeMediaAlt(post, index);

  if (media.type === "photo" || media.type === "sticker") {
    return `<div class="screenshot-media-item is-image"${aspect}>
            <img src="${escapeAttribute(getTelegramAssetUrl(media.src))}" loading="${index === 0 ? "eager" : "lazy"}" decoding="async" alt="${escapeAttribute(alt)}">
          </div>`;
  }

  if (media.type === "video" || media.type === "animation") {
    const poster = media.poster ? ` poster="${escapeAttribute(getTelegramAssetUrl(media.poster))}"` : "";
    const loopAttrs = media.type === "animation" ? " loop muted" : "";
    return `<div class="screenshot-media-item is-video"${aspect}>
            <video src="${escapeAttribute(getTelegramAssetUrl(media.src))}" controls preload="metadata" playsinline${poster}${loopAttrs}></video>
          </div>`;
  }

  return `<div class="screenshot-media-item">
            <a href="${escapeAttribute(getTelegramAssetUrl(media.src))}">${escapeHtml(media.name || "Файл")}</a>
          </div>`;
}

function renderRichText(post) {
  const entities = post.entities || [];
  const entityText = entities.map((entity) => entity.text).join("");

  if (!entities.length || entityText !== post.text) {
    return stripLineEndWhitespace(escapeHtml(post.text));
  }

  return stripLineEndWhitespace(entities
    .map((entity) => {
      if (entity.type === "text_link" && entity.href) {
        return `<a href="${escapeAttribute(entity.href)}" target="_blank" rel="noopener">${escapeHtml(entity.text)}</a>`;
      }

      return escapeHtml(entity.text);
    })
    .join(""));
}

function renderReactions(reactions) {
  return `<div class="screenshot-reactions">
              ${reactions.map((reaction) => `<span>${escapeHtml(`${reaction.emoji} ${reaction.count}`)}</span>`).join("\n              ")}
            </div>`;
}

function renderHeader(currentPath) {
  const isScreenshots = currentPath.startsWith("/screenshots/");
  const isPhotos = currentPath.startsWith("/photos/");
  const isAbout = currentPath.startsWith("/about/");

  return `<header class="site-header" aria-label="Навигация">
        <a class="brand" href="/">SS/84</a>
        <nav class="path" aria-label="Разделы">
          <a href="/screenshots/"${isScreenshots ? ' aria-current="page"' : ""}>Блог</a>
          <a href="/photos/"${isPhotos ? ' aria-current="page"' : ""}>Фото</a>
          <a href="/about/"${isAbout ? ' aria-current="page"' : ""}><span class="desktop-name">Серёжа Томилов</span><span class="mobile-name">about</span></a>
        </nav>
      </header>`;
}

function renderSitemap(posts, photos) {
  const staticUrls = [
    { loc: `${siteUrl}/` },
    { loc: `${siteUrl}/about` },
    { loc: `${siteUrl}/screenshots/` },
    { loc: `${siteUrl}/photos/`, lastmod: photos[0] ? toSitemapDate(photos[0].uploadedAt || photos[0].date) : null },
    { loc: `${siteUrl}/photos/archive/`, lastmod: photos[0] ? toSitemapDate(photos[0].uploadedAt || photos[0].date) : null },
    { loc: `${siteUrl}/screenshots/posts/`, lastmod: posts[0] ? toSitemapDate(posts[0].edited || posts[0].date) : null },
  ];

  const postUrls = posts.map((post) => ({
    loc: `${siteUrl}/screenshots/${post.id}/`,
    lastmod: toSitemapDate(post.edited || post.date),
  }));

  const photoUrls = photos.map((photo) => ({
    loc: `${siteUrl}/photos/${photo.id}/`,
    lastmod: toSitemapDate(photo.uploadedAt || photo.date),
    image: {
      loc: getPhotoAssetUrl(photo.src),
      title: makePhotoTitle(photo, 110),
      caption: photo.caption || makePhotoTitle(photo, 110),
    },
  }));

  const urls = [...staticUrls, ...postUrls, ...photoUrls];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${urls
  .map((url) => `  <url>
    <loc>${escapeHtml(url.loc)}</loc>${url.lastmod ? `\n    <lastmod>${escapeHtml(url.lastmod)}</lastmod>` : ""}${url.image ? `\n    <image:image>
      <image:loc>${escapeHtml(url.image.loc)}</image:loc>
      <image:title>${escapeHtml(url.image.title)}</image:title>
      <image:caption>${escapeHtml(url.image.caption)}</image:caption>
      <image:license>${licenseUrl}</image:license>
    </image:image>` : ""}
  </url>`)
  .join("\n")}
</urlset>
`;
}

function renderMainFeed(posts, photos) {
  const items = [
    ...posts.map(makePostFeedItem),
    ...photos.map(makePhotoFeedItem),
  ]
    .sort((a, b) => b.sortDate.getTime() - a.sortDate.getTime())
    .slice(0, feedLimit);

  return renderRssFeed({
    title: siteName,
    description: "Новые записи и фотографии на tomilov.com.",
    link: `${siteUrl}/`,
    self: `${siteUrl}/feed.xml`,
    items,
  });
}

function renderScreenshotsFeed(posts) {
  return renderRssFeed({
    title: channelTitle,
    description: `Новые посты канала ${channelTitle}.`,
    link: `${siteUrl}/screenshots/`,
    self: `${siteUrl}/screenshots/feed.xml`,
    items: posts.slice(0, feedLimit).map(makePostFeedItem),
  });
}

function renderPhotosFeed(photos) {
  return renderRssFeed({
    title: `${photosTitle} — ${siteName}`,
    description: photosDescription,
    link: `${siteUrl}/photos/`,
    self: `${siteUrl}/photos/feed.xml`,
    items: photos.slice(0, feedLimit).map(makePhotoFeedItem),
  });
}

function renderRssFeed({ title, description, link, self, items }) {
  const latestDate = items[0]?.sortDate || new Date();

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>${escapeHtml(title)}</title>
    <link>${escapeHtml(link)}</link>
    <description>${escapeHtml(description)}</description>
    <language>ru-RU</language>
    <lastBuildDate>${toRssDate(latestDate)}</lastBuildDate>
    <atom:link href="${escapeAttribute(self)}" rel="self" type="application/rss+xml"/>
${items.map(renderFeedItem).join("\n")}
  </channel>
</rss>
`;
}

function renderFeedItem(item) {
  const category = item.category ? `\n      <category>${escapeHtml(item.category)}</category>` : "";
  const media = item.mediaUrl ? `\n      <media:content url="${escapeAttribute(item.mediaUrl)}" medium="image"${item.mediaType ? ` type="${escapeAttribute(item.mediaType)}"` : ""}/>` : "";

  return `    <item>
      <title>${escapeHtml(item.title)}</title>
      <link>${escapeHtml(item.link)}</link>
      <guid isPermaLink="true">${escapeHtml(item.guid)}</guid>
      <pubDate>${toRssDate(item.pubDate)}</pubDate>
      <description>${escapeHtml(item.description)}</description>${category}${media}
    </item>`;
}

function makePostFeedItem(post) {
  const link = `${siteUrl}/screenshots/${post.id}/`;
  const mediaUrl = getSocialImage(post);

  return {
    title: makePostTitle(post, 120),
    link,
    guid: link,
    pubDate: post.date,
    sortDate: parseDate(post.date),
    description: makeDescription(post),
    category: channelTitle,
    mediaUrl,
    mediaType: mediaUrl ? guessMimeType(mediaUrl) : "",
  };
}

function makePhotoFeedItem(photo) {
  const link = `${siteUrl}/photos/${photo.id}/`;
  const mediaUrl = getPhotoAssetUrl(photo.src);
  const date = photo.uploadedAt || photo.date;

  return {
    title: makePhotoTitle(photo, 120),
    link,
    guid: link,
    pubDate: date,
    sortDate: parseDate(date),
    description: `${makePhotoDescription(photo)} Лицензия: ${licenseName}, использование с указанием авторства и ссылки на страницу фото.`,
    category: photosTitle,
    mediaUrl,
    mediaType: photo.mimeType || guessMimeType(mediaUrl),
  };
}

function removeStalePostDirs(postIds) {
  for (const entry of readdirSync(screenshotsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name) || postIds.has(entry.name)) {
      continue;
    }

    rmSync(path.join(screenshotsDir, entry.name), { recursive: true, force: true });
  }
}

function removeStalePhotoDirs(photoIds) {
  for (const entry of readdirSync(photosDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === "archive" || photoIds.has(entry.name)) {
      continue;
    }

    rmSync(path.join(photosDir, entry.name), { recursive: true, force: true });
  }
}

function getCurrentAssetVersion() {
  const homeIndex = path.join(rootDir, "index.html");
  const screenshotsIndex = path.join(rootDir, "screenshots", "index.html");
  const photosIndex = path.join(rootDir, "photos", "index.html");

  for (const sourcePath of [homeIndex, photosIndex, screenshotsIndex]) {
    if (!existsSync(sourcePath)) continue;

    const html = readFileSync(sourcePath, "utf8");
    const match = html.match(/\/styles\.css\?v=([^"]+)/);
    if (match) return match[1];
  }

  return "20260531-photo-info";
}

function makePostTitle(post, maxLength = 72) {
  const text = normalizeWhitespace(post.text);
  const fallback = `Пост от ${formatDate(post.date)}`;
  const title = text || fallback;

  return truncate(title, maxLength);
}

function makeDescription(post) {
  const text = normalizeWhitespace(post.text);
  const fallback = `Пост канала ${channelTitle} от ${formatDate(post.date)}.`;
  return truncate(text || fallback, 156);
}

function makeMediaAlt(post, index) {
  const title = makePostTitle(post, 90);
  return index === 0 ? title : `${title}, медиа ${index + 1}`;
}

function getSocialImage(post) {
  const media = post.media?.find((item) => item.type === "photo" || item.type === "sticker" || item.poster);
  if (!media) return null;
  return getTelegramAssetUrl(media.poster || media.src);
}

function getTelegramAssetUrl(src) {
  if (!src?.startsWith("/assets/telegram/")) {
    return src || "";
  }

  return `${telegramMediaBase}${src}`;
}

function readJsonIfExists(filePath, fallback) {
  if (!existsSync(filePath)) {
    return fallback;
  }

  return JSON.parse(readFileSync(filePath, "utf8"));
}

function getPhotoSortKey(photo) {
  return photo.uploadedAt || photo.id || photo.date || "";
}

function makePhotoTitle(photo, maxLength = 72) {
  const caption = normalizeWhitespace(photo.caption);
  const title = caption || compactText([
    getPhotoLocationLabel(photo),
    photo.technical?.cameraLine,
    formatDate(photo.date || photo.uploadedAt),
  ]) || `Фото от ${formatDate(photo.date || photo.uploadedAt)}`;

  return truncate(title, maxLength);
}

function makePhotoDescription(photo) {
  const description = compactText([
    normalizeWhitespace(photo.caption),
    getPhotoLocationLabel(photo),
    photo.technical?.cameraLine,
    photo.technical?.lensLine,
    formatDate(photo.date || photo.uploadedAt),
  ]) || `Фото Серёжи Томилова от ${formatDate(photo.date || photo.uploadedAt)}.`;

  return truncate(description, 156);
}

function makePhotoAlt(photo) {
  return normalizeWhitespace(photo.alt || photo.caption) || makePhotoTitle(photo, 100);
}

function getPhotoLocationLabel(photo) {
  const location = photo.location || {};
  const value = normalizeWhitespace(location.label || location.name);
  const normalized = value.toLowerCase().replace(/^локация:?\s*/, "");

  if (!value || normalized === "не указана" || /^-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?$/.test(value)) {
    return "";
  }

  return value;
}

function getPhotoAssetUrl(src) {
  if (!src) return `${siteUrl}/assets/og.png`;
  if (/^https?:\/\//.test(src)) return src;
  return `${siteUrl}${src}`;
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

function normalizeWhitespace(value = "") {
  if (value == null) return "";

  return String(value).replace(/\s+/g, " ").trim();
}

function stripLineEndWhitespace(value = "") {
  return String(value).replace(/[ \t]+$/gm, "");
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}…`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function toIsoDate(value) {
  return new Date(value).toISOString();
}

function toSitemapDate(value) {
  return toIsoDate(value).slice(0, 10);
}

function toRssDate(value) {
  return parseDate(value).toUTCString();
}

function parseDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isNaN(date.getTime())) return date;
  return new Date();
}

function guessMimeType(value = "") {
  const pathname = String(value).split("?")[0].toLowerCase();
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".avif")) return "image/avif";
  return "image/jpeg";
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/[ \t]+\n/g, "\n")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttribute(value = "") {
  return escapeHtml(value).replaceAll("\n", " ");
}

function escapeJsonLd(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}
