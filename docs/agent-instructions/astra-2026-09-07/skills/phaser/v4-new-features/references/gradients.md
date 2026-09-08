### Gradient

Displays GPU-rendered color gradients. Extends `Shader`. Supports linear, radial, and other shape modes with configurable `ColorRamp` containing `ColorBand` objects.

```js
// Simple linear gradient:
const grad = this.add.gradient(undefined, 100, 100, 200, 200);

// Complex radial gradient with multiple color bands:
const halo = this.add.gradient({
    bands: [
        { start: 0.5, end: 0.6, colorStart: [0.5, 0.5, 1, 0], colorEnd: 0xffffff, colorSpace: 1, interpolation: 4 },
        { start: 0.6, end: 1, colorStart: 0xffffff, colorEnd: [1, 0.5, 0.5, 0], colorSpace: 1, interpolation: 3 }
    ],
    dither: true,
    repeatMode: 1,
    shapeMode: 2,       // radial
    start: { x: 0.5, y: 0.5 },
    shape: { x: 0.5, y: 0.0 }
}, 400, 300, 800, 800);

// Animate:
halo.offset = 0.1 * (1 + Math.sin(time / 1000));
```

**Key details:**
- Config: `GradientQuadConfig` with `bands`, `shapeMode`, `repeatMode`, `start`, `shape`, `dither`
- Colors defined via `ColorRamp` with `ColorBand` objects (supports HSV, various interpolation modes)
- Call `gradient.ramp.encode()` after modifying ramp data at runtime

**Source**: `src/gameobjects/gradient/Gradient.js`
