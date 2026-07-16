#!/usr/bin/env python3

import json
import re
import shutil
from pathlib import Path
from zoneinfo import ZoneInfo

import generate_photo_seo as shared
import generate_home_canvas


ROOT_DIR = Path(__file__).resolve().parent.parent
SCREENSHOTS_DIR = ROOT_DIR / "screenshots"
POSTS_INDEX_DIR = SCREENSHOTS_DIR / "posts"
EN_SCREENSHOTS_DIR = ROOT_DIR / "en/screenshots"
EN_POSTS_INDEX_DIR = EN_SCREENSHOTS_DIR / "posts"
POSTS_JSON_PATH = ROOT_DIR / "assets/telegram/posts.json"
PHOTOS_JSON_PATH = ROOT_DIR / "assets/photos/photos.json"
SITEMAP_PATH = ROOT_DIR / "sitemap.xml"
FEED_PATH = ROOT_DIR / "feed.xml"
EN_FEED_PATH = ROOT_DIR / "en/feed.xml"
SCREENSHOTS_FEED_PATH = SCREENSHOTS_DIR / "feed.xml"
EN_SCREENSHOTS_FEED_PATH = EN_SCREENSHOTS_DIR / "feed.xml"
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

    for lang in shared.LANGUAGES:
        screenshots_dir = screenshots_dir_for_lang(lang)
        posts_index_dir = posts_index_dir_for_lang(lang)
        screenshots_dir.mkdir(parents=True, exist_ok=True)
        remove_stale_post_dirs(post_ids, screenshots_dir)

        for index, post in enumerate(posts):
            post_dir = screenshots_dir / str(post["id"])
            post_dir.mkdir(parents=True, exist_ok=True)
            newer = posts[index - 1] if index > 0 else None
            older = posts[index + 1] if index + 1 < len(posts) else None
            (post_dir / "index.html").write_text(render_post_page(post, newer, older, lang), encoding="utf-8")

        posts_index_dir.mkdir(parents=True, exist_ok=True)
        (posts_index_dir / "index.html").write_text(render_posts_index(posts, lang), encoding="utf-8")

    SITEMAP_PATH.write_text(render_sitemap(posts, photos), encoding="utf-8")
    FEED_PATH.write_text(render_main_feed(posts, photos, "ru"), encoding="utf-8")
    EN_FEED_PATH.parent.mkdir(parents=True, exist_ok=True)
    EN_FEED_PATH.write_text(render_main_feed(posts, photos, "en"), encoding="utf-8")
    SCREENSHOTS_FEED_PATH.write_text(render_screenshots_feed(posts, "ru"), encoding="utf-8")
    EN_SCREENSHOTS_FEED_PATH.parent.mkdir(parents=True, exist_ok=True)
    EN_SCREENSHOTS_FEED_PATH.write_text(render_screenshots_feed(posts, "en"), encoding="utf-8")
    generate_home_canvas.generate(posts, photos)

    print(f"Generated {len(posts)} post pages")
    print(POSTS_INDEX_DIR.relative_to(ROOT_DIR))
    print(EN_POSTS_INDEX_DIR.relative_to(ROOT_DIR))
    print(SITEMAP_PATH.relative_to(ROOT_DIR))
    print(FEED_PATH.relative_to(ROOT_DIR))
    print(EN_FEED_PATH.relative_to(ROOT_DIR))
    print(SCREENSHOTS_FEED_PATH.relative_to(ROOT_DIR))
    print(EN_SCREENSHOTS_FEED_PATH.relative_to(ROOT_DIR))
    print(ROOT_DIR.joinpath("index.html").relative_to(ROOT_DIR))
    print(ROOT_DIR.joinpath("en/index.html").relative_to(ROOT_DIR))


def screenshots_dir_for_lang(lang):
    return EN_SCREENSHOTS_DIR if lang == "en" else SCREENSHOTS_DIR


def posts_index_dir_for_lang(lang):
    return EN_POSTS_INDEX_DIR if lang == "en" else POSTS_INDEX_DIR


def all_posts_label(lang):
    return "All posts" if lang == "en" else "Все посты"


def back_to_blog_label(lang):
    return "Back to blog" if lang == "en" else "Вернуться в блог"


def posts_index_description(lang):
    if lang == "en":
        return f"A static index of every {shared.CHANNEL_TITLE} post."
    return f"Статический индекс всех постов канала {shared.CHANNEL_TITLE}."


def post_nav_label(lang):
    return "Adjacent posts" if lang == "en" else "Соседние посты"


def file_label(lang):
    return "File" if lang == "en" else "Файл"


def render_post_page(post, newer, older, lang="ru"):
    page_path = f"/screenshots/{post['id']}/"
    url = shared.localized_url(page_path, lang)
    title = f"{post_title(post, 72, lang)} — {shared.CHANNEL_TITLE}"
    description = post_description(post, lang)
    image = shared.post_social_image(post)
    social_image = image or f"{shared.SITE_URL}/assets/og.png"
    json_ld = {
        "@context": "https://schema.org",
        "@type": "BlogPosting",
        "headline": post_title(post, 110, lang),
        "description": description,
        "datePublished": shared.iso_date(post.get("date")),
        "dateModified": shared.iso_date(post.get("edited") or post.get("date")),
        "mainEntityOfPage": url,
        "url": url,
        "author": {"@type": "Person", "name": shared.tr(lang, "site_name"), "url": shared.SITE_URL},
        "publisher": {"@type": "Person", "name": shared.tr(lang, "site_name"), "url": shared.SITE_URL},
        "isPartOf": {"@type": "Blog", "name": shared.CHANNEL_TITLE, "url": shared.localized_url("/screenshots/", lang)},
    }
    if image:
        json_ld["image"] = [image]
    newer_link = f'<a href="{shared.localized_path("/screenshots/" + str(newer["id"]) + "/", lang)}">{shared.tr(lang, "newer")}</a>' if newer else "<span></span>"
    older_link = f'<a href="{shared.localized_path("/screenshots/" + str(older["id"]) + "/", lang)}">{shared.tr(lang, "older")}</a>' if older else "<span></span>"

    return f"""<!doctype html>
<html lang="{shared.tr(lang, 'html_lang')}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>{shared.escape_html(title)}</title>
    <meta name="description" content="{shared.escape_attr(description)}">
    <link rel="canonical" href="{url}">
{shared.alternate_links(page_path, lang)}
    <link rel="alternate" type="application/rss+xml" title="{shared.escape_attr(shared.CHANNEL_TITLE)}" href="{shared.localized_url('/screenshots/feed.xml', lang)}">
    <meta property="og:type" content="article">
    <meta property="og:title" content="{shared.escape_attr(post_title(post, 90, lang))}">
    <meta property="og:description" content="{shared.escape_attr(description)}">
    <meta property="og:image" content="{shared.escape_attr(social_image)}">
    <meta property="og:url" content="{url}">
    <meta property="article:published_time" content="{shared.escape_attr(shared.iso_date(post.get('date')))}">
    <meta property="article:modified_time" content="{shared.escape_attr(shared.iso_date(post.get('edited') or post.get('date')))}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{shared.escape_attr(post_title(post, 90, lang))}">
    <meta name="twitter:description" content="{shared.escape_attr(description)}">
    <meta name="twitter:image" content="{shared.escape_attr(social_image)}">
    <link rel="icon" href="/assets/favicon.png">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;700&family=Lora:wght@600&family=Manrope:wght@800&display=swap">
    <link rel="stylesheet" href="/styles.css?v={shared.asset_version()}">
    <script type="application/ld+json">{shared.json_script(json_ld)}</script>
  </head>
  <body>
    <main class="page screenshots-page" data-page-lang="{lang}">
      {shared.render_header(page_path, lang)}

      <nav class="post-breadcrumb" aria-label="{shared.tr(lang, 'breadcrumbs')}">
        <a href="{shared.localized_path('/screenshots/', lang)}">{shared.tr(lang, 'blog')}</a>
        <span aria-hidden="true">/</span>
        <a href="{shared.localized_path('/screenshots/posts/', lang)}">{all_posts_label(lang)}</a>
      </nav>

      {render_static_post(post, lang)}

      <nav class="post-nav" aria-label="{post_nav_label(lang)}">
        {newer_link}
        {older_link}
      </nav>
    </main>
    <script src="/script.js?v={shared.asset_version()}"></script>
  </body>
</html>
"""


def render_posts_index(posts, lang="ru"):
    page_path = "/screenshots/posts/"
    description = posts_index_description(lang)
    title = all_posts_label(lang)
    items = "\n        ".join(render_post_index_link(post, lang) for post in posts)

    return f"""<!doctype html>
<html lang="{shared.tr(lang, 'html_lang')}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>{title} — {shared.CHANNEL_TITLE}</title>
    <meta name="description" content="{shared.escape_attr(description)}">
    <link rel="canonical" href="{shared.localized_url(page_path, lang)}">
{shared.alternate_links(page_path, lang)}
    <link rel="alternate" type="application/rss+xml" title="{shared.escape_attr(shared.CHANNEL_TITLE)}" href="{shared.localized_url('/screenshots/feed.xml', lang)}">
    <meta property="og:type" content="website">
    <meta property="og:title" content="{title} — {shared.CHANNEL_TITLE}">
    <meta property="og:description" content="{shared.escape_attr(description)}">
    <meta property="og:image" content="{shared.SITE_URL}/assets/og.png">
    <meta property="og:url" content="{shared.localized_url(page_path, lang)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{title} — {shared.CHANNEL_TITLE}">
    <meta name="twitter:description" content="{shared.escape_attr(description)}">
    <meta name="twitter:image" content="{shared.SITE_URL}/assets/og.png">
    <link rel="icon" href="/assets/favicon.png">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;700&family=Lora:wght@600&family=Manrope:wght@800&display=swap">
    <link rel="stylesheet" href="/styles.css?v={shared.asset_version()}">
  </head>
  <body>
    <main class="page screenshots-page" data-page-lang="{lang}">
      {shared.render_header(page_path, lang)}

      <section class="screenshots-intro compact" aria-labelledby="posts-title">
        <p class="eyebrow">{shared.tr(lang, 'static_index')}</p>
        <h1 id="posts-title">{title}</h1>
        <a href="{shared.localized_path('/screenshots/', lang)}">{back_to_blog_label(lang)}</a>
      </section>

      <section class="post-index-list" aria-label="{title} Screenshot of the Day">
        {items}
      </section>
    </main>
  </body>
</html>
"""


def render_post_index_link(post, lang="ru"):
    return f"""<a class="post-index-item" href="{shared.localized_path("/screenshots/" + str(post['id']) + "/", lang)}">
          <time datetime="{shared.escape_attr(shared.iso_date(post.get('date')))}">{shared.escape_html(format_post_date(post, lang))}</time>
          <span>{shared.escape_html(post_title(post, 120, lang))}</span>
        </a>"""


def render_static_post(post, lang="ru"):
    media = f"        {render_media(post.get('media') or [], post, lang)}\n" if post.get("media") else ""
    text_value = shared.post_text(post, lang)
    text = f'          <div class="screenshot-text">{render_rich_text(post, lang)}</div>\n' if text_value else ""
    reactions = f"\n            {render_reactions(post.get('reactions') or [])}" if post.get("reactions") else ""

    return f"""<article class="screenshot-post" id="post-{shared.escape_attr(post.get('id'))}">
{media}        <div class="screenshot-body">
          <h1 class="post-title">{shared.escape_html(post_title(post, 140, lang))}</h1>
{text}          <div class="screenshot-meta">
            <a class="screenshot-date" href="{shared.escape_attr(post.get('telegramUrl'))}" target="_blank" rel="noopener"><time datetime="{shared.escape_attr(shared.iso_date(post.get('date')))}">{shared.escape_html(format_post_date(post, lang))}</time></a>{reactions}
          </div>
        </div>
      </article>"""


def render_media(items, post, lang="ru"):
    class_name = f"screenshot-media{' is-grid' if len(items) > 1 else ' is-single'}"
    body = "\n          ".join(render_media_item(item, post, index, lang) for index, item in enumerate(items))
    return f"""<div class="{class_name}">
          {body}
        </div>"""


def render_media_item(media, post, index, lang="ru"):
    aspect = f' style="aspect-ratio: {int(media["width"])} / {int(media["height"])}"' if media.get("width") and media.get("height") else ""
    alt = shared.escape_attr(media_alt(post, index, lang))
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
            <a href="{src}">{shared.escape_html(media.get('name') or file_label(lang))}</a>
          </div>"""


def render_rich_text(post, lang="ru"):
    text = shared.post_text(post, lang)
    entities = shared.post_entities(post, lang)
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
        f"<span>{shared.escape_html(reaction_label(reaction))}</span>"
        for reaction in reactions
    )
    return f"""<div class="screenshot-reactions">
              {items}
            </div>"""


def reaction_label(reaction):
    return f"{reaction.get('emoji')} {reaction.get('count')}"


def render_sitemap(posts, photos):
    latest_post = shared.sitemap_date(posts[0].get("edited") or posts[0].get("date")) if posts else None
    latest_photo = shared.sitemap_date(photos[0].get("uploadedAt") or photos[0].get("date")) if photos else None
    static_urls = []
    post_urls = []
    photo_urls = []
    static_urls.append({"loc": shared.localized_url("/barcelona-guide/", "ru")})
    for lang in shared.LANGUAGES:
        static_urls.extend([
            {"loc": shared.localized_url("/", lang)},
            {"loc": shared.localized_url("/about/", lang)},
            {"loc": shared.localized_url("/screenshots/", lang)},
            {"loc": shared.localized_url("/photos/", lang), "lastmod": latest_photo},
            {"loc": shared.localized_url("/places/", lang)},
            {"loc": shared.localized_url("/photos/film/", lang), "lastmod": latest_photo},
            {"loc": shared.localized_url("/photos/iphone/", lang), "lastmod": latest_photo},
            {"loc": shared.localized_url("/photos/archive/", lang), "lastmod": latest_photo},
            {"loc": shared.localized_url("/screenshots/posts/", lang), "lastmod": latest_post},
        ])
        post_urls.extend([
            {
                "loc": shared.localized_url(f"/screenshots/{post['id']}/", lang),
                "lastmod": shared.sitemap_date(post.get("edited") or post.get("date")),
            }
            for post in posts
        ])
        photo_urls.extend([
            {
                "loc": shared.localized_url(f"/photos/{photo['id']}/", lang),
                "lastmod": shared.sitemap_date(photo.get("uploadedAt") or photo.get("date")),
                "image": {
                    "loc": shared.photo_asset_url(photo.get("src")),
                    "title": shared.photo_title(photo, 110, lang),
                    "caption": shared.photo_caption(photo, lang) or shared.photo_title(photo, 110, lang),
                },
            }
            for photo in photos
        ])
    body = "\n".join(shared.render_sitemap_url(url) for url in [*static_urls, *post_urls, *photo_urls])
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
{body}
</urlset>
"""


def render_screenshots_feed(posts, lang="ru"):
    return shared.render_rss_feed(
        title=shared.CHANNEL_TITLE,
        description=f"New {shared.CHANNEL_TITLE} posts." if lang == "en" else f"Новые посты канала {shared.CHANNEL_TITLE}.",
        link=shared.localized_url("/screenshots/", lang),
        self_url=shared.localized_url("/screenshots/feed.xml", lang),
        items=[post_feed_item(post, lang) for post in posts[: shared.FEED_LIMIT]],
        lang=lang,
    )


def render_main_feed(posts, photos, lang="ru"):
    items = [post_feed_item(post, lang) for post in posts] + [shared.photo_feed_item(photo, lang) for photo in photos]
    items = sorted(items, key=lambda item: item["sortDate"], reverse=True)[: shared.FEED_LIMIT]
    return shared.render_rss_feed(
        title=shared.tr(lang, "site_name"),
        description=shared.tr(lang, "main_feed_description"),
        link=shared.localized_url("/", lang),
        self_url=shared.localized_url("/feed.xml", lang),
        items=items,
        lang=lang,
    )


def post_feed_item(post, lang="ru"):
    link = shared.localized_url(f"/screenshots/{post.get('id')}/", lang)
    media = shared.post_social_image(post)
    date = shared.post_datetime(post)
    return {
        "title": post_title(post, 120, lang),
        "link": link,
        "guid": link,
        "pubDate": date,
        "sortDate": date,
        "description": post_description(post, lang),
        "category": shared.CHANNEL_TITLE,
        "mediaUrl": media,
        "mediaType": shared.guess_mime_type(media) if media else "",
    }


def remove_stale_post_dirs(post_ids, screenshots_dir=SCREENSHOTS_DIR):
    for entry in screenshots_dir.iterdir():
        if not entry.is_dir() or not entry.name.isdigit() or entry.name in post_ids:
            continue
        shutil.rmtree(entry)


def media_alt(post, index, lang="ru"):
    title = post_title(post, 90, lang)
    suffix = f"media {index + 1}" if lang == "en" else f"медиа {index + 1}"
    return title if index == 0 else f"{title}, {suffix}"


def post_title(post, max_length=72, lang="ru"):
    text = shared.post_text(post, lang)
    fallback = shared.tr(lang, "post_from").format(date=format_post_date(post, lang))
    return truncate_js_string(text or fallback, max_length)


def post_description(post, lang="ru"):
    text = shared.post_text(post, lang)
    fallback = shared.tr(lang, "post_by_date").format(date=format_post_date(post, lang))
    return truncate_js_string(text or fallback, 156)


def format_post_date(post, lang="ru"):
    value = post.get("date") or shared.post_datetime(post)
    date = shared.parse_date(value).astimezone(DISPLAY_TZ)
    if lang == "en":
        months = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December",
        ]
        return f"{months[date.month - 1]} {date.day}, {date.year}"

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
