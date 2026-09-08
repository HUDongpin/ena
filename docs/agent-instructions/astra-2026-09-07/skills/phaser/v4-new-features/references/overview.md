## Overview: What Changed in v4

Phaser 4 is a complete overhaul of the WebGL rendering engine. The v3 renderer let each subsystem manage WebGL state independently, causing conflicts (e.g. certain FX breaking Masks). v4 centralizes WebGL state management through a RenderNode graph, where each node handles exactly one rendering task.

### Key Removals

| v3 Feature | v4 Replacement |
|---|---|
| `Pipeline` | `RenderNode` (per-task rendering nodes) |
| FX (`preFX` / `postFX`) | Filters (`filters.internal` / `filters.external`) |
| `BitmapMask` | `FilterMask` (via filters system) |
| `GeometryMask` (WebGL) | `FilterMask` (Canvas still uses GeometryMask) |
| Derived FX: Bloom, Circle, Gradient, Shine | Actions (`AddEffectBloom`, `AddEffectShine`, `AddMaskShape`) or GameObjects |
| `Mesh` and `Plane` | Removed (proper 3D planned for future) |
| `Point` | Use `Vector2` instead |

### Key Additions

- **New GameObjects**: `CaptureFrame`, `Gradient`, `Noise`, `NoiseCell2D/3D/4D`, `NoiseSimplex2D/3D`, `SpriteGPULayer`, `Stamp`, `TilemapGPULayer`
- **New Components**: `Lighting`, `RenderSteps`, `RenderNodes`
- **New Tint Modes**: `MULTIPLY`, `FILL`, `ADD`, `SCREEN`, `OVERLAY`, `HARD_LIGHT`
- **New Filters**: Blend, Blocky, CombineColorMatrix, GradientMap, ImageLight, Key, Mask, NormalTools, PanoramaBlur, ParallelFilters, Quantize, Sampler, Threshold
- **GL Orientation**: v4 uses standard GL orientation (Y=0 at bottom for textures)

---
