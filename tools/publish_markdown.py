#!/usr/bin/env python3
"""Publish Markdown counterparts for the canonical pages in the public sitemap."""

import argparse
import os
import re
from dataclasses import dataclass, field
from html import escape as escape_html
from html.parser import HTMLParser
from pathlib import Path
from tempfile import NamedTemporaryFile
from urllib.parse import quote, urljoin, urlsplit
from xml.etree import ElementTree as ET


ROOT = Path(__file__).resolve().parent.parent
SITE = "https://tomilov.com"
READY = "llms-full.txt"
SKIP_TAGS = {"script", "style", "template", "svg", "nav", "footer", "dialog", "button", "select", "noscript", "input", "label", "output"}
SKIP_CLASSES = {"site-header", "home-canvas-viewport", "screenshot-reactions", "mobile-label", "mobile-name"}
VOID_TAGS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}
BLOCK_TAGS = {"address", "article", "aside", "div", "dl", "figcaption", "figure", "header", "p", "section"}
ALT_LINK = re.compile(r'<link rel="alternate" type="text/markdown" href="[^"]+">\n')
SPACE = re.compile(r"\s+")


@dataclass
class Element:
    tag: str
    attrs: dict = field(default_factory=dict)
    children: list = field(default_factory=list)

    def find(self, tag):
        if self.tag == tag:
            return self
        for child in self.children:
            if isinstance(child, Element):
                match = child.find(tag)
                if match is not None:
                    return match
        return None

    def text(self):
        return "".join(child if isinstance(child, str) else child.text() for child in self.children)


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.stack = [Element("document")]
        self.root = self.stack[0]
        self.feed(html)
        self.close()

    def handle_starttag(self, tag, attrs):
        node = Element(tag, dict(attrs))
        self.stack[-1].children.append(node)
        if tag not in VOID_TAGS:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                del self.stack[index:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)


def inline(text):
    return SPACE.sub(" ", text).strip()


def safe_url(page_url, value):
    if not value:
        return ""
    url = urljoin(page_url, value)
    if urlsplit(url).scheme not in {"http", "https", "mailto", "tel"}:
        return ""
    return quote(url, safe=":/?#[]@!$&'*+,;=%~")


def escape(text):
    return re.sub(r"([\\`*_[\]<>])", r"\\\1", text)


def render(node, page_url):
    if isinstance(node, str):
        return escape(SPACE.sub(" ", node))

    tag, attrs = node.tag, node.attrs
    if tag in SKIP_TAGS or SKIP_CLASSES.intersection(attrs.get("class", "").split()):
        return ""
    if attrs.get("aria-hidden") == "true" or attrs.get("id") == "home-canvas-help":
        return ""
    if tag in {"img", "video", "audio", "iframe"}:
        source = node.find("source")
        url = safe_url(page_url, attrs.get("src") or (source.attrs.get("src") if source else ""))
        label = escape(attrs.get("alt") or attrs.get("aria-label") or attrs.get("title") or tag)
        return f"![{label}]({url})" if tag == "img" and url else f"[{label}]({url})" if url else ""
    if tag in {"code", "pre"}:
        code = node.text()
        fence = "`" * (max((len(m) for m in re.findall(r"`+", code)), default=0) + 1)
        if tag == "pre":
            fence = fence.ljust(3, "`")
            code = code.strip("\n")
            return f"\n\n{fence}\n{code}\n{fence}\n\n"
        return f"{fence} {code} {fence}" if "`" in code else f"`{code}`"
    if tag == "table":
        return render_table(node, page_url)

    body = "".join(render(child, page_url) for child in node.children)
    if tag == "a":
        url = safe_url(page_url, attrs.get("href"))
        if not url or not body.strip():
            return body
        if "\n\n" in body:
            heading = next((heading for level in range(1, 7) if (heading := node.find(f"h{level}"))), None)
            label = escape(inline(heading.text())) if heading else url
            return f"{body}\n[{label}]({url})\n\n"
        return f"[{inline(body)}]({url})"
    if tag in {"strong", "b", "em", "i", "s", "del"} and body.strip():
        mark = {"strong": "**", "b": "**", "em": "*", "i": "*", "s": "~~", "del": "~~"}[tag]
        return body.replace(body.strip(), f"{mark}{body.strip()}{mark}", 1)
    if tag in {"h1", "h2", "h3", "h4", "h5", "h6"}:
        return f"\n\n{'#' * int(tag[1])} {inline(body)}\n\n"
    if tag in {"ul", "ol"}:
        items = [child for child in node.children if isinstance(child, Element) and child.tag == "li"]
        return "\n\n" + "\n".join(
            list_item(render(item, page_url), f"{index}. " if tag == "ol" else "- ")
            for index, item in enumerate(items, list_start(attrs.get("start")))
        ) + "\n\n"
    if tag == "blockquote":
        return "\n\n" + "\n".join("> " + line for line in body.strip().splitlines()) + "\n\n"
    if tag == "br":
        return "  \n"
    if tag == "hr":
        return "\n\n---\n\n"
    if tag == "dt":
        return f"\n**{inline(body)}**"
    if tag == "dd":
        return f" — {inline(body)}\n"
    if tag in BLOCK_TAGS:
        return f"\n\n{body.strip()}\n\n" if body.strip() else ""
    return body


def list_start(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return 1


def list_item(body, marker):
    lines = body.strip().splitlines()
    return marker + ("\n" + " " * len(marker)).join(lines)


def render_table(table, page_url):
    def rows(node):
        for child in node.children:
            if not isinstance(child, Element):
                continue
            if child.tag == "tr":
                yield [cell for cell in child.children if isinstance(cell, Element) and cell.tag in {"th", "td"}]
            if child.tag in {"thead", "tbody", "tfoot"}:
                yield from rows(child)

    cells = list(filter(None, rows(table)))
    width = max(map(len, cells), default=0)
    if not width:
        return ""
    if any("rowspan" in cell.attrs or "colspan" in cell.attrs for row in cells for cell in row):
        # GFM pipe tables have no merged cells. Keep their geometry as HTML.
        rows_html = []
        for row in cells:
            cells_html = []
            for cell in row:
                spans = "".join(
                    f' {name}="{cell.attrs[name]}"'
                    for name in ("rowspan", "colspan")
                    if cell.attrs.get(name, "").isdigit()
                )
                cells_html.append(f"<{cell.tag}{spans}>{escape_html(inline(cell.text()))}</{cell.tag}>")
            rows_html.append("<tr>" + "".join(cells_html) + "</tr>")
        return "\n\n<table>\n" + "\n".join(rows_html) + "\n</table>\n\n"
    values = [
        [inline(render(cell, page_url)).replace("|", "\\|") for cell in row] + [""] * (width - len(row))
        for row in cells
    ]
    if not any(cell.tag == "th" for cell in cells[0]):
        values.insert(0, [""] * width)
    values.insert(1, ["---"] * width)
    return "\n\n" + "\n".join("| " + " | ".join(row) + " |" for row in values) + "\n\n"


def markdown_path(page_path):
    return "/index.md" if page_path == "/" else page_path.rstrip("/") + ".md"


def render_page(html, page_path):
    page_url = SITE + page_path
    root = Page(html).root
    main = root.find("main")
    if main is None:
        raise ValueError(f"Missing main content in {page_path}")
    body = render(main, page_url)
    heading = main.find("h1")
    if heading is not None:
        title_line = render(heading, page_url).strip()
        body = f"{title_line}\n\n{body.replace(title_line, '', 1)}"
    else:
        title = root.find("title")
        if title is None:
            raise ValueError(f"Missing title in {page_path}")
        body = f"# {escape(inline(title.text()))}\n\n{body}"
    if page_path in {"/", "/en/"}:
        nav = main.find("nav")
        links = [render(child, page_url) for child in nav.children if isinstance(child, Element) and child.tag == "a"]
        body += "\n\n" + "\n".join("- " + link for link in links)
    body = re.sub(
        r"(?m)^(`{3,})\n[\s\S]*?^\1$|\n(?:[ \t]*\n){2,}",
        lambda match: match[0] if match[1] else "\n\n",
        body,
    ).strip()
    return f"{body}\n\n<{page_url}>\n"


def write_changed(path, content):
    if path.is_file() and path.read_text(encoding="utf-8") == content:
        return
    # Live generation runs under www-data. Keep the shared release group writable.
    with NamedTemporaryFile(dir=path.parent, delete=False) as output:
        temporary = Path(output.name)
        try:
            output.write(content.encode("utf-8"))
            output.close()
            temporary.chmod(0o664)
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)


def write_page(path, html, root=ROOT, *, publish=False):
    if not publish and not (root / READY).is_file():
        path.write_text(html, encoding="utf-8")
        return
    relative = path.parent.relative_to(root).as_posix()
    page_path = "/" if relative == "." else f"/{relative}/"
    alternate = markdown_path(page_path)
    target = root / alternate.lstrip("/")
    html = ALT_LINK.sub("", html)
    tag = f'<link rel="alternate" type="text/markdown" href="{alternate}">'
    if "</head>" not in html:
        raise ValueError(f"Missing HTML head in {page_path}")
    write_changed(target, render_page(html, page_path))
    write_changed(path, html.replace("</head>", f"{tag}\n</head>", 1))


def remove_page(path, root=ROOT):
    if (root / READY).is_file():
        path.with_name(path.name + ".md").unlink(missing_ok=True)


def publish_site(root):
    namespace = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    sitemap = ET.parse(root / "sitemap.xml")
    published = set()
    for location in sitemap.findall("s:url/s:loc", namespace):
        url = urlsplit(location.text)
        if url.netloc != "tomilov.com" or not re.fullmatch(r"/(?:[a-zA-Z0-9-]+/)*", url.path):
            raise ValueError(f"Unexpected sitemap location: {location.text}")
        path = root / url.path.lstrip("/") / "index.html"
        write_page(path, path.read_text(encoding="utf-8"), root, publish=True)
        published.add(markdown_path(url.path))
    index = (root / "llms.txt").read_text(encoding="utf-8")
    for url in re.findall(r"\(https://tomilov\.com(/[^)]+\.md)\)", index):
        if url not in published:
            raise ValueError(f"Unknown llms.txt link: {url}")
    about = (root / "about.md").read_text(encoding="utf-8")
    write_changed(root / READY, f"{index.rstrip()}\n\n---\n\n{about}")
    print(f"Published {len(published)} Markdown pages")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=ROOT)
    publish_site(parser.parse_args().root.resolve())
