# iPhone Duo: anatomy of an object

`/research/iphone-duo/` opens the live scene immediately. `/research/iphone-duo/viewer/` is a compatible entry point with the same UI and canonical URL. Both documents use a same-origin base URL for existing model resources. Fallback texture URLs resolve against `document.baseURI`.

Active UI: `viewer/experience-v2.js` and `viewer/experience-v2.css`. The previous `app.js` stays available for old cached documents. Three.js 0.165.0 and add-ons are same-origin under `vendor/`, with their MIT license. No CSP changes, inline executable scripts or iframe are required.

A single continuous control panel exposes folding, assembly, materials, wallpaper layers, projection/blur, shader inputs, camera and render diagnostics. These controls compose without chapter-triggered scene resets. The visual system uses the site's gray background, white panels, Lora headings and IBM Plex Mono controls. All controls are expanded; no tabs or disclosures conceal instruments. The editorial credits block is removed pending author copy. Mobile keeps the stage above a scrollable control panel.

Layer inspection separates the two screen surfaces, nonmetal surfaces and metallic surfaces. Groups move at staggered thresholds along the inspection normal, using inverse parent transforms to preserve world-space spacing. This is an illustrative decomposition of render objects, not a claim about manufacturing or repair order. Original radial explosion remains selectable. Both layouts restore exact base positions. A separate critically damped spring controls assembly progress, and an interruptible camera handoff frames the fully separated model. Reduced motion snaps assembly progress.

Validation: source-level transform test covers rotated/scaled parents, delayed layer movement and 20 exact reassembly cycles in both layouts. Desktop/mobile browser checks cover direct startup, combined fold/disassembly/material changes, layered/radial views, wireframe, reflections and reset. The source project's assembly.html mirrors this experience with a local import map.

For updates, version changed cacheable modules/styles, run site/secrets/syntax/diff checks, commit only intended files, deploy through tools/deploy-site.sh and verify public bytes plus a fresh browser load. Generated posts/photos files refreshed by the deploy script are independent of this UI change.

Asset provenance remains in viewer/provenance.json and viewer/reference/PROVENANCE.json. Apple source geometry/textures are unchanged. Free-camera inspection uses `inspection-controls.js`: screen-relative rotation around current model bounds, no residual inertia, explicit pan mode or Shift/right drag, wheel/pinch zoom, and two-touch pan/zoom. Taking over preserves the authored camera orientation and stops automatic motion. Rotation transforms both the camera and optical target, preserving the pivot’s screen position; no world-axis pole or camera-up snap is introduced. The stage toolbar exposes pan/rotate, zoom and a labeled position reset; the panel retains separate fit-to-model and full reset actions. Public entry points version the changed JS/CSS URLs. Mathematical regression checks and desktop/mobile browser checks cover takeover, orbit, pan, zoom bounds, pointer cancellation and recovery; physical multitouch hardware was not available for testing.

## Commentary sources, 22 September 2026

The author’s X thread was read in the browser, including expanded posts 3, 4, 8 and 10 and the concluding post 12. The thread remains an editorial reference in this document. Panel notes have been expanded with source-code observations; per-note citations are removed from the UI at the author’s request. Source observations about Apple's scene remain distinct from the reconstruction's own disassembly tool. CAD artist cleanup and the canonical-view explanation are attributed as the author’s interpretation.

- [3: CAD geometry and modeled logo](https://x.com/hybridherbst/status/2098814241272664344) → disassembly.
- [4: animated environment cards](https://x.com/hybridherbst/status/2098814245416669230), [6: flash material maps](https://x.com/hybridherbst/status/2098814252710494343), [7: lens reflection geometry](https://x.com/hybridherbst/status/2098814256372154702) → materials and lighting.
- [8: projected, blurred wallpaper](https://x.com/hybridherbst/status/2098814259874374108) → projection controls.
- [9: shared skeleton](https://x.com/hybridherbst/status/2098814263884214417) → folding and skeleton.
- [10: render textures and fades](https://x.com/hybridherbst/status/2098814266828583063) → raw render target.
- [11: wallpaper layers and 3D terrain](https://x.com/hybridherbst/status/2098814270758613063) → individual layer visibility.

The main-model reconstruction has 62 render objects; the author's approximate mesh count is not substituted for the measured local count. GPU compression formats in the original scene are not claimed for this reconstruction's decoded textures.

## Object interface and visualization refinement

Heading: «Анатомия объекта». The subtitle reports 4.90 MB in decimal units: main_model.gltf (308,101 bytes), its binary buffer (3,890,544 bytes), and the 33 unique runtime image assets (702,843 bytes), accounting for the PNG fallbacks in reference/decoded/index.json. Total 4,901,488 bytes. This is the main model package, not total page transfer or GPU memory; wallpaper and environment resources are explicitly excluded. Its accessors contain 67,494 indexed triangles and its skin has 27 joints. Runtime: Three.js r165, WebGL 2 and GLSL; model format glTF.

Looping is now a checkbox preference under the play button, not a separate playback command. It does not start animation by itself, and pausing or grabbing the model does not clear it. A loop bounces between closed/open; disabling it completes toward open. Position reset preserves material, fold and assembly settings.

Visualization fixes: scalar texture debug views extract roughness G, metalness B and AO R instead of showing packed RGB; texture inspections bypass filmic tone mapping; live debug texture references track the current source material. Every mode explains its encoding and missing maps. Skeleton inspection renders above surfaces. The raw wallpaper preview remains accessible on both viewport sizes.

Validation: combined loop/start/pause, position-reset/material preservation, all three scalar debug shader compilations and animated AO, reset, desktop/mobile layout; browser console clean. Existing layer/skinning/control regressions pass. No pixel-identical fidelity claim is made.
