#!/usr/bin/env node

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const screenshotsDir = path.join(rootDir, "screenshots");
const postsIndexDir = path.join(screenshotsDir, "posts");
const postsJsonPath = path.join(rootDir, "assets", "telegram", "posts.json");
const sitemapPath = path.join(rootDir, "sitemap.xml");
const siteUrl = "https://tomilov.com";
const siteName = "Серёжа Томилов";
const channelTitle = "Screenshot of the Day";
const telegramMediaBase = "https://s3.twcstorage.ru/00df5bd5-137f-492a-8d95-c7ee2cc2d851";
const assetVersion = getCurrentAssetVersion();

if (!existsSync(postsJsonPath)) {
  throw new Error(`Telegram posts JSON was not found: ${postsJsonPath}`);
}

const data = JSON.parse(readFileSync(postsJsonPath, "utf8"));
const posts = [...(data.posts || [])].sort((a, b) => Number(b.dateUnixtime || 0) - Number(a.dateUnixtime || 0));
const postIds = new Set(posts.map((post) => String(post.id)));

mkdirSync(screenshotsDir, { recursive: true });
removeStalePostDirs(postIds);

for (const [index, post] of posts.entries()) {
  const postDir = path.join(screenshotsDir, String(post.id));
  mkdirSync(postDir, { recursive: true });
  writeFileSync(path.join(postDir, "index.html"), renderPostPage(post, posts[index - 1], posts[index + 1]));
}

mkdirSync(postsIndexDir, { recursive: true });
writeFileSync(path.join(postsIndexDir, "index.html"), renderPostsIndex(posts));
writeFileSync(sitemapPath, renderSitemap(posts));

console.log(`Generated ${posts.length} post pages`);
console.log(path.relative(rootDir, postsIndexDir));
console.log(path.relative(rootDir, sitemapPath));

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
  const latest = posts[0];
  const description = `Статический индекс всех постов канала ${channelTitle}.`;

  return `<!doctype html>
<html lang="ru-RU">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>Все посты — ${channelTitle}</title>
    <meta name="description" content="${escapeAttribute(description)}">
    <link rel="canonical" href="${siteUrl}/screenshots/posts/">
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
  const isAbout = currentPath.startsWith("/about/");

  return `<header class="site-header" aria-label="Навигация">
        <a class="brand" href="/">SS/84</a>
        <nav class="path" aria-label="Разделы">
          <a href="/screenshots/"${isScreenshots ? ' aria-current="page"' : ""}>Блог</a>
          <a href="/about/"${isAbout ? ' aria-current="page"' : ""}><span class="desktop-name">Серёжа Томилов</span><span class="mobile-name">about</span></a>
        </nav>
      </header>`;
}

function renderSitemap(posts) {
  const staticUrls = [
    { loc: `${siteUrl}/` },
    { loc: `${siteUrl}/about` },
    { loc: `${siteUrl}/screenshots/` },
    { loc: `${siteUrl}/screenshots/posts/`, lastmod: posts[0] ? toSitemapDate(posts[0].edited || posts[0].date) : null },
  ];

  const postUrls = posts.map((post) => ({
    loc: `${siteUrl}/screenshots/${post.id}/`,
    lastmod: toSitemapDate(post.edited || post.date),
  }));

  const urls = [...staticUrls, ...postUrls];

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map((url) => `  <url>
    <loc>${escapeHtml(url.loc)}</loc>${url.lastmod ? `\n    <lastmod>${escapeHtml(url.lastmod)}</lastmod>` : ""}
  </url>`)
  .join("\n")}
</urlset>
`;
}

function removeStalePostDirs(postIds) {
  for (const entry of readdirSync(screenshotsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name) || postIds.has(entry.name)) {
      continue;
    }

    rmSync(path.join(screenshotsDir, entry.name), { recursive: true, force: true });
  }
}

function getCurrentAssetVersion() {
  const screenshotsIndex = path.join(rootDir, "screenshots", "index.html");
  if (!existsSync(screenshotsIndex)) return "20260526-1549";

  const html = readFileSync(screenshotsIndex, "utf8");
  const match = html.match(/\/styles\.css\?v=([^"]+)/);
  return match?.[1] || "20260526-1549";
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

function normalizeWhitespace(value = "") {
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
