# Plotly 3.7.0 disposal correction (Task38 Q1)

The application uses upstream `plotly.js-gl3d-dist-min` **3.7.0** plus the explicit local correction `open-ena-plotly-disposal-v1`. The version alone does not describe the executed bytes. The original package-lock registry URL and integrity are retained. This is a resource-disposal correction, not a jENA/numerical change, dependency upgrade or claim of unmodified upstream rendering bytes.

Task38 independent QUALITY established that ordinary orthographic/perspective transitions leave stopped canvases/contexts alive; five round trips across three plots grew9 attached canvases to39 while only3 were current. The app's per-root owner now serializes Plotly operations, captures actual scene ownership before/after each operation and retires only replaced stopped contexts. Unmount waits for accepted rendering/image operations, purges once, and reports failures. The vendor's intentionally shared static export context is outside this interactive-root ownership and is never indiscriminately lost.

A further actual same-PNG check found13 additional native-live textures and one buffer per image on the reused static export context. On 2026-09-07 the task controller explicitly amended the local Q1 repair scope to permit only these two proven per-instance disposal corrections. The previous no-Plotly-byte-change rule remains applicable to unrelated vendor code. Task39 and subsequent reviewers must account for the correction below when comparing served artifacts.

## Exact correction and ownership

The tracked JSON at `scripts/patches/plotly-gl3d-3.7.0-disposal.json` carries exact substitutions and complete digests:

- `gl-line3d` (embedded module5714) constructs its own dash texture and own pick-shader wrapper but its dispose omitted both. It now disposes them alongside the existing shader/VAO/buffer. The texture factory creates a separate native handle for each instance; it is not a shared texture atlas.
- `gl-axes3d` background (embedded module5304) creates vertex and index buffer wrappers, but retained/disposed only the vertex buffer. It now retains the index wrapper and disposes it after its VAO. Native VAO disposal deletes the VAO, not its referenced index buffer. No drawing, geometry or shader-source statements change.

Shader ownership follows the existing shader-wrapper dispose, not an unconditional native delete. Embedded module9405 holds `_vref`/`_fref` for each wrapper; module5091 increments those shared-cache reference counts when a new wrapper is created and deletes shader/program resources only when the count reaches zero. Disposing the line's own pick wrapper releases its references while preserving any other live wrapper's references. No global shader cache, prototype, Plotly public method or package runtime export is replaced.

The original MIT distribution header and package LICENSE remain byte-identical. Original distribution SHA256:
`fa6ebaf365ea5ad46a9843ea98fb2635c998558b9d876578aa12f765f823cc3d`.
Applied distribution SHA256:
`cc2f875652ac1fca82bd7e42594bcf309efc2e37019a9f5b542546e63576654c`.
Upstream tarball integrity:
`sha512-44QPf8B49X/AkSyfSJValsOAUNTjXXKmRwwBhFiKN9fNQIAjQ1BsS1FILpXExD/vUpCcCseRaFVVrx1UR2ckxw==`.

## Installation/build and verification

`npm install`/`npm ci` run the tracked postinstall script. `npm run build:app` (also reached by `npm run build`/`verify`) and `npm run dev` run the same deterministic guard before Next. If lifecycle scripts were deliberately disabled during installation, these build/dev guards still apply the exact known-original correction. `npm run verify:plotly-disposal` is read-only and rejects an unpatched install. Directly invoking a Next executable bypasses the supported npm build workflow and is not an accepted release/build receipt.

The script accepts exactly the original digest or the known-patched digest; every replacement must occur once, and the final digest is checked. Unknown, partial, appended or differently packaged bytes fail closed without overwrite. It also checks exact package metadata/license hashes, upstream lock version/resolved/integrity/license and that the installed package is inside this checkout's node_modules. Already-patched content is idempotent. No general patch utility dependency or silently mutable node_modules-only fix is used.

Owned served-browser receipts record `plotlyDependency` and a separate `plotly-dependency.json`, then recheck it during cleanup. This applied digest is separate from the immutable jENA vendor contract and from the actual compiled/served asset hashes. Source custody includes the tracked patch, guard, hook definitions and this document.

Focused tests cover exact-original→exact-patched bytes, idempotence, metadata/integrity/unknown-content refusal and fresh temporary installation. Passive browser tests use WeakRefs and native isBuffer/isTexture/isProgram/isShader checks, never force context loss in instrumentation. They cover repeated real projection cycles, same-projection updates, PNG success/rejection/success and cross-root use, actual image dimensions/content, teardown and current-scene safety. Resource counts are observable live handles, not driver GPU byte estimates. All original scientific, privacy, performance/cache, pointer and fullscreen gates remain required.

An isolated export iframe/realm was considered but would add a second renderer/chunk/font/CSP lifecycle and still require explicit context ownership and disposal. A replacement SVG/GL snapshot pipeline would require new fidelity validation. Neither is justified for these two exact upstream omissions. The original public Plotly.toImage rendering path remains in use.
