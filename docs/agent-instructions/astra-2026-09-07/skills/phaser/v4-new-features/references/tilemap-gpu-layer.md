## TilemapGPULayer

> Full tilemap reference: [Tilemap API](tilemaps-api.md)

High-performance GPU-based tilemap rendering. Renders the entire layer as a single quad via a specialized shader. WebGL only.

```js
// Create via Tilemap with the gpu flag:
const map = this.make.tilemap({ key: 'level1' });
const tileset = map.addTilesetImage('tiles', 'tilesImage');
const gpuLayer = map.createLayer('Ground', tileset, 0, 0, true);  // last arg: gpu = true
```

**Capabilities:**
- Single tileset with single texture image
- Maximum 4096x4096 tiles, up to 2^23 unique tile IDs
- Tile flipping and animation supported
- Orthographic tilemaps only (no isometric/hexagonal)
- Perfect texture filtering in LINEAR mode (no tile seams)
- Cost is per-pixel, not per-tile -- no performance loss with many visible tiles

**Restrictions:**
- Cannot use multiple tilesets
- Editing requires manual `generateLayerDataTexture()` call to update
- Orthographic only

**Internal data**: Tile data stored in a texture (4 bytes/tile: 2 flip bits, 1 animation bit, 1 unused, 28-bit tile index). Animation data in a separate texture.

**Source**: `src/tilemaps/TilemapGPULayer.js`

---
