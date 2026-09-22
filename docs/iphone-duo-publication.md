# iPhone Duo: anatomy of motion

`/research/iphone-duo/` opens the live scene immediately. `/research/iphone-duo/viewer/` is a compatible entry point with the same UI and canonical URL. Both documents use a same-origin base URL for existing model resources. Fallback texture URLs resolve against `document.baseURI`.

Active UI: `viewer/experience-v2.js` and `viewer/experience-v2.css`. The previous `app.js` stays available for old cached documents. Three.js 0.165.0 and add-ons are same-origin under `vendor/`, with their MIT license. No CSP changes, inline executable scripts or iframe are required.

A single continuous control panel exposes folding, assembly, materials, wallpaper layers, projection/blur, shader inputs, camera and render diagnostics. These controls compose without chapter-triggered scene resets. The visual system uses the site's gray background, white panels, Lora headings and IBM Plex Mono controls. All controls and credits are expanded; no tabs or disclosures conceal instruments. Mobile keeps the stage above a scrollable control panel.

Layer inspection separates the two screen surfaces, nonmetal surfaces and metallic surfaces. Groups move at staggered thresholds along the inspection normal, using inverse parent transforms to preserve world-space spacing. This is an illustrative decomposition of render objects, not a claim about manufacturing or repair order. Original radial explosion remains selectable. Both layouts restore exact base positions. A separate critically damped spring controls assembly progress, and an interruptible camera handoff frames the fully separated model. Reduced motion snaps assembly progress.

Validation: source-level transform test covers rotated/scaled parents, delayed layer movement and 20 exact reassembly cycles in both layouts. Desktop/mobile browser checks cover direct startup, combined fold/disassembly/material changes, layered/radial views, wireframe, reflections and reset. The source project's assembly.html mirrors this experience with a local import map.

For updates, version changed cacheable modules/styles, run site/secrets/syntax/diff checks, commit only intended files, deploy through tools/deploy-site.sh and verify public bytes plus a fresh browser load. Generated posts/photos files refreshed by the deploy script are independent of this UI change.

Asset provenance remains in viewer/provenance.json and viewer/reference/PROVENANCE.json. Apple source geometry/textures are unchanged. Free-camera inspection uses `inspection-controls.js`: screen-relative rotation around current model bounds, no residual inertia, explicit pan mode or Shift/right drag, wheel/pinch zoom, and two-touch pan/zoom. Taking over preserves the authored camera orientation and stops automatic motion. Rotation transforms both the camera and optical target, preserving the pivot’s screen position; no world-axis pole or camera-up snap is introduced. The stage toolbar exposes pan/rotate, zoom and fit-to-model recovery. Public entry points version the changed JS/CSS URLs. Mathematical regression checks and desktop/mobile browser checks cover takeover, orbit, pan, zoom bounds, pointer cancellation and recovery; physical multitouch hardware was not available for testing.

## Commentary sources, 22 September 2026

The author’s X thread was read in the browser, including expanded posts 3, 4, 8 and 10 and the concluding post 12. Russian panel notes are short paraphrases with direct links, not reproduced posts. Source observations about Apple's scene remain distinct from the reconstruction's own disassembly tool. CAD artist cleanup and the canonical-view explanation are attributed as the author’s interpretation.

- [3: CAD geometry and modeled logo](https://x.com/hybridherbst/status/2098814241272664344) → disassembly.
- [4: animated environment cards](https://x.com/hybridherbst/status/2098814245416669230), [6: flash material maps](https://x.com/hybridherbst/status/2098814252710494343), [7: lens reflection geometry](https://x.com/hybridherbst/status/2098814256372154702) → materials and lighting.
- [8: projected, blurred wallpaper](https://x.com/hybridherbst/status/2098814259874374108) → projection controls.
- [9: shared skeleton](https://x.com/hybridherbst/status/2098814263884214417) → folding and skeleton.
- [10: render textures and fades](https://x.com/hybridherbst/status/2098814266828583063) → raw render target.
- [11: wallpaper layers and 3D terrain](https://x.com/hybridherbst/status/2098814270758613063) → individual layer visibility.

The main-model reconstruction has 62 render objects; the author's approximate mesh count is not substituted for the measured local count. GPU compression formats in the original scene are not claimed for this reconstruction's decoded textures.
