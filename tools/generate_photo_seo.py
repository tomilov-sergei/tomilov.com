#!/usr/bin/env python3

import json
import re
import shutil
from datetime import datetime, timezone
from email.utils import format_datetime
from pathlib import Path
from urllib.parse import quote
from xml.etree import ElementTree as ET


ROOT_DIR = Path(__file__).resolve().parent.parent
PHOTOS_DIR = ROOT_DIR / "photos"
PHOTOS_ARCHIVE_DIR = PHOTOS_DIR / "archive"
POSTS_JSON_PATH = ROOT_DIR / "assets/telegram/posts.json"
PHOTOS_JSON_PATH = ROOT_DIR / "assets/photos/photos.json"
SITEMAP_PATH = ROOT_DIR / "sitemap.xml"
FEED_PATH = ROOT_DIR / "feed.xml"
PHOTOS_FEED_PATH = PHOTOS_DIR / "feed.xml"
SITE_URL = "https://tomilov.com"
SITE_NAME = "Серёжа Томилов"
PHOTOS_TITLE = "Фото"
PHOTOS_DESCRIPTION = "Витрина лучших снимков Серёжи Томилова."
LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"
LICENSE_NAME = "CC BY 4.0"
CHANNEL_TITLE = "Screenshot of the Day"
TELEGRAM_MEDIA_BASE = "https://s3.twcstorage.ru/00df5bd5-137f-492a-8d95-c7ee2cc2d851"
FEED_LIMIT = 50


def main():
    posts = sorted(read_json(POSTS_JSON_PATH, {"posts": []}).get("posts", []), key=post_sort_key, reverse=True)
    photos = sorted(read_json(PHOTOS_JSON_PATH, {"photos": []}).get("photos", []), key=photo_sort_key, reverse=True)
    photo_ids = {str(photo.get("id", "")) for photo in photos}

    PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    remove_stale_photo_dirs(photo_ids)

    for index, photo in enumerate(photos):
        photo_dir = PHOTOS_DIR / str(photo["id"])
        photo_dir.mkdir(parents=True, exist_ok=True)
        newer = photos[index - 1] if index > 0 else None
        older = photos[index + 1] if index + 1 < len(photos) else None
        (photo_dir / "index.html").write_text(render_photo_page(photo, newer, older), encoding="utf-8")

    PHOTOS_ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    (PHOTOS_DIR / "index.html").write_text(render_photos_page(photos), encoding="utf-8")
    (PHOTOS_ARCHIVE_DIR / "index.html").write_text(render_photos_archive(photos), encoding="utf-8")
    SITEMAP_PATH.write_text(render_sitemap(photos), encoding="utf-8")
    FEED_PATH.write_text(render_main_feed(posts, photos), encoding="utf-8")
    PHOTOS_FEED_PATH.write_text(render_photos_feed(photos), encoding="utf-8")

    print(f"Generated {len(photos)} photo pages")
    print(PHOTOS_ARCHIVE_DIR.relative_to(ROOT_DIR))
    print(SITEMAP_PATH.relative_to(ROOT_DIR))
    print(FEED_PATH.relative_to(ROOT_DIR))
    print(PHOTOS_FEED_PATH.relative_to(ROOT_DIR))


def render_photos_page(photos):
    image = photo_asset_url(photos[0].get("src")) if photos else f"{SITE_URL}/assets/og.png"
    json_ld = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": PHOTOS_TITLE,
        "description": PHOTOS_DESCRIPTION,
        "url": f"{SITE_URL}/photos/",
        "isPartOf": {"@type": "WebSite", "name": SITE_NAME, "url": SITE_URL},
        "creator": {"@type": "Person", "name": SITE_NAME, "url": SITE_URL},
        "license": LICENSE_URL,
    }

    feed = "\n        ".join(render_photo_card(photo, index) for index, photo in enumerate(photos))
    if not feed:
        feed = '<p class="feed-status" data-photo-status>Фотографий пока нет.</p>'

    return f"""<!doctype html>
<html lang="ru-RU">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>{PHOTOS_TITLE} — {SITE_NAME}</title>
    <meta name="description" content="{escape_attr(PHOTOS_DESCRIPTION)}">
    <link rel="canonical" href="{SITE_URL}/photos/">
    <link rel="alternate" type="application/rss+xml" title="{escape_attr(PHOTOS_TITLE)}" href="{SITE_URL}/photos/feed.xml">
    <meta property="og:type" content="website">
    <meta property="og:title" content="{PHOTOS_TITLE}">
    <meta property="og:description" content="{escape_attr(PHOTOS_DESCRIPTION)}">
    <meta property="og:image" content="{escape_attr(image)}">
    <meta property="og:url" content="{SITE_URL}/photos/">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{PHOTOS_TITLE}">
    <meta name="twitter:description" content="{escape_attr(PHOTOS_DESCRIPTION)}">
    <meta name="twitter:image" content="{escape_attr(image)}">
    <link rel="icon" href="/assets/favicon.png">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;700&family=Lora:wght@600&family=Manrope:wght@800&display=swap">
    <link rel="stylesheet" href="/styles.css?v={asset_version()}">
    <script type="application/ld+json">{json_script(json_ld)}</script>
  </head>
  <body>
    <main class="page photos-page">
      {render_header("/photos/")}

      <section class="photos-intro" aria-labelledby="photos-title">
        <h1 id="photos-title">Фото</h1>
      </section>

      <section class="photo-feed" data-photo-feed data-static-photo-feed aria-live="polite">
        {feed}
      </section>

      <footer class="photos-footer">
        <p>Витрина лучших снимков. Использование разрешено по лицензии <a href="{LICENSE_URL}" target="_blank" rel="license noopener">{LICENSE_NAME}</a> с указанием авторства.</p>
        <a href="/photos/archive/">Все фото</a>
      </footer>
    </main>

    {render_photo_dialog()}
    <script src="/script.js?v=20260531-upload-order"></script>
  </body>
</html>
"""


def render_photos_archive(photos):
    items = "\n        ".join(render_photo_index_link(photo) for photo in photos)

    return f"""<!doctype html>
<html lang="ru-RU">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>Все фото — {SITE_NAME}</title>
    <meta name="description" content="Статический индекс всех фото из раздела Фото.">
    <link rel="canonical" href="{SITE_URL}/photos/archive/">
    <link rel="alternate" type="application/rss+xml" title="{escape_attr(PHOTOS_TITLE)}" href="{SITE_URL}/photos/feed.xml">
    <meta property="og:type" content="website">
    <meta property="og:title" content="Все фото — {SITE_NAME}">
    <meta property="og:description" content="Статический индекс всех фото из раздела Фото.">
    <meta property="og:image" content="{SITE_URL}/assets/og.png">
    <meta property="og:url" content="{SITE_URL}/photos/archive/">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Все фото — {SITE_NAME}">
    <meta name="twitter:description" content="Статический индекс всех фото из раздела Фото.">
    <meta name="twitter:image" content="{SITE_URL}/assets/og.png">
    <link rel="icon" href="/assets/favicon.png">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;700&family=Lora:wght@600&family=Manrope:wght@800&display=swap">
    <link rel="stylesheet" href="/styles.css?v={asset_version()}">
  </head>
  <body>
    <main class="page photos-page">
      {render_header("/photos/archive/")}

      <section class="photos-intro compact" aria-labelledby="photos-archive-title">
        <p class="eyebrow">Static index</p>
        <h1 id="photos-archive-title">Все фото</h1>
        <a href="/photos/">Вернуться в фотоленту</a>
      </section>

      <section class="post-index-list" aria-label="Все фото">
        {items}
      </section>
    </main>
  </body>
</html>
"""


def render_photo_page(photo, newer, older):
    url = f"{SITE_URL}/photos/{photo['id']}/"
    title = f"{photo_title(photo)} — {PHOTOS_TITLE}"
    description = photo_description(photo)
    image = photo_asset_url(photo.get("src"))
    json_ld = photo_json_ld(photo, url, description)
    caption = f"<p>{escape_html(photo.get('caption'))}</p>" if clean_text(photo.get("caption")) else ""

    return f"""<!doctype html>
<html lang="ru-RU">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>{escape_html(title)}</title>
    <meta name="description" content="{escape_attr(description)}">
    <link rel="canonical" href="{url}">
    <link rel="alternate" type="application/rss+xml" title="{escape_attr(PHOTOS_TITLE)}" href="{SITE_URL}/photos/feed.xml">
    <meta property="og:type" content="article">
    <meta property="og:title" content="{escape_attr(photo_title(photo, 90))}">
    <meta property="og:description" content="{escape_attr(description)}">
    <meta property="og:image" content="{escape_attr(image)}">
    <meta property="og:url" content="{url}">
    <meta property="article:published_time" content="{escape_attr(iso_date(photo.get('date') or photo.get('uploadedAt')))}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{escape_attr(photo_title(photo, 90))}">
    <meta name="twitter:description" content="{escape_attr(description)}">
    <meta name="twitter:image" content="{escape_attr(image)}">
    <link rel="license" href="{LICENSE_URL}">
    <link rel="icon" href="/assets/favicon.png">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;700&family=Lora:wght@600&family=Manrope:wght@800&display=swap">
    <link rel="stylesheet" href="/styles.css?v={asset_version()}">
    <script type="application/ld+json">{json_script(json_ld)}</script>
  </head>
  <body>
    <main class="page photo-detail-page">
      {render_header(f"/photos/{photo['id']}/")}

      <nav class="post-breadcrumb" aria-label="Хлебные крошки">
        <a href="/photos/">Фото</a>
        <span aria-hidden="true">/</span>
        <a href="/photos/archive/">Все фото</a>
      </nav>

      <article class="photo-detail">
        <figure class="photo-detail-figure">
          <a href="{escape_attr(photo.get('src'))}">
            <img src="{escape_attr(photo.get('src'))}"{image_dimensions_attrs(photo)} decoding="async" alt="{escape_attr(photo_alt(photo))}">
          </a>
          <figcaption>
            <h1>{escape_html(photo_title(photo, 140))}</h1>
            {caption}
          </figcaption>
        </figure>

        {render_photo_meta(photo)}
      </article>

      <nav class="post-nav" aria-label="Соседние фото">
        {f'<a href="/photos/{newer["id"]}/">Новее</a>' if newer else '<span></span>'}
        {f'<a href="/photos/{older["id"]}/">Старее</a>' if older else '<span></span>'}
      </nav>
    </main>
  </body>
</html>
"""


def render_photo_card(photo, index):
    aspect = f' style="aspect-ratio: {int(photo["width"])} / {int(photo["height"])}"' if photo.get("width") and photo.get("height") else ""
    loading = "eager" if index < 4 else "lazy"
    hdr = '<span class="photo-hdr-badge">HDR</span>' if photo.get("hdr") else ""

    return f"""<article class="photo-entry">
          <a class="photo-card" href="/photos/{photo['id']}/"{aspect} aria-label="{escape_attr(photo_title(photo, 100))}">
            <img src="{escape_attr(photo.get('src'))}" loading="{loading}" decoding="async" alt="{escape_attr(photo_alt(photo))}">
            {hdr}
          </a>
          {render_photo_info(photo)}
        </article>"""


def render_photo_info(photo):
    technical = photo.get("technical") or {}
    location = photo_location(photo)
    settings = [item for item in technical.get("settings", []) if item.get("value")]
    settings_html = ""
    if settings:
        settings_html = f"""<div class="photo-settings">
              {"".join(f'<span>{escape_html(setting_value(item))}</span>' for item in settings)}
            </div>"""

    return f"""<div class="photo-info">
            <div class="photo-info-header">
              <strong>{escape_html(technical.get("cameraLine") or "Leica M6 — плёнка")}</strong>
            </div>
            <div class="photo-info-body">
              <p>{escape_html(technical.get("lensLine") or "Плёночная фотография")}</p>
              <p>{escape_html(technical.get("summary") or compact_text([format_dimensions(photo), format_file_size(photo.get("size"))]))}</p>
              {f'<p class="photo-location">{escape_html(location)}</p>' if location else ''}
            </div>
            {settings_html}
          </div>"""


def render_photo_index_link(photo):
    return f"""<a class="post-index-item" href="/photos/{photo['id']}/">
          <time datetime="{escape_attr(iso_date(photo.get('date') or photo.get('uploadedAt')))}">{escape_html(format_date(photo.get('date') or photo.get('uploadedAt')))}</time>
          <span>{escape_html(photo_title(photo, 120))}</span>
        </a>"""


def render_photo_meta(photo):
    technical = photo.get("technical") or {}
    location = photo_location(photo)
    settings = [item for item in technical.get("settings", []) if item.get("value")]

    rows = [
        ("Дата", f'<time datetime="{escape_attr(iso_date(photo.get("date") or photo.get("uploadedAt")))}">{escape_html(format_date(photo.get("date") or photo.get("uploadedAt")))}</time>'),
        ("Камера", escape_html(technical.get("cameraLine") or "Leica M6 — плёнка")),
        ("Объектив", escape_html(technical.get("lensLine") or "Плёночная фотография")),
    ]
    if location:
        rows.append(("Место", escape_html(location)))
    if settings:
        rows.append(("Настройки", escape_html(" · ".join(setting_value(item) for item in settings))))
    rows.extend([
        ("Файл", escape_html(compact_text([format_dimensions(photo), format_file_size(photo.get("size")), photo.get("mimeType")]))),
        ("Лицензия", f'<a href="{LICENSE_URL}" target="_blank" rel="license noopener">{LICENSE_NAME}</a>. Использование разрешено с указанием авторства и ссылки на эту страницу.'),
    ])

    return f"""<aside class="photo-detail-meta" aria-label="Информация о фото">
          <dl>
            {"".join(f'<div><dt>{label}</dt><dd>{value}</dd></div>' for label, value in rows)}
          </dl>
        </aside>"""


def photo_json_ld(photo, url, description):
    image = photo_asset_url(photo.get("src"))
    data = {
        "@context": "https://schema.org",
        "@type": "ImageObject",
        "name": photo_title(photo, 110),
        "caption": clean_text(photo.get("caption")) or photo_title(photo, 110),
        "description": description,
        "contentUrl": image,
        "url": url,
        "thumbnailUrl": image,
        "datePublished": iso_date(photo.get("date") or photo.get("uploadedAt")),
        "uploadDate": iso_date(photo.get("uploadedAt") or photo.get("date")),
        "creator": {"@type": "Person", "name": SITE_NAME, "url": SITE_URL},
        "creditText": SITE_NAME,
        "copyrightNotice": f"© {SITE_NAME}",
        "license": LICENSE_URL,
        "acquireLicensePage": url,
        "isPartOf": {"@type": "CollectionPage", "name": PHOTOS_TITLE, "url": f"{SITE_URL}/photos/"},
    }
    if photo.get("width"):
        data["width"] = f"{photo['width']}px"
    if photo.get("height"):
        data["height"] = f"{photo['height']}px"
    if photo_location(photo):
        data["contentLocation"] = {"@type": "Place", "name": photo_location(photo)}
    return data


def render_sitemap(photos):
    existing = read_existing_sitemap_non_photo_urls()
    latest = sitemap_date(photos[0].get("uploadedAt") or photos[0].get("date")) if photos else None
    photos_static = [
        {"loc": f"{SITE_URL}/photos/", "lastmod": latest},
        {"loc": f"{SITE_URL}/photos/archive/", "lastmod": latest},
    ]
    photo_urls = [
        {
            "loc": f"{SITE_URL}/photos/{photo['id']}/",
            "lastmod": sitemap_date(photo.get("uploadedAt") or photo.get("date")),
            "image": {
                "loc": photo_asset_url(photo.get("src")),
                "title": photo_title(photo, 110),
                "caption": clean_text(photo.get("caption")) or photo_title(photo, 110),
            },
        }
        for photo in photos
    ]
    urls = existing + photos_static + photo_urls

    body = "\n".join(render_sitemap_url(url) for url in urls)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
{body}
</urlset>
"""


def render_sitemap_url(url):
    lastmod = f"\n    <lastmod>{escape_html(url['lastmod'])}</lastmod>" if url.get("lastmod") else ""
    image = ""
    if url.get("image"):
        image = f"""
    <image:image>
      <image:loc>{escape_html(url['image']['loc'])}</image:loc>
      <image:title>{escape_html(url['image']['title'])}</image:title>
      <image:caption>{escape_html(url['image']['caption'])}</image:caption>
      <image:license>{LICENSE_URL}</image:license>
    </image:image>"""
    return f"""  <url>
    <loc>{escape_html(url['loc'])}</loc>{lastmod}{image}
  </url>"""


def render_main_feed(posts, photos):
    items = [post_feed_item(post) for post in posts] + [photo_feed_item(photo) for photo in photos]
    items = sorted(items, key=lambda item: item["sortDate"], reverse=True)[:FEED_LIMIT]
    return render_rss_feed(
        title=SITE_NAME,
        description="Новые записи и фотографии на tomilov.com.",
        link=f"{SITE_URL}/",
        self_url=f"{SITE_URL}/feed.xml",
        items=items,
    )


def render_photos_feed(photos):
    return render_rss_feed(
        title=f"{PHOTOS_TITLE} — {SITE_NAME}",
        description=PHOTOS_DESCRIPTION,
        link=f"{SITE_URL}/photos/",
        self_url=f"{SITE_URL}/photos/feed.xml",
        items=[photo_feed_item(photo) for photo in photos[:FEED_LIMIT]],
    )


def render_rss_feed(title, description, link, self_url, items):
    latest = items[0]["sortDate"] if items else datetime.now(timezone.utc)
    body = "\n".join(render_feed_item(item) for item in items)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>{escape_html(title)}</title>
    <link>{escape_html(link)}</link>
    <description>{escape_html(description)}</description>
    <language>ru-RU</language>
    <lastBuildDate>{rss_date(latest)}</lastBuildDate>
    <atom:link href="{escape_attr(self_url)}" rel="self" type="application/rss+xml"/>
{body}
  </channel>
</rss>
"""


def render_feed_item(item):
    category = f"\n      <category>{escape_html(item['category'])}</category>" if item.get("category") else ""
    media = ""
    if item.get("mediaUrl"):
        media_type = f' type="{escape_attr(item.get("mediaType"))}"' if item.get("mediaType") else ""
        media = f'\n      <media:content url="{escape_attr(item["mediaUrl"])}" medium="image"{media_type}/>'
    return f"""    <item>
      <title>{escape_html(item["title"])}</title>
      <link>{escape_html(item["link"])}</link>
      <guid isPermaLink="true">{escape_html(item["guid"])}</guid>
      <pubDate>{rss_date(item["pubDate"])}</pubDate>
      <description>{escape_html(item["description"])}</description>{category}{media}
    </item>"""


def post_feed_item(post):
    link = f"{SITE_URL}/screenshots/{post.get('id')}/"
    media = post_social_image(post)
    date = post_datetime(post)
    return {
        "title": post_title(post, 120),
        "link": link,
        "guid": link,
        "pubDate": date,
        "sortDate": date,
        "description": post_description(post),
        "category": CHANNEL_TITLE,
        "mediaUrl": media,
        "mediaType": guess_mime_type(media) if media else "",
    }


def photo_feed_item(photo):
    link = f"{SITE_URL}/photos/{photo.get('id')}/"
    media = photo_asset_url(photo.get("src"))
    date = parse_date(photo.get("uploadedAt") or photo.get("date"))
    return {
        "title": photo_title(photo, 120),
        "link": link,
        "guid": link,
        "pubDate": date,
        "sortDate": date,
        "description": f"{photo_description(photo)} Лицензия: {LICENSE_NAME}, использование с указанием авторства и ссылки на страницу фото.",
        "category": PHOTOS_TITLE,
        "mediaUrl": media,
        "mediaType": photo.get("mimeType") or guess_mime_type(media),
    }


def read_existing_sitemap_non_photo_urls():
    if not SITEMAP_PATH.exists():
        return [
            {"loc": f"{SITE_URL}/"},
            {"loc": f"{SITE_URL}/about"},
            {"loc": f"{SITE_URL}/screenshots/"},
            {"loc": f"{SITE_URL}/screenshots/posts/"},
        ]

    root = ET.fromstring(SITEMAP_PATH.read_text(encoding="utf-8"))
    namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    urls = []

    for node in root.findall("sm:url", namespace):
        loc = text_or_empty(node.find("sm:loc", namespace))
        if loc.startswith(f"{SITE_URL}/photos"):
            continue

        lastmod = text_or_empty(node.find("sm:lastmod", namespace))
        urls.append({"loc": loc, "lastmod": lastmod or None})

    return urls


def remove_stale_photo_dirs(photo_ids):
    for entry in PHOTOS_DIR.iterdir():
        if not entry.is_dir() or entry.name == "archive" or entry.name in photo_ids:
            continue
        shutil.rmtree(entry)


def render_header(current_path):
    is_screenshots = current_path.startswith("/screenshots/")
    is_photos = current_path.startswith("/photos/")
    is_about = current_path.startswith("/about/")
    return f"""<header class="site-header" aria-label="Навигация">
        <a class="brand" href="/">SS/84</a>
        <nav class="path" aria-label="Разделы">
          <a href="/screenshots/"{' aria-current="page"' if is_screenshots else ''}>Блог</a>
          <a href="/photos/"{' aria-current="page"' if is_photos else ''}>Фото</a>
          <a href="/about/"{' aria-current="page"' if is_about else ''}><span class="desktop-name">Серёжа Томилов</span><span class="mobile-name">about</span></a>
        </nav>
      </header>"""


def render_photo_dialog():
    return """<dialog class="photo-viewer" data-photo-dialog aria-label="Просмотр фотографии">
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
    </dialog>"""


def post_title(post, max_length=72):
    title = clean_text(post.get("text")) or f"Пост от {format_date(post_datetime(post))}"
    return truncate(title, max_length)


def post_description(post):
    description = clean_text(post.get("text")) or f"Пост канала {CHANNEL_TITLE} от {format_date(post_datetime(post))}."
    return truncate(description, 156)


def post_social_image(post):
    for media in post.get("media") or []:
        if media.get("type") in ["photo", "sticker"] or media.get("poster"):
            return telegram_asset_url(media.get("poster") or media.get("src"))
    return ""


def telegram_asset_url(src):
    if not src:
        return ""
    if str(src).startswith("/assets/telegram/"):
        return f"{TELEGRAM_MEDIA_BASE}{src}"
    return str(src)


def post_sort_key(post):
    if post.get("dateUnixtime"):
        try:
            return int(post.get("dateUnixtime"))
        except ValueError:
            pass
    return int(post_datetime(post).timestamp())


def post_datetime(post):
    if post.get("date"):
        return parse_date(post.get("date"))
    if post.get("dateUnixtime"):
        try:
            return datetime.fromtimestamp(int(post.get("dateUnixtime")), tz=timezone.utc)
        except ValueError:
            pass
    return datetime.now(timezone.utc)


def photo_title(photo, max_length=72):
    title = clean_text(photo.get("caption")) or compact_text([
        photo_location(photo),
        (photo.get("technical") or {}).get("cameraLine"),
        format_date(photo.get("date") or photo.get("uploadedAt")),
    ]) or f"Фото от {format_date(photo.get('date') or photo.get('uploadedAt'))}"
    return truncate(title, max_length)


def photo_description(photo):
    description = compact_text([
        clean_text(photo.get("caption")),
        photo_location(photo),
        (photo.get("technical") or {}).get("cameraLine"),
        (photo.get("technical") or {}).get("lensLine"),
        format_date(photo.get("date") or photo.get("uploadedAt")),
    ]) or f"Фото Серёжи Томилова от {format_date(photo.get('date') or photo.get('uploadedAt'))}."
    return truncate(description, 156)


def photo_alt(photo):
    return clean_text(photo.get("alt")) or clean_text(photo.get("caption")) or photo_title(photo, 100)


def photo_location(photo):
    location = photo.get("location") or {}
    value = clean_text(location.get("label") or location.get("name"))
    normalized = re.sub(r"^локация:?\s*", "", value.lower())
    if not value or normalized == "не указана" or re.match(r"^-?\d+(?:\.\d+)?,\s*-?\d+(?:\.\d+)?$", value):
        return ""
    return value


def photo_asset_url(src):
    if not src:
        return f"{SITE_URL}/assets/og.png"
    if str(src).startswith(("http://", "https://")):
        return src
    return f"{SITE_URL}{src}"


def photo_sort_key(photo):
    return photo.get("uploadedAt") or photo.get("id") or photo.get("date") or ""


def image_dimensions_attrs(photo):
    width = photo.get("width")
    height = photo.get("height")
    if width and height:
        return f' width="{escape_attr(width)}" height="{escape_attr(height)}"'
    return ""


def setting_value(item):
    return f"ISO {item.get('value')}" if item.get("label") == "ISO" else str(item.get("value", ""))


def compact_text(values):
    return " · ".join(str(value) for value in values if clean_text(value))


def format_dimensions(photo):
    return f"{photo.get('width')} × {photo.get('height')}" if photo.get("width") and photo.get("height") else ""


def format_file_size(value):
    if not value:
        return ""
    value = int(value)
    if value >= 1024 * 1024:
        return f"{value / (1024 * 1024):.1f}".replace(".", ",") + " MB"
    if value >= 1024:
        return f"{round(value / 1024)} KB"
    return f"{value} B"


def format_date(value):
    months = [
        "января", "февраля", "марта", "апреля", "мая", "июня",
        "июля", "августа", "сентября", "октября", "ноября", "декабря",
    ]
    date = parse_date(value)
    return f"{date.day} {months[date.month - 1]} {date.year} г."


def iso_date(value):
    return parse_date(value).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def sitemap_date(value):
    return iso_date(value)[:10]


def rss_date(value):
    return format_datetime(parse_date(value), usegmt=True)


def parse_date(value):
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc)
    if not value:
        return datetime.now(timezone.utc)
    text = str(value).replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(text).astimezone(timezone.utc)
    except ValueError:
        return datetime.now(timezone.utc)


def guess_mime_type(value=""):
    value = str(value).split("?")[0].lower()
    if value.endswith(".png"):
        return "image/png"
    if value.endswith(".webp"):
        return "image/webp"
    if value.endswith(".gif"):
        return "image/gif"
    if value.endswith(".avif"):
        return "image/avif"
    return "image/jpeg"


def read_json(path, fallback):
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def text_or_empty(node):
    return node.text.strip() if node is not None and node.text else ""


def asset_version():
    for source in [ROOT_DIR / "index.html", ROOT_DIR / "photos/index.html", ROOT_DIR / "screenshots/index.html"]:
        if not source.exists():
            continue
        match = re.search(r"/styles\.css\?v=([^\"]+)", source.read_text(encoding="utf-8"))
        if match:
            return match.group(1)
    return "20260531-photo-info"


def clean_text(value):
    if value is None:
        return ""
    return re.sub(r"\s+", " ", str(value)).strip()


def truncate(value, max_length):
    value = str(value)
    if len(value) <= max_length:
        return value
    return value[: max_length - 1].strip() + "…"


def escape_html(value=""):
    return clean_text(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def escape_attr(value=""):
    return escape_html(value).replace("\n", " ")


def json_script(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")


if __name__ == "__main__":
    main()
