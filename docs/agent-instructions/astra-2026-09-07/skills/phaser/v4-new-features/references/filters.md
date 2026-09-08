## Filters System (Replacing FX and BitmapMask)

> Full reference: [Filter API](filters-api.md)

Filters unify the v3 FX and Mask systems. Every filter takes an input image and produces an output image via a shader pass. Filters can be applied to any game object or camera -- v3 had restrictions on which objects supported FX.

```js
// v3 approach (FX):
sprite.preFX.addGlow(0xff00ff, 4);
sprite.postFX.addBlur(0, 2, 2, 1);

// v4 approach (Filters):
sprite.enableFilters();
sprite.filters.internal.addGlow(0xff00ff, 4, 0, 1);
sprite.filters.external.addBlur(0, 2, 2, 1);

// v3 approach (BitmapMask):
const mask = new Phaser.Display.Masks.BitmapMask(scene, maskImage);
sprite.setMask(mask);

// v4 approach (FilterMask):
sprite.enableFilters();
sprite.filters.internal.addMask(maskImage);
```

**Internal vs External**: Internal filters run before the camera transform (object-local space, cheaper). External filters run after (screen space, full-resolution).

---
