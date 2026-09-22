# iPhone Duo: anatomy of motion

`/research/iphone-duo/` opens the live scene immediately. `/research/iphone-duo/viewer/` is a compatible entry point with the same UI and canonical URL. Both documents use a same-origin base URL for existing model resources. Fallback texture URLs resolve against `document.baseURI`.

Active UI: `viewer/experience-v2.js` and `viewer/experience-v2.css`. The previous `app.js` stays available for old cached documents. Three.js 0.165.0 and add-ons are same-origin under `vendor/`, with their MIT license. No CSP changes, inline executable scripts or iframe are required.

Three guided controls replace the previous article: fold physics and changing wallpaper; assembly inspection; reflections, wireframe and contact shadows. The visual system uses the site's gray background, white panels, Lora headings and IBM Plex Mono controls. All advanced controls remain in the Laboratory disclosure. Mobile keeps the stage above a scrollable control panel.

Layer inspection separates the two screen surfaces, nonmetal surfaces and metallic surfaces. Groups move at staggered thresholds along the inspection normal, using inverse parent transforms to preserve world-space spacing. This is an illustrative decomposition of render objects, not a claim about manufacturing or repair order. Original radial explosion remains selectable. Both layouts restore exact base positions. A separate critically damped spring controls assembly progress, and an interruptible camera handoff frames the fully separated model. Reduced motion snaps assembly progress.

Validation: source-level transform test covers rotated/scaled parents, delayed layer movement and 20 exact reassembly cycles in both layouts. Desktop/mobile browser checks cover direct startup, chapter switching, layered/radial views, wireframe, reflections and reset. The source project's assembly.html mirrors this experience with a local import map.

For updates, version changed cacheable modules/styles, run site/secrets/syntax/diff checks, commit only intended files, deploy through tools/deploy-site.sh and verify public bytes plus a fresh browser load. Generated posts/photos files refreshed by the deploy script are independent of this UI change.

Asset provenance remains in viewer/provenance.json and viewer/reference/PROVENANCE.json. Apple source geometry/textures are unchanged. Free-camera behavior remains an adaptation using OrbitControls.
