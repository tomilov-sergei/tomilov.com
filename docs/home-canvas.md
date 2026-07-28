# Home Canvas

## Product intent

Главная страница должна заменить Miro embed на собственный canvas: карту того, что у автора в голове.

В центре полотна находится аватар автора. От него расходятся тематические направления, а вдоль них лежат карточки-мысли: превью, изображения, цитаты, ссылки и фрагменты текстов из блога и фотоленты. Canvas не должен выглядеть как хронологическая лента или сетка карточек. Это скорее рабочая доска, где видны интересы, повторяющиеся темы и расстояние во времени.

## Content model

Внутренние источники генерации:

- `assets/telegram/posts.json` для постов Screenshot of the Day;
- `assets/photos/photos.json` для личной фотоленты.

Полные манифесты используются только генераторами. Домашняя страница не загружает их в браузер: `tools/generate_home_canvas.py` записывает в `index.html` и `en/index.html` статические ссылки-оболочки для каждого поста и фото.

Каждая карточка должна вести на постоянную HTML-страницу:

- `/screenshots/<id>/` для постов;
- `/photos/<id>/` для фото.

Новые посты и фото должны появляться ближе к центру при следующей загрузке страницы, потому что позиция вычисляется из даты. Сохранение пользовательских перемещений не нужно.

## Themes

Первый набор направлений основан на текущем корпусе постов и продуктовой рамке сайта:

- `design` / `Дизайн`: интерфейсы, визуальные решения, типографика, Figma, UI/UX.
- `products` / `Продукты`: приложения, платформы, фичи, запуски, рекомендации.
- `brands` / `Бренды`: Apple, Ferrari, Teenage Engineering, Claude, визуальные системы и объекты.
- `games` / `Игры`: игры, игровые интерфейсы, игровые миры и механики.
- `ai` / `AI`: Codex, GPT, Claude, генеративные интерфейсы и агенты.
- `photos` / `Фото`: фотография, камеры, красивые съемки и визуальные находки из блога.
- `myphotos` / `Мои фото`: личные снимки из фотоленты.

Пост может матчиться с несколькими темами, но в v1 выбирается первая наиболее сильная. Если тема не определяется, пост попадает в `products`, потому что это самая широкая продуктовая рамка коллекции.

## Layout rules

Canvas не бесконечный физически, но его размер вычисляется из количества материалов и должен ощущаться большим:

- внутренняя плоскость расширяется вместе с самым длинным тематическим лучом;
- центр находится в середине плоскости;
- у каждой темы есть угол, цвет и мягкая кривая от центра;
- карточки расходятся от центра по тематическим лучам, а не собираются в плотные острова;
- возраст материала и порядок внутри темы управляют расстоянием от центра: новое ближе, старое дальше;
- широкий детерминированный lane-сдвиг дает воздуху между соседними карточками без механической сетки;
- карточки могут немного накладываться друг на друга, но не должны превращаться в плотные стопки;
- дальние карточки могут уходить далеко за первый видимый экран canvas;
- каждый материал присутствует на полотне лёгкой HTML-оболочкой, без тематических лимитов;
- содержимое оболочки и изображения активируются только рядом с текущим viewport;
- на далёком масштабе карточки остаются placeholders, чтобы обзор всего полотна не запускал загрузку всех изображений;
- часть текстов показывается без явной карточки, прямо на фоне;
- изображения могут собираться в небольшие стопки.

Default viewport должен открываться около центра, чтобы аватар и свежие карточки сразу были видны.

## Interaction

Минимальная интерактивность v1:

- панорамирование полотна мышью, трекпадом или touch;
- zoom in/out/reset через маленький toolbar;
- wheel/trackpad для перемещения, с `meta`/`ctrl` для zoom;
- карточки можно слегка перетаскивать в текущей сессии;
- клики по карточкам открывают пост или фото в окне поверх canvas, не уводя пользователя с главной;
- окно поста должно визуально лежать поверх холста: верхняя грань немного выступает над верхней границей canvas-shell;
- постоянная страница остается доступной из окна поста;
- drag не сохраняется и сбрасывается при перезагрузке.

Accessibility fallback:

- в DOM есть короткое описание canvas;
- все карточки остаются ссылками;
- при отключенном JavaScript можно оставить ссылку на блог и фото внутри canvas-shell.

## Visual direction

Светлая тема:

- canvas background: true white;
- page background: текущий серый фон сайта;
- grid: очень тонкие серые линии;
- text: черный и приглушенный серый;
- path colors: сдержанные разные акценты, без доминирования одного оттенка.

Темная тема:

- page background остается темным серым из текущей системы;
- canvas background: темный нейтральный серый, не синий и не фиолетовый;
- grid и карточки приглушены, но изображения остаются читаемыми.

Типографика продолжает текущую систему сайта:

- Manrope для бренда и крупных UI-акцентов;
- IBM Plex Mono для навигации, меток, дат и мыслей;
- Lora можно использовать точечно для крупных текстовых карточек.

## Implementation scope v1

V1 остается в существующем стеке проекта:

- статический HTML;
- общий `styles.css`;
- маленький route-aware bootstrap в `script.js` и vanilla JavaScript runtime в `assets/js/features.js`;
- без React, build step, canvas bitmap renderer или сторонней библиотеки.

DOM-элементы предпочтительнее настоящего `<canvas>`, потому что карточки остаются ссылками, изображения лениво грузятся, текст индексируем и проще поддерживать адаптив.

## Current production rollout

Published and verified on 2026-07-16:

- production release: `20260716-093342`;
- production asset version: `20260716-home-canvas-static-1`;
- generated canvas: 711 permanent card shells from 663 Telegram posts and 48 photos on both `/` and `/en/`;
- initial production viewport: 48 hydrated cards and 69 requested card images;
- the home page makes no runtime request for `assets/telegram/posts.json` or `assets/photos/photos.json`;
- production `index.html`, `en/index.html`, `script.js`, and `styles.css` match the locally verified artifacts byte for byte.

Performance follow-up published and verified on 2026-07-16:

- production release: `20260716-120054`;
- production asset version: `20260716-canvas-performance-1`;
- first contentful paint measured at 0.43 s, with document load complete at 0.86 s;
- the initial eight card images total 1.30 MB, compared with 35.5 MB for seven photo originals alone before preview generation;
- production contains all 48 photo previews (3.5 MB total), and the first tested preview is 87 KB instead of its 6.98 MB original;

Implementation:

- the initial viewport hydrates at most 16 cards and starts at most 8 card-image requests;
- viewport overscan is limited to 30% of the current world-space viewport;
- multi-image stacks load one image initially and fill the remaining layers on hover or keyboard focus;
- personal photos use generated 960 px canvas previews with an original-file fallback;
- preview generation runs during full deploys, photo-only refreshes and new photo uploads without modifying the originals.
- every generated card link carries `data-canvas-card="<chunk>|<content-key>"`; the interaction runtime uses that same attribute for click, drag and touch handling;
- card bodies live in localized thematic JSON chunks under `assets/canvas/` and are fetched only for nearby placeholders;
- `tools/check-site.py` verifies that every generated card has the interaction attribute and rejects references to the retired `data-home-node` contract.
- because JavaScript is cached as `immutable`, the home-page `script.js?v=...` and bootstrap `assetVersion` must change together; the site check rejects a mismatch.
- initial media activation waits for asynchronous chunk hydration to finish, then assigns `src` to at most eight nearby images without requiring pan or hover.

## Historical implementation snapshot

Baseline before smooth zoom animation work:

- production commit: `61c2a2b9`;
- production asset version: `20260618-home-canvas-8`;
- GitHub backup branch: `backup/canvas-zoom60-v8`;
- GitHub stable tag: `canvas-zoom60-v8-stable`;
- deploy release verified before backup: `20260618-112940`.

The current implementation is deliberately static and DOM-based:

- `tools/generate_home_canvas.py` reads `assets/telegram/posts.json` plus `assets/photos/photos.json`, classifies every item, computes deterministic coordinates and rewrites the generated sections of `index.html` and `en/index.html`;
- `index.html` and `en/index.html` contain `.home-canvas-shell`, `.home-canvas-viewport`, `.home-canvas-surface`, all permanent card links and the toolbar;
- `script.js` loads `assets/js/features.js`, which initializes paths and controls, hydrates nearby card bodies from `assets/canvas/` and assigns image `src` only near the visible world rectangle;
- `styles.css` owns the grid, card styling, toolbar, post overlay and responsive rules;
- generated post/photo pages also carry the same asset version so overlay-opened articles get the same CSS and JS cache state.

The generator is called by both `tools/generate_telegram_seo.py` and `tools/generate_photo_seo.py`. Therefore a Telegram webhook, a personal photo upload and a full deployment all refresh the static home canvas. New items enter the inner ring of their theme; older items retain monotonically non-decreasing distance from the avatar.

Canvas v1 viewport behavior (superseded by Canvas 2.0 below):

- desktop default scale is `0.6`;
- narrow mobile viewports below `560px` start at `0.25`;
- reset recenters on the avatar using the current viewport dimensions;
- toolbar zoom currently changes scale in discrete button steps around the viewport center;
- wheel/trackpad pan updates position immediately;
- `meta`/`ctrl` + wheel zooms around the pointer;
- the toolbar label shows `Math.round(scale * 100)%`.

Canvas v1 toolbar animation added after the baseline:

- toolbar `+` and `-` animate the same centered zoom target over `280ms`;
- animation interpolates only `x`, `y` and `scale` on `.home-canvas-surface`;
- wheel zoom, wheel pan, pointer pan, card drag and resize cancel an in-flight animation;
- `prefers-reduced-motion: reduce` skips the interpolation and applies the final view immediately.

## Canvas 2.0 interaction model

Canvas 2.0 keeps the existing DOM content model and replaces the viewport controls with a Figma-like interaction layer:

- trackpad and mouse-wheel pan remain native-feeling and are batched into one visual update per animation frame;
- pinch gestures and `Control` / `Command` + wheel use continuous exponential zoom instead of fixed 10% jumps;
- every zoom keeps the world point under the cursor or gesture center stationary;
- the usable zoom range is `12%` to `250%`;
- two-pointer pinch-to-zoom works on touch devices, while one-finger dragging pans even when it starts over a card;
- middle-mouse drag and `Space` + drag pan from any point, including over a card;
- `+`, `-`, and `0` provide keyboard zoom and recentering when the canvas has focus;
- toolbar zoom and reset use a short ease-out animation and respect `prefers-reduced-motion`;
- resizing the viewport preserves the same world point at the center instead of resetting the canvas;
- card dragging changes compositor transforms rather than layout coordinates;
- a pan or pinch suppresses the following accidental card click.
- dragging suppresses only the synthetic click immediately following pointer-up; the next intentional click opens the card normally.

The surface is still one GPU-composited DOM layer. Viewport movement writes one `transform` per rendered frame, the large surface uses CSS containment, and placeholders outside the detail threshold do not instantiate their card content or request media.

Current visual style:

- card-like canvas objects keep `box-shadow: var(--canvas-shadow)`;
- media frames, media-stack images, link previews and text card copies do not have the previous 1px gray card border;
- avatar badge and zoom toolbar still use borders as UI chrome, not as canvas card styling.

Current overlay behavior:

- clicking a card prevents normal navigation and opens a post/photo overlay above the canvas;
- modifier-click keeps normal browser behavior;
- the overlay fetches the permanent HTML page and imports `.screenshot-post` or `.photo-detail`;
- the overlay top edge protrudes above the canvas shell to preserve the "over the board" feeling;
- close works through the close button, scrim and `Escape`;
- the permanent page link remains available in the overlay bar.

Rollback if smooth zoom hurts performance:

```sh
git switch main
git reset --hard canvas-zoom60-v8-stable
git push --force-with-lease origin main
PATH=/Users/tomilov/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin:$PATH ./tools/deploy-site.sh
```

For a non-destructive inspection instead of rollback:

```sh
git switch backup/canvas-zoom60-v8
```

## Later ideas

- тематические страницы или фильтры по лучам;
- ручные editorial overrides для самых важных постов;
- поиск по canvas;
- related posts из соседних карточек;
- отдельные мини-кластеры для серий;
- генерация легких thumbnail derivatives для очень тяжелых медиа.
