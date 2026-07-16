#!/usr/bin/env python3

import html
import json
import math
import re
from pathlib import Path
from urllib.parse import urlsplit

import generate_photo_previews


ROOT_DIR = Path(__file__).resolve().parent.parent
POSTS_JSON_PATH = ROOT_DIR / "assets/telegram/posts.json"
PHOTOS_JSON_PATH = ROOT_DIR / "assets/photos/photos.json"
HOME_PATHS = {
    "ru": ROOT_DIR / "index.html",
    "en": ROOT_DIR / "en/index.html",
}
TELEGRAM_MEDIA_BASE = "https://s3.twcstorage.ru/00df5bd5-137f-492a-8d95-c7ee2cc2d851"
SITE_URL = "https://tomilov.com"
START_MARKER = "<!-- home-canvas-generated:start -->"
END_MARKER = "<!-- home-canvas-generated:end -->"
SURFACE_PATTERN = re.compile(r'<div class="home-canvas-surface" data-canvas-surface(?:\s+[^>]*)?>')
GENERATED_PATTERN = re.compile(
    rf"(?P<indent>^[ \t]*){re.escape(START_MARKER)}.*?^[ \t]*{re.escape(END_MARKER)}",
    re.MULTILINE | re.DOTALL,
)

THEMES = [
    {
        "id": "ai",
        "angle": -1.62,
        "color": "#7b65d8",
        "label": {"ru": "AI", "en": "AI"},
        "patterns": [
            re.compile(r"(^|\s)(ai|ии)(\s|$)", re.IGNORECASE),
            re.compile(r"gpt|openai|нейро|llm|chatgpt|midjourney|claude|генератив|agent|агент|codex", re.IGNORECASE),
        ],
    },
    {
        "id": "photos",
        "angle": -0.82,
        "color": "#2fae91",
        "label": {"ru": "Фото", "en": "Photos"},
        "patterns": [
            re.compile(r"фото|камера|снимок|снимки|leica|iphone|hdr|объектив|пл[её]нк|фотограф|съ[её]мк", re.IGNORECASE),
        ],
    },
    {
        "id": "products",
        "angle": -0.08,
        "color": "#2f8ad8",
        "label": {"ru": "Продукты", "en": "Products"},
        "patterns": [
            re.compile(r"продукт|стартап|сервис|прилож|пользователь|фича|запуск|подписк|монетиз|платформ|рекомендац", re.IGNORECASE),
        ],
    },
    {
        "id": "design",
        "angle": 0.58,
        "color": "#df5c4f",
        "label": {"ru": "Дизайн", "en": "Design"},
        "patterns": [
            re.compile(r"дизайн|интерфейс|\bui\b|\bux\b|figma|шрифт|визуал|лендинг|экран|кнопк|цвет|типограф|анимац|микро", re.IGNORECASE),
        ],
    },
    {
        "id": "myphotos",
        "angle": 1.2,
        "color": "#c7922f",
        "label": {"ru": "Мои фото", "en": "My photos"},
        "patterns": [],
    },
    {
        "id": "games",
        "angle": 2.42,
        "color": "#6171d4",
        "label": {"ru": "Игры", "en": "Games"},
        "patterns": [
            re.compile(r"игр|\bgame\b|gaming|doom|silent hill|nintendo|playstation|xbox|steam|sekiro|dead space|гейм|mixtape|wicked", re.IGNORECASE),
        ],
    },
    {
        "id": "brands",
        "angle": -2.62,
        "color": "#8b8780",
        "label": {"ru": "Бренды", "en": "Brands"},
        "patterns": [
            re.compile(r"бренд|\bbrand\b|nike|apple|google|teenage engineering|dyson|sony|tesla|ikea|leica|nothing|airbnb|ferrari|anthropic", re.IGNORECASE),
        ],
    },
]
THEMES_BY_ID = {theme["id"]: theme for theme in THEMES}

BASE_RADIUS = 760
RING_STEP = 330
TANGENT_SPACING = 280
SECTOR_WIDTH = 0.5
CANVAS_MARGIN = 760
CARD_BOUNDS = {
    "is-small": (178, 260),
    "is-medium": (224, 320),
    "is-large": (276, 360),
    "is-wide": (334, 360),
    "is-tall": (196, 360),
}


def main():
    posts = sorted(read_json(POSTS_JSON_PATH, {"posts": []}).get("posts", []), key=post_sort_key, reverse=True)
    photos = sorted(read_json(PHOTOS_JSON_PATH, {"photos": []}).get("photos", []), key=photo_sort_key, reverse=True)
    geometry, items = build_layout(posts, photos)

    for lang, path in HOME_PATHS.items():
        update_home_page(path, geometry, items, lang)

    print(f"Generated home canvas with {len(posts)} posts and {len(photos)} photos")
    print(HOME_PATHS["ru"].relative_to(ROOT_DIR))
    print(HOME_PATHS["en"].relative_to(ROOT_DIR))


def generate(posts, photos):
    geometry, items = build_layout(posts, photos)
    for lang, path in HOME_PATHS.items():
        update_home_page(path, geometry, items, lang)
    return geometry, items


def build_layout(posts, photos):
    grouped = {theme["id"]: [] for theme in THEMES}

    for post in posts:
        theme_id = classify_post(post)
        grouped[theme_id].append({
            "id": f"post-{post.get('id', '')}",
            "kind": "post",
            "themeId": theme_id,
            "record": post,
            "time": post_sort_key(post),
        })

    for photo in photos:
        grouped["myphotos"].append({
            "id": f"photo-{photo.get('id', '')}",
            "kind": "photo",
            "themeId": "myphotos",
            "record": photo,
            "time": photo_sort_key(photo),
        })

    positioned = []
    for theme in THEMES:
        group = sorted(grouped[theme["id"]], key=lambda item: item["time"], reverse=True)
        ring = 0
        offset = 0

        while offset < len(group):
            radius = BASE_RADIUS + ring * RING_STEP
            capacity = max(2, math.floor(radius * SECTOR_WIDTH / TANGENT_SPACING))
            current = group[offset:offset + capacity]

            for slot, item in enumerate(current):
                slot_progress = slot / max(1, len(current) - 1)
                distance = radius + slot_progress * 42
                tangent = (slot - (len(current) - 1) / 2) * TANGENT_SPACING
                tangent += (noise(item["id"], "tangent") - 0.5) * 34
                normal = theme["angle"] + math.pi / 2
                x = math.cos(theme["angle"]) * distance + math.cos(normal) * tangent
                y = math.sin(theme["angle"]) * distance + math.sin(normal) * tangent
                variant = item_variant(item)
                size = item_size(item, offset + slot, variant)
                positioned.append({
                    **item,
                    "theme": theme,
                    "variant": variant,
                    "size": size,
                    "x": x,
                    "y": y,
                    "distance": distance,
                    "ring": ring,
                    "rotation": (noise(item["id"], "rotation") - 0.5) * (3 if variant == "note" else 5),
                })

            offset += len(current)
            ring += 1

    if not positioned:
        return {"width": 7000, "height": 6600, "centerX": 3500, "centerY": 3300}, []

    min_x = min(item["x"] - CARD_BOUNDS[item["size"]][0] / 2 for item in positioned)
    max_x = max(item["x"] + CARD_BOUNDS[item["size"]][0] / 2 for item in positioned)
    min_y = min(item["y"] - CARD_BOUNDS[item["size"]][1] / 2 for item in positioned)
    max_y = max(item["y"] + CARD_BOUNDS[item["size"]][1] / 2 for item in positioned)
    center_x = round(-min_x + CANVAS_MARGIN)
    center_y = round(-min_y + CANVAS_MARGIN)
    width = round(max_x - min_x + CANVAS_MARGIN * 2)
    height = round(max_y - min_y + CANVAS_MARGIN * 2)

    for item in positioned:
        item["x"] = round(item["x"] + center_x, 2)
        item["y"] = round(item["y"] + center_y, 2)
        item["z"] = max(1, 5000 - item["ring"] * 10)

    geometry = {
        "width": width,
        "height": height,
        "centerX": center_x,
        "centerY": center_y,
    }
    return geometry, positioned


def classify_post(post):
    text = f"{post.get('text') or ''} {translation(post, 'en').get('text') or ''}".lower()
    best_theme = "products"
    best_score = 0

    for theme in THEMES:
        if theme["id"] == "myphotos":
            continue
        score = sum(1 for pattern in theme["patterns"] if pattern.search(text))
        if score > best_score:
            best_theme = theme["id"]
            best_score = score

    return best_theme


def item_variant(item):
    if item["kind"] == "photo":
        return "photo"
    record = item["record"]
    media = post_media(record)
    if len(media) > 1:
        return "stack"
    if len(media) == 1:
        return "media"
    if post_link(record, "ru") or post_link(record, "en"):
        return "link"
    return "note" if len(post_text(record, "ru")) > 170 else "link"


def item_size(item, index, variant):
    if variant == "stack":
        return "is-large" if index % 2 else "is-wide"
    if variant == "photo":
        return "is-tall" if index % 3 == 0 else "is-small"
    if variant == "note":
        return "is-large" if index % 4 == 0 else "is-small"
    if variant == "link":
        return "is-small"
    return "is-large" if index % 5 == 0 else "is-medium"


def update_home_page(path, geometry, items, lang):
    source = path.read_text(encoding="utf-8")
    if not GENERATED_PATTERN.search(source):
        raise ValueError(f"Missing home canvas generation markers in {path.relative_to(ROOT_DIR)}")

    surface = (
        '<div class="home-canvas-surface" data-canvas-surface '
        f'data-canvas-width="{geometry["width"]}" data-canvas-height="{geometry["height"]}" '
        f'data-canvas-center-x="{geometry["centerX"]}" data-canvas-center-y="{geometry["centerY"]}" '
        f'style="width: {geometry["width"]}px; height: {geometry["height"]}px">'
    )
    source, replacements = SURFACE_PATTERN.subn(surface, source, count=1)
    if replacements != 1:
        raise ValueError(f"Missing home canvas surface in {path.relative_to(ROOT_DIR)}")

    markup = render_nodes(items, geometry, lang)

    def replace_generated(match):
        indent = match.group("indent")
        body = "\n".join(f"{indent}{line}" if line else "" for line in markup.splitlines())
        return f"{indent}{START_MARKER}\n{body}\n{indent}{END_MARKER}"

    source = GENERATED_PATTERN.sub(replace_generated, source, count=1)
    path.write_text(source, encoding="utf-8")


def render_nodes(items, geometry, lang):
    about_href = "/en/about/" if lang == "en" else "/about/"
    about_label = "About Seryozha Tomilov" if lang == "en" else "О Серёже Томилове"
    cards = "\n".join(render_card(item, lang) for item in items)
    return f'''<div class="home-canvas-nodes" data-canvas-nodes>
  <a class="home-canvas-avatar" href="{about_href}" style="left: {geometry["centerX"]}px; top: {geometry["centerY"]}px" aria-label="{about_label}">
    <img src="/assets/og.png" alt="" loading="eager" decoding="async">
    <span>SS/84</span>
  </a>
{cards}
</div>'''


def render_card(item, lang):
    record = item["record"]
    theme = item["theme"]
    title = item_title(item, lang)
    href = item_href(item, lang)
    width, height = CARD_BOUNDS[item["size"]]
    content = render_card_content(item, lang, title)
    style = (
        f'left: {format_number(item["x"])}px; top: {format_number(item["y"])}px; '
        f'--rotation: {item["rotation"]:.2f}deg; --z: {item["z"]}; --theme-color: {theme["color"]}'
    )
    return f'''  <a class="home-canvas-node is-{item["variant"]} {item["size"]} is-placeholder" href="{escape_attr(href)}" draggable="false" data-home-node="true" data-canvas-x="{format_number(item["x"])}" data-canvas-y="{format_number(item["y"])}" data-canvas-width="{width}" data-canvas-height="{height}" style="{style}" aria-label="{escape_attr(title)}">
    <span class="home-canvas-card-placeholder" aria-hidden="true"></span>
    <template data-canvas-card-template>
{indent_lines(content, 6)}
    </template>
  </a>'''


def render_card_content(item, lang, title):
    if item["kind"] == "photo":
        original_src = photo_asset_url(item["record"].get("src"))
        media = [{
            "src": generate_photo_previews.preview_public_url(item["record"]),
            "fallbackSrc": original_src,
            "width": item["record"].get("width"),
            "height": item["record"].get("height"),
        }]
    else:
        media = post_media(item["record"])

    if item["variant"] == "stack":
        images = "\n".join(render_lazy_image(value, title) for value in media[:3])
        return f'''<div class="home-canvas-media-stack">
{indent_lines(images, 2)}
</div>
{render_card_copy(item, lang, title, 120)}'''
    if item["variant"] in {"media", "photo"}:
        max_length = 80 if item["variant"] == "photo" else 130
        return f'''<div class="home-canvas-media-frame">
  {render_lazy_image(media[0], title)}
</div>
{render_card_copy(item, lang, title, max_length)}'''
    if item["variant"] == "link":
        link = post_link(item["record"], lang) if item["kind"] == "post" else None
        domain = link_domain((link or {}).get("href")) or item["theme"]["label"].get(lang, item["theme"]["label"]["ru"])
        link_title = (link or {}).get("text") or title
        excerpt = item_text(item, lang)
        return f'''<div class="home-canvas-link-preview">
  <span>{escape_text(domain)}</span>
  <strong>{escape_text(truncate(link_title, 78))}</strong>
  <p>{escape_text(truncate(excerpt, 170))}</p>
  {render_time(item_date(item), lang)}
</div>'''

    max_length = 260 if item["size"] == "is-large" else 190
    return f'''<div class="home-canvas-note">
  <p>{escape_text(truncate(item_text(item, lang) or title, max_length))}</p>
  {render_time(item_date(item), lang)}
</div>'''


def render_card_copy(item, lang, title, max_length):
    return f'''<div class="home-canvas-card-copy">
  <strong>{escape_text(truncate(title, max_length))}</strong>
  {render_time(item_date(item), lang)}
</div>'''


def render_time(value, lang):
    label = format_date(value, lang) if value else THEMES_BY_ID["products"]["label"][lang]
    return f'<time class="home-canvas-date" datetime="{escape_attr(value)}">{escape_text(label)}</time>'


def render_lazy_image(media, alt):
    dimensions = ""
    if media.get("width") and media.get("height"):
        dimensions = f' width="{escape_attr(media["width"])}" height="{escape_attr(media["height"])}"'
    fallback = ""
    if media.get("fallbackSrc"):
        fallback = f' data-fallback-src="{escape_attr(media["fallbackSrc"])}"'
    return (
        f'<img data-src="{escape_attr(media.get("src", ""))}" alt="{escape_attr(alt)}" '
        f'draggable="false" loading="lazy" decoding="async" fetchpriority="low"{fallback}{dimensions}>'
    )


def item_title(item, lang):
    if item["kind"] == "photo":
        return photo_title(item["record"], lang)
    text = post_text(item["record"], lang)
    first_line = re.split(r"\n+", text, maxsplit=1)[0].strip() if text else ""
    return first_line or ("Post" if lang == "en" else "Пост")


def item_text(item, lang):
    if item["kind"] == "photo":
        return photo_title(item["record"], lang)
    return post_text(item["record"], lang)


def item_href(item, lang):
    prefix = "/en" if lang == "en" else ""
    record_id = item["record"].get("id", "")
    section = "photos" if item["kind"] == "photo" else "screenshots"
    return f"{prefix}/{section}/{record_id}/"


def item_date(item):
    record = item["record"]
    return str(record.get("uploadedAt") or record.get("date") or "")


def post_text(post, lang):
    if lang == "en":
        translated = strip_line_end_whitespace(translation(post, "en").get("text") or "").strip()
        if translated:
            return translated
    return strip_line_end_whitespace(post.get("text") or "").strip()


def post_link(post, lang):
    entities = translation(post, "en").get("entities") if lang == "en" else None
    if not isinstance(entities, list):
        entities = post.get("entities") or []
    return next((entity for entity in entities if entity.get("href")), None)


def post_media(post):
    values = []
    for media in post.get("media") or []:
        src = media.get("poster") if media.get("type") in {"video", "animation"} else media.get("src")
        if not src:
            continue
        values.append({
            "src": telegram_asset_url(src),
            "width": media.get("width"),
            "height": media.get("height"),
        })
    return values


def photo_title(photo, lang):
    caption = ""
    if lang == "en":
        caption = str(translation(photo, "en").get("caption") or "").strip()
    caption = caption or str(photo.get("caption") or "").strip()
    if caption:
        return caption
    technical = photo.get("technical") or {}
    location = photo.get("location") or {}
    values = [technical.get("cameraLine"), technical.get("lensLine"), location.get("label") or location.get("name")]
    values = [clean_text(value) for value in values if clean_text(value)]
    if values:
        return " · ".join(values)
    return ("Photo" if lang == "en" else "Фото") + (f" · {format_date(photo.get('date') or photo.get('uploadedAt'), lang)}" if item_date({"record": photo}) else "")


def telegram_asset_url(src):
    value = str(src or "")
    return f"{TELEGRAM_MEDIA_BASE}{value}" if value.startswith("/assets/telegram/") else value


def photo_asset_url(src):
    value = str(src or "")
    if value.startswith(("http://", "https://")):
        return value
    return f"{SITE_URL}{value}" if value else f"{SITE_URL}/assets/og.png"


def link_domain(value):
    try:
        return (urlsplit(value or "").hostname or "").removeprefix("www.")
    except ValueError:
        return ""


def translation(item, lang):
    return ((item.get("translations") or {}).get(lang) or {})


def post_sort_key(post):
    try:
        timestamp = int(post.get("dateUnixtime") or 0)
    except (TypeError, ValueError):
        timestamp = 0
    return timestamp, str(post.get("date") or "")


def photo_sort_key(photo):
    return str(photo.get("uploadedAt") or photo.get("id") or photo.get("date") or "")


def format_date(value, lang):
    text = str(value or "")[:10]
    try:
        year, month, day = (int(part) for part in text.split("-"))
    except (TypeError, ValueError):
        return text
    if lang == "en":
        months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
        return f"{months[month - 1]} {day}, {year}"
    months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"]
    return f"{day} {months[month - 1]} {year} г."


def noise(value, salt):
    result = 2166136261
    for char in f"{value}:{salt}":
        result ^= ord(char)
        result = (result * 16777619) & 0xFFFFFFFF
    return (result % 10000) / 10000


def read_json(path, fallback):
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def clean_text(value):
    return re.sub(r"\s+", " ", str(value or "")).strip()


def strip_line_end_whitespace(value):
    return re.sub(r"[ \t]+$", "", str(value or ""), flags=re.MULTILINE)


def truncate(value, max_length):
    value = str(value or "")
    return value if len(value) <= max_length else value[:max_length - 1].rstrip() + "…"


def escape_text(value):
    return html.escape(str(value or ""), quote=False)


def escape_attr(value):
    return html.escape(str(value or ""), quote=True)


def indent_lines(value, spaces):
    prefix = " " * spaces
    return "\n".join(f"{prefix}{line}" if line else "" for line in str(value).splitlines())


def format_number(value):
    return f"{value:.2f}".rstrip("0").rstrip(".")


if __name__ == "__main__":
    main()
