#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const args = parseArgs(process.argv.slice(2));
const inputPath = args._[0];
const status = args.status || "codex-draft";
const model = args.model || "codex";

if (!inputPath) {
  throw new Error("Usage: node tools/apply-codex-translations.mjs <translations.json> [--status codex-draft]");
}

const postsPath = path.join(rootDir, "assets", "telegram", "posts.json");
const photosPath = path.join(rootDir, "assets", "photos", "photos.json");
const postsDb = readJson(postsPath, { posts: [] });
const photosDb = readJson(photosPath, { photos: [] });
const translations = readJson(path.resolve(rootDir, inputPath), {});
const postsById = new Map((postsDb.posts || []).map((post) => [String(post.id), post]));
const photosById = new Map((photosDb.photos || []).map((photo) => [String(photo.id), photo]));
const now = new Date().toISOString();
let postCount = 0;
let photoCount = 0;

for (const translation of normalizeItems(translations.posts)) {
  const id = String(translation.id || "");
  const post = postsById.get(id);
  if (!post) throw new Error(`Unknown post id: ${id}`);

  const text = cleanRequiredText(translation.text, `post ${id}`);
  const entities = Array.isArray(translation.entities)
    ? validateEntities(translation.entities, text, `post ${id}`)
    : entitiesFromSourceLinks(text, post.entities || []);

  post.translations ||= {};
  post.translations.en = {
    text,
    entities,
    status,
    translatedAt: now,
    model,
  };
  postCount += 1;
}

for (const translation of normalizeItems(translations.photos)) {
  const id = String(translation.id || "");
  const photo = photosById.get(id);
  if (!photo) throw new Error(`Unknown photo id: ${id}`);

  const caption = cleanOptionalText(translation.caption);
  const alt = cleanOptionalText(translation.alt) || caption;
  const locationLabel = cleanOptionalText(translation.locationLabel);

  if (!caption && !alt && !locationLabel) {
    throw new Error(`Empty photo translation for ${id}`);
  }

  photo.translations ||= {};
  photo.translations.en = {
    caption,
    alt,
    locationLabel,
    status,
    translatedAt: now,
    model,
  };
  photoCount += 1;
}

postsDb.translationUpdatedAt = now;
photosDb.translationUpdatedAt = now;
writeJson(postsPath, postsDb);
writeJson(photosPath, photosDb);
console.log(`Applied ${postCount} post translation(s), ${photoCount} photo translation(s)`);

function normalizeItems(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return Object.entries(value).map(([id, translation]) => ({ id, ...translation }));
}

function entitiesFromSourceLinks(text, sourceEntities) {
  const links = sourceEntities
    .filter((entity) => entity.type === "text_link" && entity.href && entity.text)
    .map((entity) => ({ type: "text_link", text: String(entity.text), href: String(entity.href) }));

  if (!links.length) {
    return [{ type: "plain", text, href: null }];
  }

  const chunks = [];
  let cursor = 0;

  while (cursor < text.length) {
    const next = findNextLink(text, links, cursor);
    if (!next) break;

    if (next.index > cursor) {
      chunks.push({ type: "plain", text: text.slice(cursor, next.index), href: null });
    }

    chunks.push({ type: "text_link", text: next.link.text, href: next.link.href });
    cursor = next.index + next.link.text.length;
  }

  if (cursor < text.length) {
    chunks.push({ type: "plain", text: text.slice(cursor), href: null });
  }

  const entities = chunks.length ? chunks : [{ type: "plain", text, href: null }];
  return validateEntities(entities, text, "auto-linked translation");
}

function findNextLink(text, links, cursor) {
  let match = null;

  for (const link of links) {
    const index = text.indexOf(link.text, cursor);
    if (index < 0) continue;
    if (!match || index < match.index || (index === match.index && link.text.length > match.link.text.length)) {
      match = { index, link };
    }
  }

  return match;
}

function validateEntities(entities, text, label) {
  const normalized = entities.map((entity) => ({
    type: entity.type === "text_link" ? "text_link" : "plain",
    text: String(entity.text || ""),
    href: entity.type === "text_link" ? String(entity.href || "") : null,
  }));
  const joined = normalized.map((entity) => entity.text).join("");

  if (joined !== text) {
    throw new Error(`Entities do not match translated text for ${label}`);
  }

  return normalized;
}

function cleanRequiredText(value, label) {
  const text = cleanOptionalText(value);
  if (!text) throw new Error(`Empty translation for ${label}`);
  return text;
}

function cleanOptionalText(value) {
  return value == null ? "" : String(value).replace(/[ \t]+\n/g, "\n").trim();
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    if (fallback !== undefined) return fallback;
    throw error;
  }
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(values) {
  const result = { _: [] };

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) {
      result._.push(value);
      continue;
    }

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
