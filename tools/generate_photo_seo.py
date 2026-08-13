#!/usr/bin/env python3

import json
import re
import shutil
from datetime import datetime, timezone
from email.utils import format_datetime
from pathlib import Path
from urllib.parse import quote
from zoneinfo import ZoneInfo

import generate_home_canvas
import generate_photo_previews


ROOT_DIR = Path(__file__).resolve().parent.parent
EN_DIR = ROOT_DIR / "en"
PHOTOS_DIR = ROOT_DIR / "photos"
PHOTOS_ARCHIVE_DIR = PHOTOS_DIR / "archive"
EN_PHOTOS_DIR = EN_DIR / "photos"
EN_PHOTOS_ARCHIVE_DIR = EN_PHOTOS_DIR / "archive"
POSTS_JSON_PATH = ROOT_DIR / "assets/telegram/posts.json"
PHOTOS_JSON_PATH = ROOT_DIR / "assets/photos/photos.json"
SITEMAP_PATH = ROOT_DIR / "sitemap.xml"
FEED_PATH = ROOT_DIR / "feed.xml"
EN_FEED_PATH = EN_DIR / "feed.xml"
PHOTOS_FEED_PATH = PHOTOS_DIR / "feed.xml"
EN_PHOTOS_FEED_PATH = EN_PHOTOS_DIR / "feed.xml"
SITE_URL = "https://tomilov.com"
SITE_NAME = "Серёжа Томилов"
SITE_NAME_EN = "Seryozha Tomilov"
PHOTOS_TITLE = "Фото"
PHOTOS_TITLE_EN = "Photos"
PHOTOS_DESCRIPTION = "Витрина лучших снимков Серёжи Томилова."
PHOTOS_DESCRIPTION_EN = "A showcase of Seryozha Tomilov's best photographs."
LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/"
LICENSE_NAME = "CC BY 4.0"
CHANNEL_TITLE = "Screenshot of the Day"
TELEGRAM_MEDIA_BASE = "https://s3.twcstorage.ru/00df5bd5-137f-492a-8d95-c7ee2cc2d851"
FEED_LIMIT = 50
LANGUAGES = ("ru", "en")
PHOTO_FILTER_VALUES = ("film", "iphone")
PHOTO_FILTER_DIRS = {"film", "iphone"}
TELEGRAM_EXPORT_TZ = ZoneInfo("Europe/Moscow")

STRINGS = {
    "ru": {
        "html_lang": "ru-RU",
        "rss_lang": "ru-RU",
        "site_name": SITE_NAME,
        "site_description": "Интернет Серёжи Томилова",
        "nav_aria": "Навигация",
        "sections_aria": "Разделы",
        "blog": "Блог",
        "photos": PHOTOS_TITLE,
        "places": "Места",
        "research": "Исследования",
        "research_mobile": "Иссл.",
        "about_desktop": SITE_NAME,
        "about_mobile": "about",
        "photos_description": PHOTOS_DESCRIPTION,
        "photos_empty": "Фотографий пока нет.",
        "photos_footer": f'Витрина лучших снимков. Использование разрешено по лицензии <a href="{LICENSE_URL}" target="_blank" rel="license noopener">{LICENSE_NAME}</a> с указанием авторства.',
        "photos_filter_aria": "Фильтр по технике",
        "all_techniques": "Все",
        "film_technique": "Плёнка",
        "iphone_technique": "iPhone",
        "all_photos": "Все фото",
        "back_to_photos": "Вернуться в фотоленту",
        "static_index": "Static index",
        "photos_archive_description": "Статический индекс всех фото из раздела Фото.",
        "breadcrumbs": "Хлебные крошки",
        "photo_info": "Информация о фото",
        "viewer": "Просмотр фотографии",
        "previous_photo": "Предыдущее фото",
        "next_photo": "Следующее фото",
        "close": "Закрыть",
        "actual": "Увеличить",
        "fit": "Вписать",
        "newer": "Новее",
        "older": "Старее",
        "date": "Дата",
        "camera": "Камера",
        "lens": "Объектив",
        "place": "Место",
        "settings": "Настройки",
        "file": "Файл",
        "license": "Лицензия",
        "license_usage": "Использование разрешено с указанием авторства и ссылки на эту страницу.",
        "film_camera": "Leica M6 — плёнка",
        "film_photo": "Плёночная фотография",
        "photo_from": "Фото от {date}",
        "photo_by_date": "Фото Серёжи Томилова от {date}.",
        "post_from": "Пост от {date}",
        "post_by_date": "Пост канала Screenshot of the Day от {date}.",
        "main_feed_description": "Новые записи и фотографии на tomilov.com.",
        "photos_feed_license": f"Лицензия: {LICENSE_NAME}, использование с указанием авторства и ссылки на страницу фото.",
    },
    "en": {
        "html_lang": "en",
        "rss_lang": "en-US",
        "site_name": SITE_NAME_EN,
        "site_description": "The internet home of Seryozha Tomilov",
        "nav_aria": "Navigation",
        "sections_aria": "Sections",
        "blog": "Blog",
        "photos": PHOTOS_TITLE_EN,
        "places": "Places",
        "research": "Research",
        "research_mobile": "Res.",
        "about_desktop": SITE_NAME_EN,
        "about_mobile": "about",
        "photos_description": PHOTOS_DESCRIPTION_EN,
        "photos_empty": "No photos yet.",
        "photos_footer": f'A showcase of selected photographs. Licensed under <a href="{LICENSE_URL}" target="_blank" rel="license noopener">{LICENSE_NAME}</a> with attribution.',
        "photos_filter_aria": "Filter by camera",
        "all_techniques": "All",
        "film_technique": "Film",
        "iphone_technique": "iPhone",
        "all_photos": "All photos",
        "back_to_photos": "Back to photo feed",
        "static_index": "Static index",
        "photos_archive_description": "A static index of every photo in the Photos section.",
        "breadcrumbs": "Breadcrumbs",
        "photo_info": "Photo information",
        "viewer": "Photo viewer",
        "previous_photo": "Previous photo",
        "next_photo": "Next photo",
        "close": "Close",
        "actual": "Zoom",
        "fit": "Fit",
        "newer": "Newer",
        "older": "Older",
        "date": "Date",
        "camera": "Camera",
        "lens": "Lens",
        "place": "Place",
        "settings": "Settings",
        "file": "File",
        "license": "License",
        "license_usage": "Use is allowed with attribution and a link to this page.",
        "film_camera": "Leica M6 — film",
        "film_photo": "Film photograph",
        "photo_from": "Photo from {date}",
        "photo_by_date": "Photo by Seryozha Tomilov from {date}.",
        "post_from": "Post from {date}",
        "post_by_date": "A Screenshot of the Day post from {date}.",
        "main_feed_description": "New posts and photographs on tomilov.com.",
        "photos_feed_license": f"License: {LICENSE_NAME}; use is allowed with attribution and a link to the photo page.",
    },
}


def main():
    posts = sorted(read_json(POSTS_JSON_PATH, {"posts": []}).get("posts", []), key=post_sort_key, reverse=True)
    photos = sorted(read_json(PHOTOS_JSON_PATH, {"photos": []}).get("photos", []), key=photo_sort_key, reverse=True)
    photo_ids = {str(photo.get("id", "")) for photo in photos}

    for lang in LANGUAGES:
        photos_dir = photos_dir_for_lang(lang)
        photos_archive_dir = photos_archive_dir_for_lang(lang)
        photos_dir.mkdir(parents=True, exist_ok=True)
        remove_stale_photo_dirs(photo_ids, photos_dir)

        for index, photo in enumerate(photos):
            photo_dir = photos_dir / str(photo["id"])
            photo_dir.mkdir(parents=True, exist_ok=True)
            newer = photos[index - 1] if index > 0 else None
            older = photos[index + 1] if index + 1 < len(photos) else None
            (photo_dir / "index.html").write_text(render_photo_page(photo, newer, older, lang), encoding="utf-8")

        photos_archive_dir.mkdir(parents=True, exist_ok=True)
        (photos_dir / "index.html").write_text(render_photos_page(photos, lang), encoding="utf-8")
        for filter_value in PHOTO_FILTER_VALUES:
            filter_dir = photos_dir / filter_value
            filter_dir.mkdir(parents=True, exist_ok=True)
            (filter_dir / "index.html").write_text(render_photos_page(photos, lang, filter_value), encoding="utf-8")
        (photos_archive_dir / "index.html").write_text(render_photos_archive(photos, lang), encoding="utf-8")

    SITEMAP_PATH.write_text(render_sitemap(posts, photos), encoding="utf-8")
    FEED_PATH.write_text(render_main_feed(posts, photos, "ru"), encoding="utf-8")
    EN_DIR.mkdir(parents=True, exist_ok=True)
    EN_FEED_PATH.write_text(render_main_feed(posts, photos, "en"), encoding="utf-8")
    PHOTOS_FEED_PATH.write_text(render_photos_feed(photos, "ru"), encoding="utf-8")
    EN_PHOTOS_FEED_PATH.write_text(render_photos_feed(photos, "en"), encoding="utf-8")
    preview_summary = generate_photo_previews.generate(photos)
    generate_home_canvas.generate(posts, photos)

    print(f"Generated {len(photos)} photo pages")
    print(PHOTOS_ARCHIVE_DIR.relative_to(ROOT_DIR))
    print(EN_PHOTOS_ARCHIVE_DIR.relative_to(ROOT_DIR))
    print(SITEMAP_PATH.relative_to(ROOT_DIR))
    print(FEED_PATH.relative_to(ROOT_DIR))
    print(EN_FEED_PATH.relative_to(ROOT_DIR))
    print(PHOTOS_FEED_PATH.relative_to(ROOT_DIR))
    print(EN_PHOTOS_FEED_PATH.relative_to(ROOT_DIR))
    print(
        "photo_previews "
        f"generated={preview_summary['generated']} cached={preview_summary['cached']} "
        f"missing={preview_summary['missing']} failed={preview_summary['failed']}"
    )
    print(ROOT_DIR.joinpath("index.html").relative_to(ROOT_DIR))
    print(ROOT_DIR.joinpath("en/index.html").relative_to(ROOT_DIR))


def strings(lang):
    return STRINGS.get(lang, STRINGS["ru"])


def tr(lang, key):
    return strings(lang)[key]


def lang_prefix(lang):
    return "/en" if lang == "en" else ""


def localized_path(path, lang):
    if not path.startswith("/"):
        path = f"/{path}"
    return f"{lang_prefix(lang)}{path}" if lang == "en" else path


def localized_url(path, lang):
    return f"{SITE_URL}{localized_path(path, lang)}"


def opposite_lang(lang):
    return "en" if lang == "ru" else "ru"


def alternate_links(path, lang):
    ru_url = localized_url(path, "ru")
    en_url = localized_url(path, "en")
    return f"""    <link rel="alternate" hreflang="ru" href="{ru_url}">
    <link rel="alternate" hreflang="en" href="{en_url}">
    <link rel="alternate" hreflang="x-default" href="{ru_url}">"""


def photos_dir_for_lang(lang):
    return EN_PHOTOS_DIR if lang == "en" else PHOTOS_DIR


def photos_archive_dir_for_lang(lang):
    return EN_PHOTOS_ARCHIVE_DIR if lang == "en" else PHOTOS_ARCHIVE_DIR


def feed_path_for_lang(lang):
    return EN_FEED_PATH if lang == "en" else FEED_PATH


def photos_feed_path_for_lang(lang):
    return EN_PHOTOS_FEED_PATH if lang == "en" else PHOTOS_FEED_PATH


def translation(item, lang):
    if lang == "ru":
        return {}
    translations = item.get("translations") or {}
    value = translations.get(lang) or {}
    return value if isinstance(value, dict) else {}


def translated_value(item, lang, key, fallback=""):
    return clean_text(translation(item, lang).get(key)) or clean_text(item.get(key)) or fallback


def render_photos_page(photos, lang="ru", active_filter="all"):
    visible_photos = photos_by_technique(photos, active_filter)
    image = photo_asset_url((visible_photos or photos)[0].get("src")) if (visible_photos or photos) else f"{SITE_URL}/assets/og.png"
    page_path = photo_filter_path(active_filter)
    title = tr(lang, "photos")
    page_title = title if active_filter == "all" else f"{title} · {photo_filter_label(active_filter, lang)}"
    description = tr(lang, "photos_description")
    json_ld = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": page_title,
        "description": description,
        "url": localized_url(page_path, lang),
        "isPartOf": {"@type": "WebSite", "name": tr(lang, "site_name"), "url": SITE_URL},
        "creator": {"@type": "Person", "name": tr(lang, "site_name"), "url": SITE_URL},
        "license": LICENSE_URL,
    }

    feed = "\n        ".join(render_photo_card(photo, index, lang) for index, photo in enumerate(visible_photos))
    if not feed:
        feed = f'<p class="feed-status" data-photo-status>{tr(lang, "photos_empty")}</p>'

    return f"""<!doctype html>
<html lang="{tr(lang, 'html_lang')}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>{page_title} — {tr(lang, 'site_name')}</title>
    <meta name="description" content="{escape_attr(description)}">
    <link rel="canonical" href="{localized_url(page_path, lang)}">
{alternate_links(page_path, lang)}
    <link rel="alternate" type="application/rss+xml" title="{escape_attr(title)}" href="{localized_url('/photos/feed.xml', lang)}">
    <meta property="og:type" content="website">
    <meta property="og:title" content="{page_title}">
    <meta property="og:description" content="{escape_attr(description)}">
    <meta property="og:image" content="{escape_attr(image)}">
    <meta property="og:url" content="{localized_url(page_path, lang)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{page_title}">
    <meta name="twitter:description" content="{escape_attr(description)}">
    <meta name="twitter:image" content="{escape_attr(image)}">
    <link rel="icon" href="/assets/favicon.png">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;700&family=Lora:wght@600&family=Manrope:wght@800&display=swap">
    <link rel="stylesheet" href="/styles.css?v={asset_version()}">
    <script type="application/ld+json">{json_script(json_ld)}</script>
  </head>
  <body>
    <main class="page photos-page" data-page-lang="{lang}">
      {render_header(page_path, lang)}

      <section class="photos-intro" aria-labelledby="photos-title">
        <h1 id="photos-title">{title}</h1>
      </section>

      {render_photo_filters(photos, lang, active_filter)}

      <section class="photo-feed" data-photo-feed data-static-photo-feed aria-live="polite">
        {feed}
      </section>

      <footer class="photos-footer">
        <p>{tr(lang, 'photos_footer')}</p>
        <a href="{localized_path('/photos/archive/', lang)}">{tr(lang, 'all_photos')}</a>
      </footer>
    </main>

    {render_photo_dialog(lang)}
    <script src="/script.js?v={asset_version()}"></script>
  </body>
</html>
"""


def render_photos_archive(photos, lang="ru"):
    page_path = "/photos/archive/"
    title = tr(lang, "all_photos")
    description = tr(lang, "photos_archive_description")
    items = "\n        ".join(render_photo_index_link(photo, lang) for photo in photos)

    return f"""<!doctype html>
<html lang="{tr(lang, 'html_lang')}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>{title} — {tr(lang, 'site_name')}</title>
    <meta name="description" content="{escape_attr(description)}">
    <link rel="canonical" href="{localized_url(page_path, lang)}">
{alternate_links(page_path, lang)}
    <link rel="alternate" type="application/rss+xml" title="{escape_attr(tr(lang, 'photos'))}" href="{localized_url('/photos/feed.xml', lang)}">
    <meta property="og:type" content="website">
    <meta property="og:title" content="{title} — {tr(lang, 'site_name')}">
    <meta property="og:description" content="{escape_attr(description)}">
    <meta property="og:image" content="{SITE_URL}/assets/og.png">
    <meta property="og:url" content="{localized_url(page_path, lang)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{title} — {tr(lang, 'site_name')}">
    <meta name="twitter:description" content="{escape_attr(description)}">
    <meta name="twitter:image" content="{SITE_URL}/assets/og.png">
    <link rel="icon" href="/assets/favicon.png">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;700&family=Lora:wght@600&family=Manrope:wght@800&display=swap">
    <link rel="stylesheet" href="/styles.css?v={asset_version()}">
  </head>
  <body>
    <main class="page photos-page" data-page-lang="{lang}">
      {render_header(page_path, lang)}

      <section class="photos-intro compact" aria-labelledby="photos-archive-title">
        <p class="eyebrow">{tr(lang, 'static_index')}</p>
        <h1 id="photos-archive-title">{title}</h1>
        <a href="{localized_path('/photos/', lang)}">{tr(lang, 'back_to_photos')}</a>
      </section>

      <section class="post-index-list" aria-label="{escape_attr(title)}">
        {items}
      </section>
    </main>
  </body>
</html>
"""


def render_photo_page(photo, newer, older, lang="ru"):
    page_path = f"/photos/{photo['id']}/"
    url = localized_url(page_path, lang)
    title = f"{photo_title(photo, 72, lang)} — {tr(lang, 'photos')}"
    description = photo_description(photo, lang)
    image = photo_asset_url(photo.get("src"))
    json_ld = photo_json_ld(photo, url, description, lang)
    caption_text = photo_caption(photo, lang)
    caption = f"\n            <p>{escape_html(caption_text)}</p>" if caption_text else ""
    newer_link = f'<a href="{localized_path("/photos/" + str(newer["id"]) + "/", lang)}">{tr(lang, "newer")}</a>' if newer else "<span></span>"
    older_link = f'<a href="{localized_path("/photos/" + str(older["id"]) + "/", lang)}">{tr(lang, "older")}</a>' if older else "<span></span>"

    return f"""<!doctype html>
<html lang="{tr(lang, 'html_lang')}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width">
    <title>{escape_html(title)}</title>
    <meta name="description" content="{escape_attr(description)}">
    <link rel="canonical" href="{url}">
{alternate_links(page_path, lang)}
    <link rel="alternate" type="application/rss+xml" title="{escape_attr(tr(lang, 'photos'))}" href="{localized_url('/photos/feed.xml', lang)}">
    <meta property="og:type" content="article">
    <meta property="og:title" content="{escape_attr(photo_title(photo, 90, lang))}">
    <meta property="og:description" content="{escape_attr(description)}">
    <meta property="og:image" content="{escape_attr(image)}">
    <meta property="og:url" content="{url}">
    <meta property="article:published_time" content="{escape_attr(iso_date(photo.get('date') or photo.get('uploadedAt')))}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{escape_attr(photo_title(photo, 90, lang))}">
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
    <main class="page photo-detail-page" data-page-lang="{lang}">
      {render_header(page_path, lang)}

      <nav class="post-breadcrumb" aria-label="{tr(lang, 'breadcrumbs')}">
        <a href="{localized_path('/photos/', lang)}">{tr(lang, 'photos')}</a>
        <span aria-hidden="true">/</span>
        <a href="{localized_path('/photos/archive/', lang)}">{tr(lang, 'all_photos')}</a>
      </nav>

      <article class="photo-detail">
        <figure class="photo-detail-figure">
          <a href="{escape_attr(photo.get('src'))}">
            <img src="{escape_attr(photo.get('src'))}"{image_dimensions_attrs(photo)} decoding="async" alt="{escape_attr(photo_alt(photo, lang))}">
          </a>
          <figcaption>
            <h1>{escape_html(photo_title(photo, 140, lang))}</h1>{caption}
          </figcaption>
        </figure>

        {render_photo_meta(photo, lang)}
      </article>

      <nav class="post-nav" aria-label="{tr(lang, 'photos')}">
        {newer_link}
        {older_link}
      </nav>
    </main>
  </body>
</html>
"""


def render_photo_filters(photos, lang="ru", active_filter="all"):
    if not photos:
        return ""

    links = []
    for option in photo_technique_options(photos, lang):
        current = ' aria-current="page"' if option["value"] == active_filter else ""
        links.append(
            f'<a href="{localized_path(photo_filter_path(option["value"]), lang)}" data-photo-filter-value="{escape_attr(option["value"])}"{current}>'
            f'<span>{escape_html(option["label"])}</span>'
            f'<span class="photo-filter-count">{option["count"]}</span>'
            '</a>'
        )

    return f'''<nav class="photo-filter" data-photo-filter aria-label="{tr(lang, "photos_filter_aria")}">
        {"".join(links)}
      </nav>'''


def render_photo_card(photo, index, lang="ru"):
    aspect = f' style="aspect-ratio: {int(photo["width"])} / {int(photo["height"])}"' if photo.get("width") and photo.get("height") else ""
    loading = "eager" if index == 0 else "lazy"
    fetch_priority = ' fetchpriority="high"' if index == 0 else ' fetchpriority="low"'
    hdr = '<span class="photo-hdr-badge">HDR</span>' if photo.get("hdr") else ""
    hdr_line = f"\n            {hdr}" if hdr else ""
    title = photo_title(photo, 100, lang)
    original = escape_attr(photo.get("src"))
    preview_widths = generate_photo_previews.feed_preview_widths(photo)
    if photo.get("hdr") or not preview_widths:
        image_markup = (
            f'<img src="{original}" loading="{loading}"{fetch_priority} '
            f'decoding="async" alt="{escape_attr(photo_alt(photo, lang))}">'
        )
    else:
        default_width = max((width for width in preview_widths if width <= 960), default=preview_widths[0])
        preview = escape_attr(generate_photo_previews.feed_preview_public_url(photo, default_width))
        jpeg_srcset = escape_attr(generate_photo_previews.feed_preview_srcset(photo))
        webp_srcset = escape_attr(generate_photo_previews.feed_preview_srcset(photo, "webp"))
        sizes = "(max-width: 719px) calc(100vw - 24px), (max-width: 1199px) 45vw, 360px"
        image_markup = (
            '<picture>'
            f'<source type="image/webp" srcset="{webp_srcset}" sizes="{sizes}">'
            f'<img src="{preview}" srcset="{jpeg_srcset}" sizes="{sizes}" '
            f'data-fallback-src="{original}" loading="{loading}"{fetch_priority} '
            f'decoding="async" alt="{escape_attr(photo_alt(photo, lang))}">'
            '</picture>'
        )

    return f"""<article class="photo-entry" data-photo-technique="{escape_attr(photo_technique_key(photo))}">
          <a class="photo-card" href="{localized_path("/photos/" + str(photo['id']) + "/", lang)}"{aspect} aria-label="{escape_attr(title)}">
            {image_markup}{hdr_line}
          </a>
          {render_photo_info(photo, lang)}
        </article>"""


def render_photo_info(photo, lang="ru"):
    technical = photo.get("technical") or {}
    location = photo_location(photo, lang)
    settings = [item for item in technical.get("settings", []) if item.get("value")]
    location_html = f"\n              <p class=\"photo-location\">{escape_html(location)}</p>" if location else ""
    settings_html = ""
    if settings:
        settings_html = f"""\n            <div class="photo-settings">
              {"".join(f'<span>{escape_html(setting_value(item))}</span>' for item in settings)}
            </div>"""

    return f"""<div class="photo-info">
            <div class="photo-info-header">
              <strong>{escape_html(technical.get("cameraLine") or tr(lang, "film_camera"))}</strong>
            </div>
            <div class="photo-info-body">
              <p>{escape_html(technical.get("lensLine") or tr(lang, "film_photo"))}</p>
              <p>{escape_html(technical.get("summary") or compact_text([format_dimensions(photo), format_file_size(photo.get("size"))]))}</p>{location_html}
            </div>{settings_html}
          </div>"""


def render_photo_index_link(photo, lang="ru"):
    return f"""<a class="post-index-item" href="{localized_path("/photos/" + str(photo['id']) + "/", lang)}">
          <time datetime="{escape_attr(iso_date(photo.get('date') or photo.get('uploadedAt')))}">{escape_html(format_date(photo.get('date') or photo.get('uploadedAt'), lang))}</time>
          <span>{escape_html(photo_title(photo, 120, lang))}</span>
        </a>"""


def render_photo_meta(photo, lang="ru"):
    technical = photo.get("technical") or {}
    location = photo_location(photo, lang)
    settings = [item for item in technical.get("settings", []) if item.get("value")]

    rows = [
        (tr(lang, "date"), f'<time datetime="{escape_attr(iso_date(photo.get("date") or photo.get("uploadedAt")))}">{escape_html(format_date(photo.get("date") or photo.get("uploadedAt"), lang))}</time>'),
        (tr(lang, "camera"), escape_html(technical.get("cameraLine") or tr(lang, "film_camera"))),
        (tr(lang, "lens"), escape_html(technical.get("lensLine") or tr(lang, "film_photo"))),
    ]
    if location:
        rows.append((tr(lang, "place"), escape_html(location)))
    if settings:
        rows.append((tr(lang, "settings"), escape_html(" · ".join(setting_value(item) for item in settings))))
    rows.extend([
        (tr(lang, "file"), escape_html(compact_text([format_dimensions(photo), format_file_size(photo.get("size")), photo.get("mimeType")]))),
        (tr(lang, "license"), f'<a href="{LICENSE_URL}" target="_blank" rel="license noopener">{LICENSE_NAME}</a>. {tr(lang, "license_usage")}'),
    ])

    return f"""<aside class="photo-detail-meta" aria-label="{tr(lang, 'photo_info')}">
          <dl>
            {"".join(f'<div><dt>{label}</dt><dd>{value}</dd></div>' for label, value in rows)}
          </dl>
        </aside>"""


def photo_json_ld(photo, url, description, lang="ru"):
    image = photo_asset_url(photo.get("src"))
    data = {
        "@context": "https://schema.org",
        "@type": "ImageObject",
        "name": photo_title(photo, 110, lang),
        "caption": photo_caption(photo, lang) or photo_title(photo, 110, lang),
        "description": description,
        "contentUrl": image,
        "url": url,
        "thumbnailUrl": image,
        "datePublished": iso_date(photo.get("date") or photo.get("uploadedAt")),
        "uploadDate": iso_date(photo.get("uploadedAt") or photo.get("date")),
        "creator": {"@type": "Person", "name": tr(lang, "site_name"), "url": SITE_URL},
        "creditText": tr(lang, "site_name"),
        "copyrightNotice": f"© {tr(lang, 'site_name')}",
        "license": LICENSE_URL,
        "acquireLicensePage": url,
        "isPartOf": {"@type": "CollectionPage", "name": tr(lang, "photos"), "url": localized_url("/photos/", lang)},
    }
    if photo.get("width"):
        data["width"] = f"{photo['width']}px"
    if photo.get("height"):
        data["height"] = f"{photo['height']}px"
    if photo_location(photo, lang):
        data["contentLocation"] = {"@type": "Place", "name": photo_location(photo, lang)}
    return data


def render_sitemap(posts, photos):
    latest_post = sitemap_date(posts[0].get("edited") or posts[0].get("date")) if posts else None
    latest_photo = sitemap_date(photos[0].get("uploadedAt") or photos[0].get("date")) if photos else None
    static_urls = [
        {"loc": localized_url("/barcelona-guide/", "ru")},
        {"loc": localized_url("/research/aesthetics-and-business/", "ru")},
    ]
    post_urls = []
    photo_urls = []
    for lang in LANGUAGES:
        static_urls.extend([
            {"loc": localized_url("/", lang)},
            {"loc": localized_url("/about/", lang)},
            {"loc": localized_url("/screenshots/", lang)},
            {"loc": localized_url("/photos/", lang), "lastmod": latest_photo},
            {"loc": localized_url("/places/", lang)},
            {"loc": localized_url("/research/", lang)},
            {"loc": localized_url("/photos/film/", lang), "lastmod": latest_photo},
            {"loc": localized_url("/photos/iphone/", lang), "lastmod": latest_photo},
            {"loc": localized_url("/photos/archive/", lang), "lastmod": latest_photo},
            {"loc": localized_url("/screenshots/posts/", lang), "lastmod": latest_post},
        ])
        post_urls.extend([
            {
                "loc": localized_url(f"/screenshots/{post['id']}/", lang),
                "lastmod": sitemap_date(post.get("edited") or post.get("date")),
            }
            for post in posts
        ])
        photo_urls.extend([
            {
                "loc": localized_url(f"/photos/{photo['id']}/", lang),
                "lastmod": sitemap_date(photo.get("uploadedAt") or photo.get("date")),
                "image": {
                    "loc": photo_asset_url(photo.get("src")),
                    "title": photo_title(photo, 110, lang),
                    "caption": photo_caption(photo, lang) or photo_title(photo, 110, lang),
                },
            }
            for photo in photos
        ])

    body = "\n".join(render_sitemap_url(url) for url in [*static_urls, *post_urls, *photo_urls])
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


def render_main_feed(posts, photos, lang="ru"):
    items = [post_feed_item(post, lang) for post in posts] + [photo_feed_item(photo, lang) for photo in photos]
    items = sorted(items, key=lambda item: item["sortDate"], reverse=True)[:FEED_LIMIT]
    return render_rss_feed(
        title=tr(lang, "site_name"),
        description=tr(lang, "main_feed_description"),
        link=localized_url("/", lang),
        self_url=localized_url("/feed.xml", lang),
        items=items,
        lang=lang,
    )


def render_photos_feed(photos, lang="ru"):
    return render_rss_feed(
        title=f"{tr(lang, 'photos')} — {tr(lang, 'site_name')}",
        description=tr(lang, "photos_description"),
        link=localized_url("/photos/", lang),
        self_url=localized_url("/photos/feed.xml", lang),
        items=[photo_feed_item(photo, lang) for photo in photos[:FEED_LIMIT]],
        lang=lang,
    )


def render_rss_feed(title, description, link, self_url, items, lang="ru"):
    latest = items[0]["sortDate"] if items else datetime.now(timezone.utc)
    body = "\n".join(render_feed_item(item) for item in items)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>{escape_html(title)}</title>
    <link>{escape_html(link)}</link>
    <description>{escape_html(description)}</description>
    <language>{tr(lang, "rss_lang")}</language>
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


def post_feed_item(post, lang="ru"):
    link = localized_url(f"/screenshots/{post.get('id')}/", lang)
    media = post_social_image(post)
    date = post_datetime(post)
    return {
        "title": post_title(post, 120, lang),
        "link": link,
        "guid": link,
        "pubDate": date,
        "sortDate": date,
        "description": post_description(post, lang),
        "category": CHANNEL_TITLE,
        "mediaUrl": media,
        "mediaType": guess_mime_type(media) if media else "",
    }


def photo_feed_item(photo, lang="ru"):
    link = localized_url(f"/photos/{photo.get('id')}/", lang)
    media = photo_asset_url(photo.get("src"))
    date = parse_date(photo.get("uploadedAt") or photo.get("date"))
    return {
        "title": photo_title(photo, 120, lang),
        "link": link,
        "guid": link,
        "pubDate": date,
        "sortDate": date,
        "description": f"{photo_description(photo, lang)} {tr(lang, 'photos_feed_license')}",
        "category": tr(lang, "photos"),
        "mediaUrl": media,
        "mediaType": photo.get("mimeType") or guess_mime_type(media),
    }


def remove_stale_photo_dirs(photo_ids, photos_dir=PHOTOS_DIR):
    for entry in photos_dir.iterdir():
        if not entry.is_dir() or entry.name == "archive" or entry.name in PHOTO_FILTER_DIRS or entry.name in photo_ids:
            continue
        shutil.rmtree(entry)


def render_header(current_path, lang="ru"):
    is_screenshots = current_path.startswith("/screenshots/")
    is_photos = current_path.startswith("/photos/")
    is_places = current_path.startswith("/places/")
    is_research = current_path.startswith("/research/")
    is_about = current_path.startswith("/about/")
    return f"""<header class="site-header" aria-label="{tr(lang, 'nav_aria')}">
        <a class="brand" href="{localized_path("/", lang)}">SS/84</a>
        <nav class="path" aria-label="{tr(lang, 'sections_aria')}">
          <a href="{localized_path("/screenshots/", lang)}"{' aria-current="page"' if is_screenshots else ''}>{tr(lang, 'blog')}</a>
          <a href="{localized_path("/photos/", lang)}"{' aria-current="page"' if is_photos else ''}>{tr(lang, 'photos')}</a>
          <a href="{localized_path("/places/", lang)}"{' aria-current="page"' if is_places else ''}>{tr(lang, 'places')}</a>
          <a href="{localized_path("/research/", lang)}"{' aria-current="page"' if is_research else ''} aria-label="{tr(lang, 'research')}"><span class="desktop-label">{tr(lang, 'research')}</span><span class="mobile-label">{tr(lang, 'research_mobile')}</span></a>
          <a href="{localized_path("/about/", lang)}"{' aria-current="page"' if is_about else ''}><span class="desktop-name">{tr(lang, 'about_desktop')}</span><span class="mobile-name">{tr(lang, 'about_mobile')}</span></a>
        </nav>
        {render_language_switcher(current_path, lang)}
      </header>"""


def render_language_switcher(current_path, lang="ru"):
    return f"""<nav class="language-switcher" aria-label="Language">
          <a href="{localized_path(current_path, 'ru')}" data-language-link data-lang="ru"{' aria-current="true"' if lang == 'ru' else ''}>рус</a><span aria-hidden="true">/</span><a href="{localized_path(current_path, 'en')}" data-language-link data-lang="en"{' aria-current="true"' if lang == 'en' else ''}>eng</a>
        </nav>"""


def render_photo_dialog(lang="ru"):
    return f"""<dialog class="photo-viewer" data-photo-dialog aria-label="{tr(lang, 'viewer')}">
      <div class="photo-viewer-bar">
        <button type="button" data-photo-prev aria-label="{tr(lang, 'previous_photo')}">‹</button>
        <button type="button" data-photo-actual>{tr(lang, 'actual')}</button>
        <button type="button" data-photo-next aria-label="{tr(lang, 'next_photo')}">›</button>
        <button type="button" data-photo-close>{tr(lang, 'close')}</button>
      </div>
      <figure class="photo-viewer-stage">
        <img data-photo-dialog-image alt="">
        <figcaption data-photo-dialog-caption></figcaption>
      </figure>
    </dialog>"""


def post_text(post, lang="ru"):
    if lang == "en":
        value = clean_text(translation(post, lang).get("text"))
        if value:
            return value
    return clean_text(post.get("text"))


def post_entities(post, lang="ru"):
    if lang == "en":
        value = translation(post, lang).get("entities")
        if isinstance(value, list):
            return value
    return post.get("entities") or []


def post_title(post, max_length=72, lang="ru"):
    title = post_text(post, lang) or tr(lang, "post_from").format(date=format_date(post_datetime(post), lang))
    return truncate_js_string(title, max_length)


def post_description(post, lang="ru"):
    description = post_text(post, lang) or tr(lang, "post_by_date").format(date=format_date(post_datetime(post), lang))
    return truncate_js_string(description, 156)


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


def photo_caption(photo, lang="ru"):
    if lang == "en":
        value = clean_text(translation(photo, lang).get("caption"))
        if value:
            return value
    return clean_text(photo.get("caption"))


def photo_title(photo, max_length=72, lang="ru"):
    title = photo_caption(photo, lang) or compact_text([
        photo_location(photo, lang),
        (photo.get("technical") or {}).get("cameraLine"),
        format_date(photo.get("date") or photo.get("uploadedAt"), lang),
    ]) or tr(lang, "photo_from").format(date=format_date(photo.get("date") or photo.get("uploadedAt"), lang))
    return truncate(title, max_length)


def photo_description(photo, lang="ru"):
    description = compact_text([
        photo_caption(photo, lang),
        photo_location(photo, lang),
        (photo.get("technical") or {}).get("cameraLine"),
        (photo.get("technical") or {}).get("lensLine"),
        format_date(photo.get("date") or photo.get("uploadedAt"), lang),
    ]) or tr(lang, "photo_by_date").format(date=format_date(photo.get("date") or photo.get("uploadedAt"), lang))
    return truncate(description, 156)


def photo_alt(photo, lang="ru"):
    if lang == "en":
        value = clean_text(translation(photo, lang).get("alt"))
        if value:
            return value
    return clean_text(photo.get("alt")) or photo_caption(photo, lang) or photo_title(photo, 100, lang)


def photo_location(photo, lang="ru"):
    location = photo.get("location") or {}
    if lang == "en":
        translated = clean_text(translation(photo, lang).get("locationLabel") or translation(photo, lang).get("location"))
        if translated:
            value = translated
        else:
            value = clean_text(location.get("label") or location.get("name"))
    else:
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


def photo_technique_options(photos, lang="ru"):
    return [
        {"value": "all", "label": tr(lang, "all_techniques"), "count": len(photos)},
        {"value": "film", "label": tr(lang, "film_technique"), "count": len(photos_by_technique(photos, "film"))},
        {"value": "iphone", "label": tr(lang, "iphone_technique"), "count": len(photos_by_technique(photos, "iphone"))},
    ]


def photos_by_technique(photos, value):
    if value == "all":
        return photos
    return [photo for photo in photos if photo_technique_key(photo) == value]


def photo_filter_path(value):
    if value == "film":
        return "/photos/film/"
    if value == "iphone":
        return "/photos/iphone/"
    return "/photos/"


def photo_filter_label(value, lang="ru"):
    if value == "film":
        return tr(lang, "film_technique")
    if value == "iphone":
        return tr(lang, "iphone_technique")
    return tr(lang, "all_techniques")


def photo_technique_key(photo):
    if is_film_photo(photo):
        return "film"
    if is_iphone_photo(photo):
        return "iphone"
    return "other"


def photo_camera_line(photo):
    technical = photo.get("technical") or {}
    return clean_text(technical.get("cameraLine") or technical.get("camera")) or "Camera"


def is_film_photo(photo):
    technical = photo.get("technical") or {}
    return technical.get("hasExif") is False


def is_iphone_photo(photo):
    return bool(re.search(r"iphone", photo_camera_line(photo), re.IGNORECASE))


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


def format_date(value, lang="ru"):
    date = parse_date(value)
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


def iso_date(value):
    return parse_date(value).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def sitemap_date(value):
    return iso_date(value)[:10]


def rss_date(value):
    return format_datetime(parse_date(value), usegmt=True)


def parse_date(value):
    if isinstance(value, datetime):
        date = value
    elif not value:
        return datetime.now(timezone.utc)
    else:
        text = str(value).replace("Z", "+00:00")
        try:
            date = datetime.fromisoformat(text)
        except ValueError:
            return datetime.now(timezone.utc)

    if date.tzinfo is None:
        date = date.replace(tzinfo=TELEGRAM_EXPORT_TZ)
    return date.astimezone(timezone.utc)


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


def truncate_js_string(value, max_length):
    value = str(value)
    encoded = value.encode("utf-16-le")
    length = len(encoded) // 2
    if length <= max_length:
        return value
    sliced = encoded[: (max_length - 1) * 2].decode("utf-16-le", errors="ignore").strip()
    return sliced + "…"


def escape_html(value=""):
    return clean_text(value).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def escape_attr(value=""):
    return escape_html(value).replace("\n", " ")


def json_script(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")


if __name__ == "__main__":
    main()
