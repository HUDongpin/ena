### Noise Game Objects

All noise types extend `Shader` and are WebGL only. Six variants available:

| Type | Factory | Description |
|---|---|---|
| `Noise` | `this.add.noise()` | White noise (random hash-based) |
| `NoiseCell2D` | `this.add.noiseCell2D()` | 2D cellular/Worley/Voronoi noise |
| `NoiseCell3D` | `this.add.noiseCell3D()` | 3D cellular noise (Z-axis slicing for animation) |
| `NoiseCell4D` | `this.add.noiseCell4D()` | 4D cellular noise (Z+W axis slicing) |
| `NoiseSimplex2D` | `this.add.noiseSimplex2D()` | 2D simplex/gradient noise (clouds, fire, water) |
| `NoiseSimplex3D` | `this.add.noiseSimplex3D()` | 3D simplex noise |

```js
// Basic white noise:
const noise = this.add.noise({
    noiseOffset: [0, 0],
    noisePower: 1
}, 100, 100, 256, 256);

// Cellular noise with customization:
const cells = this.add.noiseCell2D({
    noiseOffset: [0, 0],
    noiseIterations: 3,
    noiseNormalMap: true    // output as normal map for lighting
}, 200, 200, 256, 256);

// Simplex noise for natural effects:
const simplex = this.add.noiseSimplex2D({
    noiseFlow: 0,           // animate this for evolution
    noiseIterations: 4,
    noiseWarpAmount: 0.5,   // turbulence
    noiseSeed: 42,
    noiseNormalMap: false
}, 300, 300, 256, 256);
```

**Common properties across noise types:**
- `noiseOffset` -- `[x, y]` array to scroll the pattern
- `noisePower` -- sculpt output levels (higher suppresses high values)
- `noiseNormalMap` -- output normal map (for lighting integration)
- `noiseIterations` -- detail level (cellular/simplex types)

**Math equivalents**: `Phaser.Math.Hash()`, `Phaser.Math.HashCell()`, `Phaser.Math.HashSimplex()`

**Source**: `src/gameobjects/noise/`
