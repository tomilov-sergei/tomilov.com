# iPhone Duo research

Public article: `/research/iphone-duo/`. Interactive scene: `/research/iphone-duo/viewer/`.

The viewer is a static publication of the independent reconstruction. The article links to it rather than embedding it, so opening the research index/article does not allocate WebGL or download model resources. Mobile controls sit below the scene; advanced inspection controls are collapsed initially.

All runtime dependencies are same-origin. `app.js` is the extracted module from the source viewer; local `.mjs` modules use `.js` names for production MIME compatibility. Three.js 0.165.0 and reachable add-on modules are in `vendor/` with their MIT license. Bare module imports are rewritten to relative paths. The site CSP is unchanged: no external script CDN, inline executable script, import map or iframe is required.

Asset provenance is recorded in `viewer/provenance.json` and `viewer/reference/PROVENANCE.json`. Apple source extraction bundles, scratch files and the private local project documentation are not part of the published package. Shader whitespace is normalized; model and texture bytes are preserved.

For future updates, mirror source changes into the publication, preserve the relative-import mapping, bump URLs for changed cacheable scripts/assets, run `tools/check-site.py`, `tools/check-secrets.py`, JavaScript syntax checks and `git diff --check`. Verify a clean browser tab with the production CSP and mobile viewport before deploying. The standard deployment archives HEAD; commit publication files first. Verify public article, viewer, resource hashes, both research indexes and sitemap afterwards.

Known boundaries: OrbitControls still implements free camera movement, the handoff trajectory is adapted to the viewer, and source slider stretching is not reproduced. These limitations are stated in the article.
