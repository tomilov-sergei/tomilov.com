#!/usr/bin/env node

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const defaultExportDir = "/Users/tomilov/Downloads/Telegram Desktop/ChatExport_2026-05-25";
const exportDir = path.resolve(process.argv[2] || defaultExportDir);
const sourceJson = path.join(exportDir, "result.json");
const mediaDir = path.join(rootDir, "assets", "telegram");
const outputJson = path.join(mediaDir, "posts.json");
const channelUsername = "screenshot_of_the_day";

if (!existsSync(sourceJson)) {
  throw new Error(`Telegram export was not found: ${sourceJson}`);
}

mkdirSync(mediaDir, { recursive: true });

const exportData = JSON.parse(readFileSync(sourceJson, "utf8"));
const messages = exportData.messages.filter((message) => message.type === "message");
const posts = [];
const copied = new Set();
const missing = [];

for (const message of messages) {
  const media = getMedia(message);
  const hasText = getPlainText(message).trim().length > 0;

  if (!media.length && !hasText) {
    continue;
  }

  const previous = posts.at(-1);
  const shouldAppend =
    previous &&
    media.length > 0 &&
    !hasText &&
    Math.abs(Number(message.date_unixtime) - Number(previous.dateUnixtime)) <= 3;

  if (shouldAppend) {
    previous.media.push(...media);
    previous.messageIds.push(message.id);
    continue;
  }

  posts.push({
    id: String(message.id),
    messageIds: [message.id],
    telegramUrl: `https://t.me/${channelUsername}/${message.id}`,
    date: message.date,
    dateUnixtime: Number(message.date_unixtime),
    edited: message.edited || null,
    text: getPlainText(message),
    entities: normalizeEntities(message.text_entities || []),
    media,
    reactions: (message.reactions || [])
      .filter((reaction) => reaction.emoji)
      .map((reaction) => ({
        emoji: reaction.emoji,
        count: reaction.count || 0,
      })),
  });
}

posts.sort((a, b) => b.dateUnixtime - a.dateUnixtime);

writeFileSync(
  outputJson,
  `${JSON.stringify(
    {
      source: exportData.name,
      channelUsername,
      importedAt: new Date().toISOString(),
      posts,
      missing,
    },
    null,
    2,
  )}\n`,
);

console.log(`Imported ${posts.length} posts`);
console.log(`Copied ${copied.size} media files`);
console.log(`Missing ${missing.length} media files`);
console.log(outputJson);

function getMedia(message) {
  const media = [];

  if (message.photo) {
    const asset = copyAsset(message.photo);
    if (asset) {
      media.push({
        type: "photo",
        src: asset,
        width: message.width || null,
        height: message.height || null,
        size: message.photo_file_size || null,
      });
    }
  }

  if (message.file && !String(message.file).startsWith("(File not included")) {
    const asset = copyAsset(message.file);
    const thumbnail = message.thumbnail && !String(message.thumbnail).startsWith("(File not included")
      ? copyAsset(message.thumbnail)
      : null;

    if (asset) {
      media.push({
        type: getMediaType(message),
        src: asset,
        poster: thumbnail,
        width: message.width || null,
        height: message.height || null,
        size: message.file_size || null,
        mimeType: message.mime_type || "",
        duration: message.duration_seconds || null,
        name: message.file_name || path.basename(message.file),
      });
    }
  }

  return media;
}

function copyAsset(relativePath) {
  const source = path.join(exportDir, relativePath);

  if (!existsSync(source)) {
    missing.push(relativePath);
    return null;
  }

  const destination = path.join(mediaDir, relativePath);
  mkdirSync(path.dirname(destination), { recursive: true });

  if (!existsSync(destination) && !copied.has(relativePath)) {
    copyFileSync(source, destination);
    copied.add(relativePath);
  }

  return `/assets/telegram/${encodePath(relativePath)}`;
}

function getMediaType(message) {
  if (message.media_type === "animation") return "animation";
  if (message.media_type === "sticker") return "sticker";
  if ((message.mime_type || "").startsWith("video/")) return "video";
  if ((message.mime_type || "").startsWith("image/")) return "photo";
  return "file";
}

function getPlainText(message) {
  if (typeof message.text === "string") return message.text;
  if (Array.isArray(message.text)) {
    return message.text.map((item) => (typeof item === "string" ? item : item.text || "")).join("");
  }
  return "";
}

function normalizeEntities(entities) {
  return entities
    .filter((entity) => entity.text)
    .map((entity) => ({
      type: entity.type,
      text: entity.text,
      href: entity.href || null,
    }));
}

function encodePath(relativePath) {
  return relativePath
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}
