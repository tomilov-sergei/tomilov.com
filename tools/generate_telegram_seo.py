#!/usr/bin/env python3

import json
import re
import shutil
from pathlib import Path
from zoneinfo import ZoneInfo

import generate_photo_seo as shared


ROOT_DIR = Path(__file__).resolve().parent.parent
SCREENSHOTS_DIR = ROOT_DIR / "screenshots"
POSTS_INDEX_DIR = SCREENSHOTS_DIR / "posts"
POSTS_JSON_PATH = ROOT_DIR / "assets/telegram/posts.json"
PHOTOS_JSON_PATH = ROOT_DIR / "assets/photos/photos.json"
SITEMAP_PATH = ROOT_DIR / "sitemap.xml"
FEED_PATH = ROOT_DIR / "feed.xml"
SCREENSHOTS_FEED_PATH = SCREENSHOTS_DIR / "feed.xml"
DISPLAY_TZ = ZoneInfo("Europe/Moscow")


def main():
    posts = sorted(
        shared.read_json(POSTS_JSON_PATH, {"posts": []}).get("posts", []),
        key=shared.post_sort_key,
        reverse=True,
    )
    photos = sorted(
        shared.read_json(PHOTOS_JSON_PATH, {"photos": []}).get("photos", []),
        key=shared.photo_sort_key,
        reverse=True,
    )
    post_ids = {str(post.get("id", "")) for post in posts}

    SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    remove_stale_post_dirs(post_ids)

    for index, post in enumerate(posts):
        post_dir = SCREENSHOTS_DIR / str(post["id"])
        post_dir.mkdir(parents=True, exist_ok=True)
        newer = posts[index - 1] if index > 0 else None
        older = posts[index + 1] if index + 1 < len(posts) else None
        (post_dir / "index.html").write_text(render_post_page(post, newer, older), encoding="utf-8")

    POSTS_INDEX_DIR.mkdir(parents=True, exist_ok=True)
    (POSTS_INDEX_DIR / "index.html").write_text(render_posts_index(posts), encoding="utf-8")
    SITEMAP_PATH.write_text(render_sitemap(posts, photos), encoding="utf-8")
    FEED_PATH.write_text(render_main_feed(posts, photos), encoding="utf-8")
    SCREENSHOTS_FEED_PATH.write_text(render_screenshots_feed(posts), encoding="utf-8")

    print(f"Generated {len(posts)} post pages")
    print(POSTS_INDEX_DIR.relative_to(ROOT_DIR))
    print(SITEMAP_PATH.relative_to(ROOT_DIR))
    print(FEED_PATH.relative_to(ROOT_DIR))
    print(SCREENSHOTS_FEED_PATH.relative_to(ROOT_DIR))


def render_post_page(post, newer, older):
    url = f"{shared.SITE_URL}/screenshots/{post['id']}/"
    title = f"{post_title(post)} — {shared.CHANNEL_TITLE}"
    description = post_description(post)
    image = shared.post_social_image(post)
    social_image = image or f"{shared.SITE_URL}/assets/og.png"
    json_ld = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": post_title(post, 110),
        "description": description,
        "datePublished": shared.iso_date(post.get("date")),
        "dateModified": shared.iso_date(post.get("edited") or post.get("date")),
        "mainEntityOfPage": url,
        "url": url,
        "author": {"@type": "Person", "name": shared.SITE_NAME, "url": shared.SITE_URL},
        "publisher": {"@type": "Person", "name": shared.SITE_NAME, "url": shared.SITE_URL},
        "isPartOf": {"@type": "Blog", "name": shared.CHANNEL_TITLE, "url": f"{shared.SITE_URL}/screenshots/"},
    }
    if image:
        json_ld["image"] = [image]

    return f"""<!doctype html>
<html lang="ru-RU">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>{shared.escape_html(title)}</title>
    <meta name="description" content="{shared.escape_attr(description)}">
    <link rel="canonical" href="{url}">
    <link rel="alternate" type="application/rss+xml" title="{shared.escape_attr(shared.CHANNEL_TITLE)}" href="{shared.SITE_URL}/screenshots/feed.xml">
    <meta property="og:type" content="article">
    <meta property="og:title" content="{shared.escape_attr(post_title(post, 90))}">
    <meta property="og:description" content="{shared.escape_attr(description)}">
    <meta property="og:image" content="{shared.escape_attr(social_image)}">
    <meta property="og:url" content="{url}">
    <meta property="article:published_time" content="{shared.escape_attr(shared.iso_date(post.get('date')))}">
    <meta property="article:modified_time" content="{shared.escape_attr(shared.iso_date(post.get('edited') or post.get('date')))}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{shared.escape_attr(post_title(post, 90))}">
    <meta name="twitter:description" content="{shared.escape_attr(description)}">
    <meta name="twitter:image" content="{shared.escape_attr(social_image)}">
    <link rel="icon" href="/assets/favicon.png">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;700&family=Lora:wght@600&family=Manrope:wght@800&display=swap">
    <link rel="stylesheet" href="/styles.css?v={shared.asset_version()}">
    <script type="application/ld+json">{shared.json_script(json_ld)}</script>
  </head>
  <body>
    <main class="page screenshots-page">
      {shared.render_header(f"/screenshots/{post['id']}/")}

      <nav class="post-breadcrumb" aria-label="Хлебные крошки">
        <a href="/screenshots/">Блог</a>
        <span aria-hidden="true">/</span>
        <a href="/screenshots/posts/">Все посты</a>
      </nav>

      {render_static_post(post)}

      <nav class="post-nav" aria-label="Соседние посты">
        {f'<a href="/screenshots/{newer["id"]}/">Новее</a>' if newer else '<span></span>'}
        {f'<a href="/screenshots/{older["id"]}/">Старее</a>' if older else '<span></span>'}
      </nav>
    </main>
    <script src="/script.js?v={shared.asset_version()}"></script>
  </body>
</html>
"""


def render_posts_index(posts):
    description = f"Статический индекс всех постов канала {shared.CHANNEL_TITLE}."
    items = "\n        ".join(render_post_index_link(post) for post in posts)

    return f"""<!doctype html>
<html lang="ru-RU">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>Все посты — {shared.CHANNEL_TITLE}</title>
    <meta name="description" content="{shared.escape_attr(description)}">
    <link rel="canonical" href="{shared.SITE_URL}/screenshots/posts/">
    <link rel="alternate" type="application/rss+xml" title="{shared.escape_attr(shared.CHANNEL_TITLE)}" href="{shared.SITE_URL}/screenshots/feed.xml">
    <meta property="og:type" content="website">
    <meta property="og:title" content="Все посты — {shared.CHANNEL_TITLE}">
    <meta property="og:description" content="{shared.escape_attr(description)}">
    <meta property="og:image" content="{shared.SITE_URL}/assets/og.png">
    <meta property="og:url" content="{shared.SITE_URL}/screenshots/posts/">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="Все посты — {shared.CHANNEL_TITLE}">
    <meta name="twitter:description" content="{shared.escape_attr(description)}">
    <meta name="twitter:image" content="{shared.SITE_URL}/assets/og.png">
    <link rel="icon" href="/assets/favicon.png">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;700&family=Lora:wght@600&family=Manrope:wght@800&display=swap">
    <link rel="stylesheet" href="/styles.css?v={shared.asset_version()}">
  </head>
  <body>
    <main class="page screenshots-page">
      {shared.render_header("/screenshots/posts/")}

      <section class="screenshots-intro compact" aria-labelledby="posts-title">
        <p class="eyebrow">Static index</p>
        <h1 id="posts-title">Все посты</h1>
        <a href="/screenshots/">Вернуться в блог</a>
      </section>

      <section class="post-index-list" aria-label="Все посты Screenshot of the Day">
        {items}
      </section>
    </main>
  </body>
</html>
"""


def render_post_index_link(post):
    return f"""<a class="post-index-item" href="/screenshots/{post['id']}/">
          <time datetime="{shared.escape_attr(shared.iso_date(post.get('date')))}">{shared.escape_html(format_post_date(post))}</time>
          <span>{shared.escape_html(post_title(post, 120))}</span>
        </a>"""


def render_static_post(post):
    media = f"        {render_media(post.get('media') or [], post)}\n" if post.get("media") else ""
    text = f'          <div class="screenshot-text">{render_rich_text(post)}</div>\n' if post.get("text") else ""
    reactions = f"\n            {render_reactions(post.get('reactions') or [])}" if post.get("reactions") else ""

    return f"""<article class="screenshot-post" id="post-{shared.escape_attr(post.get('id'))}">
{media}        <div class="screenshot-body">
          <h1 class="post-title">{shared.escape_html(post_title(post, 140))}</h1>
{text}          <div class="screenshot-meta">
            <a class="screenshot-date" href="{shared.escape_attr(post.get('telegramUrl'))}" target="_blank" rel="noopener"><time datetime="{shared.escape_attr(shared.iso_date(post.get('date')))}">{shared.escape_html(format_post_date(post))}</time></a>{reactions}
          </div>
        </div>
      </article>"""


def render_media(items, post):
    class_name = f"screenshot-media{' is-grid' if len(items) > 1 else ' is-single'}"
    body = "\n          ".join(render_media_item(item, post, index) for index, item in enumerate(items))
    return f"""<div class="{class_name}">
          {body}
        </div>"""


def render_media_item(media, post, index):
    aspect = f' style="aspect-ratio: {int(media["width"])} / {int(media["height"])}"' if media.get("width") and media.get("height") else ""
    alt = shared.escape_attr(media_alt(post, index))
    src = shared.escape_attr(shared.telegram_asset_url(media.get("src")))

    if media.get("type") in {"photo", "sticker"}:
        return f"""<div class="screenshot-media-item is-image"{aspect}>
            <img src="{src}" loading="{'eager' if index == 0 else 'lazy'}" decoding="async" alt="{alt}">
          </div>"""

    if media.get("type") in {"video", "animation"}:
        poster = f' poster="{shared.escape_attr(shared.telegram_asset_url(media.get("poster")))}"' if media.get("poster") else ""
        loop = " loop muted" if media.get("type") == "animation" else ""
        return f"""<div class="screenshot-media-item is-video"{aspect}>
            <video src="{src}" controls preload="metadata" playsinline{poster}{loop}></video>
          </div>"""

    return f"""<div class="screenshot-media-item">
            <a href="{src}">{shared.escape_html(media.get('name') or 'Файл')}</a>
          </div>"""


def render_rich_text(post):
    text = str(post.get("text") or "")
    entities = post.get("entities") or []
    entity_text = "".join(str(entity.get("text", "")) for entity in entities)

    if not entities or entity_text != text:
        return strip_line_end_whitespace(escape_text_html(text))

    chunks = []
    for entity in entities:
        value = escape_text_html(entity.get("text", ""))
        if entity.get("type") == "text_link" and entity.get("href"):
            chunks.append(f'<a href="{shared.escape_attr(entity.get("href"))}" target="_blank" rel="noopener">{value}</a>')
        else:
            chunks.append(value)

    return strip_line_end_whitespace("".join(chunks))


def render_reactions(reactions):
    items = "\n              ".join(
        f"<span>{shared.escape_html(f'{reaction.get('emoji')} {reaction.get('count')}')}</span>"
        for reaction in reactions
    )
    return f"""<div class="screenshot-reactions">
              {items}
            </div>"""


def render_sitemap(posts, photos):
    latest_post = shared.sitemap_date(posts[0].get("edited") or posts[0].get("date")) if posts else None
    latest_photo = shared.sitemap_date(photos[0].get("uploadedAt") or photos[0].get("date")) if photos else None
    static_urls = [
        {"loc": f"{shared.SITE_URL}/"},
        {"loc": f"{shared.SITE_URL}/about"},
        {"loc": f"{shared.SITE_URL}/screenshots/"},
        {"loc": f"{shared.SITE_URL}/photos/", "lastmod": latest_photo},
        {"loc": f"{shared.SITE_URL}/photos/archive/", "lastmod": latest_photo},
        {"loc": f"{shared.SITE_URL}/screenshots/posts/", "lastmod": latest_post},
    ]
    post_urls = [
        {
            "loc": f"{shared.SITE_URL}/screenshots/{post['id']}/",
            "lastmod": shared.sitemap_date(post.get("edited") or post.get("date")),
        }
        for post in posts
    ]
    photo_urls = [
        {
            "loc": f"{shared.SITE_URL}/photos/{photo['id']}/",
            "lastmod": shared.sitemap_date(photo.get("uploadedAt") or photo.get("date")),
            "image": {
                "loc": shared.photo_asset_url(photo.get("src")),
                "title": shared.photo_title(photo, 110),
                "caption": shared.clean_text(photo.get("caption")) or shared.photo_title(photo, 110),
            },
        }
        for photo in photos
    ]
    body = "\n".join(shared.render_sitemap_url(url) for url in [*static_urls, *post_urls, *photo_urls])
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
{body}
</urlset>
"""


def render_screenshots_feed(posts):
    return shared.render_rss_feed(
        title=shared.CHANNEL_TITLE,
        description=f"Новые посты канала {shared.CHANNEL_TITLE}.",
        link=f"{shared.SITE_URL}/screenshots/",
        self_url=f"{shared.SITE_URL}/screenshots/feed.xml",
        items=[post_feed_item(post) for post in posts[: shared.FEED_LIMIT]],
    )


def render_main_feed(posts, photos):
    items = [post_feed_item(post) for post in posts] + [shared.photo_feed_item(photo) for photo in photos]
    items = sorted(items, key=lambda item: item["sortDate"], reverse=True)[: shared.FEED_LIMIT]
    return shared.render_rss_feed(
        title=shared.SITE_NAME,
        description="Новые записи и фотографии на tomilov.com.",
        link=f"{shared.SITE_URL}/",
        self_url=f"{shared.SITE_URL}/feed.xml",
        items=items,
    )


def post_feed_item(post):
    link = f"{shared.SITE_URL}/screenshots/{post.get('id')}/"
    media = shared.post_social_image(post)
    date = shared.post_datetime(post)
    return {
        "title": post_title(post, 120),
        "link": link,
        "guid": link,
        "pubDate": date,
        "sortDate": date,
        "description": post_description(post),
        "category": shared.CHANNEL_TITLE,
        "mediaUrl": media,
        "mediaType": shared.guess_mime_type(media) if media else "",
    }


def remove_stale_post_dirs(post_ids):
    for entry in SCREENSHOTS_DIR.iterdir():
        if not entry.is_dir() or not entry.name.isdigit() or entry.name in post_ids:
            continue
        shutil.rmtree(entry)


def media_alt(post, index):
    title = post_title(post, 90)
    return title if index == 0 else f"{title}, медиа {index + 1}"


def post_title(post, max_length=72):
    text = shared.clean_text(post.get("text"))
    fallback = f"Пост от {format_post_date(post)}"
    return truncate_js_string(text or fallback, max_length)


def post_description(post):
    text = shared.clean_text(post.get("text"))
    fallback = f"Пост канала {shared.CHANNEL_TITLE} от {format_post_date(post)}."
    return truncate_js_string(text or fallback, 156)


def format_post_date(post):
    value = post.get("date") or shared.post_datetime(post)
    date = shared.parse_date(value).astimezone(DISPLAY_TZ)
    months = [
        "января", "февраля", "марта", "апреля", "мая", "июня",
        "июля", "августа", "сентября", "октября", "ноября", "декабря",
    ]
    return f"{date.day} {months[date.month - 1]} {date.year} г."


def truncate_js_string(value, max_length):
    value = str(value)
    if utf16_code_units(value) <= max_length:
        return value
    return utf16_slice(value, max_length - 1).strip() + "…"


def utf16_code_units(value):
    return len(str(value).encode("utf-16-le", "surrogatepass")) // 2


def utf16_slice(value, code_units):
    data = str(value).encode("utf-16-le", "surrogatepass")[: code_units * 2]
    return data.decode("utf-16-le", "replace")


def escape_text_html(value=""):
    return str(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def strip_line_end_whitespace(value=""):
    return re.sub(r"[ \t]+$", "", str(value), flags=re.MULTILINE)


if __name__ == "__main__":
    main()
