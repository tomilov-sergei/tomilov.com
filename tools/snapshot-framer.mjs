import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const routes = [
  { name: "home", source: "https://tomilov.com/", target: "framer-snapshot/index.html" },
  { name: "about", source: "https://tomilov.com/about", target: "framer-snapshot/about/index.html" },
];

function removeFramerAnalytics(html) {
  return html.replace(
    /\s*<script async src="https:\/\/events\.framer\.com\/script[^>]*><\/script>/,
    ""
  );
}

function removeFramerRuntime(html) {
  return html
    .replace(/\s*<meta name="framer-search-index" content="https:\/\/framerusercontent\.com\/[^"]+">/g, "")
    .replace(/<link rel="modulepreload"[^>]+href="https:\/\/framerusercontent\.com\/sites\/[^"]+"[^>]*>/g, "")
    .replace(/<script type="module"[^>]+data-framer-bundle="main"[^>]*><\/script>/g, "")
    .replace(/@font-face\{font-family:[^;{}]+;src:url\(https:\/\/framerusercontent\.com\/assets\/[^)]+\)[^}]*\}/g, "");
}

function makeLocalLinks(html) {
  return html
    .replaceAll('href="./about"', 'href="/about/"')
    .replaceAll('href="./"', 'href="/"')
    .replaceAll('href="https://tomilov.com/about"', 'href="/about/"')
    .replaceAll('href="https://tomilov.com/"', 'href="/"')
    .replaceAll('content="https://tomilov.com/about"', 'content="https://tomilov.com/about"');
}

const assetCache = new Map();

function getLocalAssetPath(url) {
  const parsed = new URL(url);
  const extension = path.extname(parsed.pathname) || ".bin";
  const baseName = path.basename(parsed.pathname, extension);
  const querySuffix = parsed.search
    ? `-${parsed.search.slice(1).replace(/[^a-zA-Z0-9]+/g, "-").replace(/-$/g, "")}`
    : "";

  return `/assets/framer/${baseName}${querySuffix}${extension}`;
}

async function localizeFramerAssets(html) {
  const urls = new Set(
    [...html.matchAll(/https:\/\/framerusercontent\.com\/[^"')\s]+/g)]
      .map((match) => match[0])
      .filter((url) => !url.includes("/sites/"))
      .filter((url) => !url.includes("/assets/") || !url.endsWith(".woff2"))
      .filter((url) => !url.includes("/searchIndex-"))
  );

  let localized = html;

  for (const url of urls) {
    const localPath = getLocalAssetPath(url);
    localized = localized.replaceAll(url, localPath);

    if (assetCache.has(url)) continue;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }

    const filePath = `framer-snapshot${localPath}`;
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
    assetCache.set(url, localPath);
  }

  return localized;
}

async function makeSnapshotHtml(html) {
  return localizeFramerAssets(makeLocalLinks(removeFramerRuntime(removeFramerAnalytics(html))));
}

function extractStyleArchive(html) {
  return [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/g)]
    .map((match, index) => `/* style block ${index + 1} */\n${match[1].trim()}`)
    .join("\n\n");
}

for (const route of routes) {
  const response = await fetch(route.source);

  if (!response.ok) {
    throw new Error(`Failed to fetch ${route.source}: ${response.status}`);
  }

  const html = await makeSnapshotHtml(await response.text());
  const directory = route.target.split("/").slice(0, -1).join("/");

  await mkdir(directory, { recursive: true });
  await mkdir("framer-snapshot/styles", { recursive: true });
  await writeFile(route.target, html);
  await writeFile(`framer-snapshot/styles/${route.name}.css`, extractStyleArchive(html));
  console.log(`Wrote ${route.target}`);
}
