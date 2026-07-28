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
COLLECTION_STYLES_VERSION = "20260728-collection-controls-1"


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
        (screenshots_dir / "index.html").write_text(render_screenshots_page(posts, lang), encoding="utf-8")

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


def collection_description(lang):
    if lang == "en":
        return "A personal observatory of digital products and visual culture: notes on interfaces, technology, brands, and beautiful things."
    return "Личная обсерватория цифровых продуктов и визуальной культуры: наблюдения об интерфейсах, технологиях, брендах и красивых вещах."


def render_screenshots_page(posts, lang="ru"):
    page_path = "/screenshots/"
    description = collection_description(lang)
    intro = (
        "What is worth noticing in digital products right now—and what becomes visible when these observations accumulate over the years."
        if lang == "en"
        else "Что сейчас стоит замечать в цифровых продуктах — и какие паттерны становятся видны, когда наблюдения копятся годами."
    )
    search_label = "Search the collection" if lang == "en" else "Поиск по коллекции"
    search_placeholder = "interface, brand, AI…" if lang == "en" else "интерфейс, бренд, AI…"
    telegram_label = "Telegram channel" if lang == "en" else "Канал в Телеграме"
    feed = "\n        ".join(render_feed_post(post, lang) for post in posts[:12])

    return f"""<!doctype html>
<html lang="{shared.tr(lang, 'html_lang')}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>{shared.CHANNEL_TITLE} — {shared.tr(lang, 'site_name')}</title>
    <meta name="description" content="{shared.escape_attr(description)}">
    <link rel="canonical" href="{shared.localized_url(page_path, lang)}">
{shared.alternate_links(page_path, lang)}
    <link rel="alternate" type="application/rss+xml" title="{shared.CHANNEL_TITLE}" href="{shared.localized_url('/screenshots/feed.xml', lang)}">
    <meta property="og:type" content="website">
    <meta property="og:title" content="{shared.CHANNEL_TITLE}">
    <meta property="og:description" content="{shared.escape_attr(description)}">
    <meta property="og:image" content="{shared.SITE_URL}/assets/og.png">
    <meta property="og:url" content="{shared.localized_url(page_path, lang)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{shared.CHANNEL_TITLE}">
    <meta name="twitter:description" content="{shared.escape_attr(description)}">
    <meta name="twitter:image" content="{shared.SITE_URL}/assets/og.png">
    <link rel="icon" href="/assets/favicon.png">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;700&family=Lora:wght@600&family=Manrope:wght@800&display=swap">
    <link rel="stylesheet" href="/styles.css?v={COLLECTION_STYLES_VERSION}">
  </head>
  <body>
    <main class="page screenshots-page" data-page-lang="{lang}">
      {shared.render_header(page_path, lang)}

      <section class="screenshots-intro" aria-labelledby="screenshots-title">
        <p class="eyebrow">{shared.CHANNEL_TITLE}</p>
        <h1 id="screenshots-title">{shared.tr(lang, 'blog')}</h1>
        <p class="collection-intro">{intro}</p>
        <div class="intro-links">
          <a href="{shared.localized_path('/screenshots/posts/', lang)}">{all_posts_label(lang)}</a>
          <a href="https://t.me/screenshot_of_the_day" target="_blank" rel="noopener">{telegram_label}</a>
        </div>
      </section>

      <section class="collection-tools" aria-label="{shared.escape_attr(search_label)}">
        <label class="collection-search">
          <span>{search_label}</span>
          <input type="search" data-post-search placeholder="{shared.escape_attr(search_placeholder)}" autocomplete="off">
        </label>
        {render_topic_filters(lang)}
        <p class="collection-result" data-post-result aria-live="polite"></p>
      </section>

      <section class="screenshot-feed" data-telegram-feed data-static-post-feed aria-live="polite">
        {feed}
      </section>

      <div class="feed-actions">
        <button class="button load-more" type="button" data-load-more hidden>{'Load more' if lang == 'en' else 'Показать ещё'}</button>
      </div>
    </main>
    <script src="/script.js?v={shared.asset_version()}"></script>
  </body>
</html>
"""


def render_topic_filters(lang):
    labels = {
        "ru": (("all", "Все"), ("ai", "AI"), ("photos", "Фото"), ("products", "Продукты"), ("design", "Дизайн"), ("brands", "Бренды"), ("games", "Игры")),
        "en": (("all", "All"), ("ai", "AI"), ("photos", "Photos"), ("products", "Products"), ("design", "Design"), ("brands", "Brands"), ("games", "Games")),
    }
    buttons = "".join(
        f'<button type="button" data-post-topic="{value}" aria-pressed="{"true" if value == "all" else "false"}">{label}</button>'
        for value, label in labels[lang]
    )
    aria = "Topics" if lang == "en" else "Темы"
    return f'<div class="collection-topics" aria-label="{aria}">{buttons}</div>'


def render_feed_post(post, lang="ru"):
    rich_content = post_rich_content(post, lang)
    media = (
        f"        {render_media(post.get('media') or [], post, lang, eager_first=False)}\n"
        if post.get("media") and not rich_content
        else ""
    )
    text_value = shared.post_text(post, lang)
    title = post_title(post, 140, lang)
    text = (
        f'          {render_rich_message(rich_content, post, lang)}\n'
        if rich_content
        else f'          <div class="screenshot-text">{render_rich_text(post, lang)}</div>\n' if text_value else ""
    )
    reactions = f"\n            {render_reactions(post.get('reactions') or [])}" if post.get("reactions") else ""
    topic = generate_home_canvas.classify_post(post)

    return f"""<article class="screenshot-post" id="post-{shared.escape_attr(post.get('id'))}" data-post-topic="{topic}">
{media}        <div class="screenshot-body">
          <h2 class="post-title"><a href="{shared.localized_path('/screenshots/' + str(post['id']) + '/', lang)}">{shared.escape_html(title)}</a></h2>
{text}          <div class="screenshot-meta">
            <a class="screenshot-date" href="{shared.escape_attr(post.get('telegramUrl'))}" target="_blank" rel="noopener"><time datetime="{shared.escape_attr(shared.iso_date(post.get('date')))}">{shared.escape_html(format_post_date(post, lang))}</time></a>{reactions}
          </div>
        </div>
      </article>"""


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
    rich_content = post_rich_content(post, lang)
    media = (
        f"        {render_media(post.get('media') or [], post, lang)}\n"
        if post.get("media") and not rich_content
        else ""
    )
    text_value = shared.post_text(post, lang)
    text = (
        f'          {render_rich_message(rich_content, post, lang)}\n'
        if rich_content
        else f'          <div class="screenshot-text">{render_rich_text(post, lang)}</div>\n' if text_value else ""
    )
    reactions = f"\n            {render_reactions(post.get('reactions') or [])}" if post.get("reactions") else ""

    return f"""<article class="screenshot-post" id="post-{shared.escape_attr(post.get('id'))}">
{media}        <div class="screenshot-body">
          <h1 class="post-title">{shared.escape_html(post_title(post, 140, lang))}</h1>
{text}          <div class="screenshot-meta">
            <a class="screenshot-date" href="{shared.escape_attr(post.get('telegramUrl'))}" target="_blank" rel="noopener"><time datetime="{shared.escape_attr(shared.iso_date(post.get('date')))}">{shared.escape_html(format_post_date(post, lang))}</time></a>{reactions}
          </div>
        </div>
      </article>"""


def render_media(items, post, lang="ru", eager_first=True):
    class_name = f"screenshot-media{' is-grid' if len(items) > 1 else ' is-single'}"
    body = "\n          ".join(render_media_item(item, post, index, lang, eager_first) for index, item in enumerate(items))
    return f"""<div class="{class_name}">
          {body}
        </div>"""


def render_media_item(media, post, index, lang="ru", eager_first=True):
    aspect = f' style="aspect-ratio: {int(media["width"])} / {int(media["height"])}"' if media.get("width") and media.get("height") else ""
    alt = shared.escape_attr(media_alt(post, index, lang))
    src = shared.escape_attr(shared.telegram_asset_url(media.get("src")))

    if media.get("type") in {"photo", "sticker"}:
        return f"""<div class="screenshot-media-item is-image"{aspect}>
            <img src="{src}" loading="{'eager' if eager_first and index == 0 else 'lazy'}" decoding="async" alt="{alt}">
          </div>"""

    if media.get("type") in {"video", "animation"}:
        poster = f' poster="{shared.escape_attr(shared.telegram_asset_url(media.get("poster")))}"' if media.get("poster") else ""
        loop = " loop muted" if media.get("type") == "animation" else ""
        return f"""<div class="screenshot-media-item is-video"{aspect}>
            <video src="{src}" controls preload="metadata" playsinline{poster}{loop}></video>
          </div>"""

    if media.get("type") in {"audio", "voice_note"}:
        return f"""<div class="screenshot-media-item is-audio">
            <audio src="{src}" controls preload="metadata"></audio>
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


def post_rich_content(post, lang="ru"):
    rich_content = post.get("richContent")

    if not isinstance(rich_content, dict):
        return None

    if lang == "en" and str(shared.translation(post, "en").get("text") or "").strip():
        return None

    return rich_content


def render_rich_message(rich_content, post, lang="ru"):
    direction = ' dir="rtl"' if rich_content.get("isRtl") else ""
    body = render_rich_blocks(rich_content.get("blocks") or [], post, lang)
    return f'<div class="screenshot-rich"{direction}>{body}</div>'


def render_rich_blocks(blocks, post, lang="ru"):
    return "".join(render_rich_block(block, post, lang) for block in blocks if isinstance(block, dict))


def render_rich_block(block, post, lang="ru"):
    block_type = block.get("type")

    if block_type == "paragraph":
        return f'<p>{render_rich_inline(block.get("text"), post)}</p>'

    if block_type == "heading":
        level = min(6, max(2, int(block.get("size") or 1) + 1))
        return f'<h{level}>{render_rich_inline(block.get("text"), post)}</h{level}>'

    if block_type == "pre":
        language = block.get("language")
        class_name = f' class="language-{shared.escape_attr(language)}"' if language else ""
        return f'<pre><code{class_name}>{render_rich_inline(block.get("text"), post)}</code></pre>'

    if block_type == "footer":
        return f'<footer>{render_rich_inline(block.get("text"), post)}</footer>'

    if block_type == "divider":
        return "<hr>"

    if block_type == "mathematical_expression":
        return f'<pre class="screenshot-rich-math"><code>{shared.escape_html(block.get("expression") or "")}</code></pre>'

    if block_type == "anchor":
        return f'<span id="{rich_anchor_id(post, block.get("name"))}"></span>'

    if block_type == "list":
        items = block.get("items") or []
        ordered = any(item.get("value") is not None or item.get("type") for item in items if isinstance(item, dict))
        tag = "ol" if ordered else "ul"
        content = "".join(render_rich_list_item(item, post, lang) for item in items if isinstance(item, dict))
        return f"<{tag}>{content}</{tag}>"

    if block_type == "blockquote":
        credit = render_rich_credit(block.get("credit"), post)
        return f'<blockquote>{render_rich_blocks(block.get("blocks") or [], post, lang)}{credit}</blockquote>'

    if block_type == "pullquote":
        credit = render_rich_credit(block.get("credit"), post)
        return f'<blockquote class="is-pullquote"><p>{render_rich_inline(block.get("text"), post)}</p>{credit}</blockquote>'

    if block_type in {"collage", "slideshow"}:
        media = collect_rich_block_media(block.get("blocks") or [])
        rendered = render_media(media, post, lang, eager_first=False) if media else ""
        return f'<figure class="screenshot-rich-gallery is-{block_type}">{rendered}{render_rich_caption(block.get("caption"), post)}</figure>'

    if block_type == "table":
        rows = "".join(render_rich_table_row(row, post) for row in block.get("cells") or [] if isinstance(row, list))
        caption = render_rich_inline(block.get("caption"), post)
        caption_html = f"<caption>{caption}</caption>" if caption else ""
        classes = []
        if block.get("is_bordered"):
            classes.append("is-bordered")
        if block.get("is_striped"):
            classes.append("is-striped")
        class_name = f' class="{" ".join(classes)}"' if classes else ""
        return f'<div class="screenshot-rich-table"><table{class_name}>{caption_html}<tbody>{rows}</tbody></table></div>'

    if block_type == "details":
        opened = " open" if block.get("is_open") else ""
        return f'<details{opened}><summary>{render_rich_inline(block.get("summary"), post)}</summary>{render_rich_blocks(block.get("blocks") or [], post, lang)}</details>'

    if block_type == "map":
        location = block.get("location") or {}
        latitude = location.get("latitude")
        longitude = location.get("longitude")
        if latitude is None or longitude is None:
            return ""
        label = "Open map" if lang == "en" else "Открыть карту"
        href = f"https://www.openstreetmap.org/?mlat={latitude}&mlon={longitude}#map={block.get('zoom') or 15}/{latitude}/{longitude}"
        return f'<figure class="screenshot-rich-map"><a href="{shared.escape_attr(href)}" target="_blank" rel="noopener">{label}</a>{render_rich_caption(block.get("caption"), post)}</figure>'

    if block_type in {"photo", "video", "animation", "audio", "voice_note"}:
        media = block.get("media")
        rendered = render_media([media], post, lang, eager_first=False) if isinstance(media, dict) else ""
        unavailable = "" if rendered else f'<p class="screenshot-rich-unavailable">{"Media unavailable" if lang == "en" else "Медиа недоступно"}</p>'
        return f'<figure class="screenshot-rich-media">{rendered}{unavailable}{render_rich_caption(block.get("caption"), post)}</figure>'

    if block.get("text") is not None:
        return f'<p>{render_rich_inline(block.get("text"), post)}</p>'

    return render_rich_blocks(block.get("blocks") or [], post, lang)


def render_rich_list_item(item, post, lang="ru"):
    checkbox = ""
    if item.get("has_checkbox"):
        checked = " checked" if item.get("is_checked") else ""
        checkbox = f'<input type="checkbox" disabled{checked} aria-hidden="true">'
    value = f' value="{int(item["value"])}"' if item.get("value") is not None else ""
    return f'<li{value}>{checkbox}{render_rich_blocks(item.get("blocks") or [], post, lang)}</li>'


def render_rich_table_row(row, post):
    cells = "".join(render_rich_table_cell(cell, post) for cell in row if isinstance(cell, dict))
    return f"<tr>{cells}</tr>"


def render_rich_table_cell(cell, post):
    tag = "th" if cell.get("is_header") else "td"
    attrs = []
    for source, target in (("colspan", "colspan"), ("rowspan", "rowspan")):
        if cell.get(source):
            attrs.append(f'{target}="{int(cell[source])}"')
    styles = []
    if cell.get("align") in {"left", "center", "right"}:
        styles.append(f'text-align:{cell["align"]}')
    if cell.get("valign") in {"top", "middle", "bottom"}:
        styles.append(f'vertical-align:{cell["valign"]}')
    if styles:
        attrs.append(f'style="{";".join(styles)}"')
    attributes = f' {" ".join(attrs)}' if attrs else ""
    return f'<{tag}{attributes}>{render_rich_inline(cell.get("text"), post)}</{tag}>'


def render_rich_caption(caption, post):
    if not isinstance(caption, dict):
        return ""
    text = render_rich_inline(caption.get("text"), post)
    credit = render_rich_credit(caption.get("credit"), post)
    return f"<figcaption>{text}{credit}</figcaption>" if text or credit else ""


def render_rich_credit(value, post):
    credit = render_rich_inline(value, post)
    return f"<cite>{credit}</cite>" if credit else ""


def collect_rich_block_media(blocks):
    values = []
    for block in blocks:
        if not isinstance(block, dict):
            continue
        if isinstance(block.get("media"), dict):
            values.append(block["media"])
        values.extend(collect_rich_block_media(block.get("blocks") or []))
    return values


def render_rich_inline(value, post):
    if isinstance(value, str):
        return shared.escape_html(value)
    if isinstance(value, list):
        return "".join(render_rich_inline(item, post) for item in value)
    if not isinstance(value, dict):
        return ""

    rich_type = value.get("type")
    text = render_rich_inline(value.get("text"), post)
    wrappers = {
        "bold": "strong",
        "italic": "em",
        "underline": "u",
        "strikethrough": "s",
        "code": "code",
        "marked": "mark",
        "subscript": "sub",
        "superscript": "sup",
    }

    if rich_type in wrappers:
        tag = wrappers[rich_type]
        return f"<{tag}>{text}</{tag}>"
    if rich_type == "spoiler":
        return f'<span class="screenshot-rich-spoiler">{text}</span>'
    if rich_type == "custom_emoji":
        return shared.escape_html(value.get("alternative_text") or "")
    if rich_type == "mathematical_expression":
        return f'<code class="screenshot-rich-inline-math">{shared.escape_html(value.get("expression") or "")}</code>'
    if rich_type == "url":
        return render_rich_link(value.get("url"), text)
    if rich_type == "email_address":
        return render_rich_link(f'mailto:{value.get("email_address") or ""}', text)
    if rich_type == "phone_number":
        return render_rich_link(f'tel:{value.get("phone_number") or ""}', text)
    if rich_type == "mention":
        return render_rich_link(f'https://t.me/{value.get("username") or ""}', text)
    if rich_type == "text_mention" and value.get("user_id") is not None:
        return render_rich_link(f'tg://user?id={value["user_id"]}', text)
    if rich_type in {"anchor", "reference"}:
        name = value.get("name")
        return f'<span id="{rich_anchor_id(post, name)}">{text}</span>'
    if rich_type == "anchor_link":
        return f'<a href="#{rich_anchor_id(post, value.get("anchor_name"))}">{text}</a>'
    if rich_type == "reference_link":
        return f'<a href="#{rich_anchor_id(post, value.get("reference_name"))}">{text}</a>'
    return text


def render_rich_link(href, text):
    href = str(href or "")
    if not re.match(r"^(?:https?://|mailto:|tel:|tg://)", href, flags=re.IGNORECASE):
        return text
    return f'<a href="{shared.escape_attr(href)}" target="_blank" rel="noopener">{text}</a>'


def rich_anchor_id(post, name):
    safe_name = re.sub(r"[^a-zA-Z0-9_-]+", "-", str(name or "top")).strip("-") or "top"
    return shared.escape_attr(f'rich-{post.get("id", "post")}-{safe_name}')


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
