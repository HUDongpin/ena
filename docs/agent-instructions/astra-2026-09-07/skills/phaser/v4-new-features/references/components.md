## New Components

> Full component reference: [Component API](components-api.md)

### Lighting Component

Replaces the v3 approach of assigning a lighting pipeline. WebGL only.

```js
// v3 approach:
sprite.setPipeline('Light2D');

// v4 approach:
sprite.setLighting(true);

// Self-shadowing (simulates surface shadows from texture brightness):
sprite.setSelfShadow(true, 0.5, 1/3);
// Args: enabled, penumbra (lower = sharper), diffuseFlatThreshold (0-1)

// Use game-wide default for self-shadow:
sprite.setSelfShadow(null);  // reads from config.render.selfShadow
```

**Supported on**: BitmapText, Blitter, Graphics, Shape, Image, Sprite, Particles, SpriteGPULayer, Stamp, Text, TileSprite, Video, TilemapLayer, TilemapGPULayer.

**Batching note**: Lighting changes the shader, which breaks batches. Group lit objects together and unlit objects together for best performance.

**Source**: `src/gameobjects/components/Lighting.js`

### RenderSteps Component

Allows injecting custom logic into the render process of a game object. WebGL only. The Filters system uses RenderSteps internally.

```js
// Add a custom render step:
gameObject.addRenderStep(function (renderer, gameObject, drawingContext, parentMatrix, renderStep, displayList, displayListIndex) {
    // Custom rendering logic here
    // Call next step when ready:
    var nextFn = gameObject._renderSteps[renderStep + 1];
    if (nextFn) {
        nextFn(renderer, gameObject, drawingContext, parentMatrix, renderStep + 1, displayList, displayListIndex);
    }
});
```

**Key details:**
- Steps are stored in `_renderSteps` array, executed via `renderWebGLStep()`
- First step runs first and is responsible for calling subsequent steps
- This is how Filters defer and control the `renderWebGL` flow

**Source**: `src/gameobjects/components/RenderSteps.js`

### RenderNodes Component

Provides `defaultRenderNodes`, `customRenderNodes`, and `renderNodeData` maps on game objects. See [RenderNodes](render-nodes.md) for usage.

**Source**: `src/gameobjects/components/RenderNodes.js`

---
