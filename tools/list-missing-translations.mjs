#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const args = parseArgs(process.argv.slice(2));
const limit = Number(args.limit || 10);
const kind = args.kind || "all";

const postsDb = readJson(path.join(rootDir, "assets", "telegram", "posts.json"), { posts: [] });
const photosDb = readJson(path.join(rootDir, "assets", "photos", "photos.json"), { photos: [] });
const queue = [];

if (kind === "all" || kind === "post" || kind === "posts") {
  for (const post of postsDb.posts || []) {
    if (!normalizeText(post.text)) continue;
    if (normalizeText(post.translations?.en?.text)) continue;

    queue.push({
      kind: "post",
      id: String(post.id),
      date: post.date || "",
      text: post.text,
      links: (post.entities || [])
        .filter((entity) => entity.type === "text_link" && entity.href)
        .map((entity) => ({ text: entity.text || "", href: entity.href || "" })),
    });
  }
}

if (kind === "all" || kind === "photo" || kind === "photos") {
  for (const photo of photosDb.photos || []) {
    const translation = photo.translations?.en || {};
    if (!normalizeText(photo.caption) && !normalizeText(photo.alt) && !normalizeText(locationLabel(photo))) continue;
    if (normalizeText(translation.caption) || normalizeText(translation.alt) || normalizeText(translation.locationLabel)) continue;

    queue.push({
      kind: "photo",
      id: String(photo.id),
      capturedAt: photo.capturedAt || "",
      caption: photo.caption || "",
      alt: photo.alt || "",
      locationLabel: locationLabel(photo),
    });
  }
}

console.log(JSON.stringify(queue.slice(0, limit), null, 2));

function locationLabel(photo) {
  return photo.location?.label || photo.location?.name || "";
}

function normalizeText(value) {
  return value == null ? "" : String(value).replace(/\s+/g, " ").trim();
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function parseArgs(values) {
  const result = {};

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;

    const key = value.slice(2);
    const next = values[index + 1];

    if (!next || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }

  return result;
}
