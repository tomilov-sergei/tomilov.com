#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
loadDotEnv(path.join(rootDir, ".env.local"));
loadDotEnv(path.join(rootDir, ".env"));

const postsPath = path.join(rootDir, "assets", "telegram", "posts.json");
const photosPath = path.join(rootDir, "assets", "photos", "photos.json");
const args = parseArgs(process.argv.slice(2));
const model = process.env.OPENAI_TRANSLATION_MODEL || "gpt-5-mini";
const apiKey = process.env.OPENAI_API_KEY || "";
const limit = Number(args.limit || 20);
const retries = Number(args.retries || 3);
const status = args.status || "draft";
const dryRun = Boolean(args["dry-run"]);
const force = Boolean(args.force);

if (!dryRun && !apiKey) {
  throw new Error("OPENAI_API_KEY is required unless --dry-run is used");
}

const postsDb = readJson(postsPath, { posts: [] });
const photosDb = readJson(photosPath, { photos: [] });
const queue = [
  ...collectPosts(postsDb.posts || []),
  ...collectPhotos(photosDb.photos || []),
].slice(0, limit);

if (!queue.length) {
  console.log("No missing English translations");
  process.exit(0);
}

console.log(`Translating ${queue.length} item(s) with ${model}`);

for (const item of queue) {
  if (dryRun) {
    console.log(`[dry-run] ${item.kind} ${item.id}`);
    continue;
  }

  const translation = await translateItem(item);
  applyTranslation(item, translation);
  postsDb.translationUpdatedAt = new Date().toISOString();
  photosDb.translationUpdatedAt = new Date().toISOString();
  writeJson(postsPath, postsDb);
  writeJson(photosPath, photosDb);
  console.log(`translated ${item.kind} ${item.id}`);
}

function collectPosts(posts) {
  return posts
    .filter((post) => normalizeText(post.text))
    .filter((post) => force || !normalizeText(post.translations?.en?.text))
    .map((post) => ({
      kind: "post",
      id: String(post.id),
      source: post,
      payload: {
        text: post.text,
        entities: post.entities || [],
      },
    }));
}

function collectPhotos(photos) {
  return photos
    .filter((photo) => normalizeText(photo.caption) || normalizeText(photo.alt) || normalizeLocation(photo))
    .filter((photo) => force || !hasPhotoTranslation(photo))
    .map((photo) => ({
      kind: "photo",
      id: String(photo.id),
      source: photo,
      payload: {
        caption: photo.caption || "",
        alt: photo.alt || "",
        locationLabel: normalizeLocation(photo),
      },
    }));
}

async function translateItem(item) {
  let lastError;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await translateItemOnce(item);
    } catch (error) {
      lastError = error;
      if (attempt >= retries || !shouldRetry(error)) {
        throw error;
      }

      const delayMs = retryDelayMs(error, attempt);
      console.warn(`retrying ${item.kind} ${item.id} after ${delayMs}ms (${error.message})`);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

async function translateItemOnce(item) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text: [
                "You translate Seryozha Tomilov's personal Russian website into natural English.",
                "Preserve the author's concise, observant, lightly ironic voice.",
                "Do not over-explain. Do not add facts. Preserve emoji, line breaks, product names, URLs, and proper nouns.",
                "For posts, return a text field and an entities array whose concatenated text exactly equals text.",
                "Use text_link entities only when preserving source links; otherwise use plain entities.",
                "Return only JSON that matches the requested shape.",
              ].join(" "),
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: JSON.stringify({ kind: item.kind, id: item.id, source: item.payload }),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "english_translation",
          strict: true,
          schema: schemaFor(item.kind),
        },
      },
    }),
  });

  if (!response.ok) {
    const error = new Error(`OpenAI API ${response.status}: ${await response.text()}`);
    error.status = response.status;
    error.retryAfter = response.headers.get("retry-after");
    throw error;
  }

  const data = await response.json();
  const output = data.output_text || extractOutputText(data);
  const translation = JSON.parse(output);
  validateTranslation(item, translation);
  return translation;
}

function applyTranslation(item, translation) {
  item.source.translations ||= {};
  item.source.translations.en ||= {};

  if (item.kind === "post") {
    item.source.translations.en.text = translation.text;
    item.source.translations.en.entities = translation.entities;
  } else {
    item.source.translations.en.caption = translation.caption || "";
    item.source.translations.en.alt = translation.alt || translation.caption || "";
    item.source.translations.en.locationLabel = translation.locationLabel || "";
  }

  item.source.translations.en.status = status;
  item.source.translations.en.translatedAt = new Date().toISOString();
  item.source.translations.en.model = model;
}

function validateTranslation(item, translation) {
  if (item.kind === "post") {
    if (!normalizeText(translation.text)) {
      throw new Error(`Empty post translation for ${item.id}`);
    }

    if (!Array.isArray(translation.entities)) {
      translation.entities = [{ type: "plain", text: translation.text, href: null }];
    }

    const joined = translation.entities.map((entity) => entity.text || "").join("");
    if (joined !== translation.text) {
      translation.entities = [{ type: "plain", text: translation.text, href: null }];
    }
  }
}

function schemaFor(kind) {
  if (kind === "post") {
    return {
      type: "object",
      additionalProperties: false,
      properties: {
        text: { type: "string" },
        entities: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              type: { type: "string", enum: ["plain", "text_link"] },
              text: { type: "string" },
              href: { type: ["string", "null"] },
            },
            required: ["type", "text", "href"],
          },
        },
      },
      required: ["text", "entities"],
    };
  }

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      caption: { type: "string" },
      alt: { type: "string" },
      locationLabel: { type: "string" },
    },
    required: ["caption", "alt", "locationLabel"],
  };
}

function extractOutputText(data) {
  return (data.output || [])
    .flatMap((item) => item.content || [])
    .map((content) => content.text || "")
    .join("")
    .trim();
}

function hasPhotoTranslation(photo) {
  const translation = photo.translations?.en || {};
  return normalizeText(translation.caption) || normalizeText(translation.alt) || normalizeText(translation.locationLabel);
}

function normalizeLocation(photo) {
  const location = photo.location || {};
  return normalizeText(location.label || location.name);
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

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function shouldRetry(error) {
  const statusCode = Number(error?.status || 0);
  return statusCode === 408 || statusCode === 409 || statusCode === 429 || statusCode >= 500;
}

function retryDelayMs(error, attempt) {
  const retryAfter = Number(error?.retryAfter || 0);
  if (retryAfter > 0) return retryAfter * 1000;
  return Math.min(30000, 1000 * 2 ** (attempt - 1));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;

  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] != null) continue;

    process.env[key] = unquoteEnvValue(rawValue.trim());
  }
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
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
