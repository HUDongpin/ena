### SpriteGPULayer

Renders very large numbers of quads (up to millions) in a single draw call by storing data in a static GPU buffer. Up to 100x faster than individual sprites. WebGL only.

```js
const layer = this.add.spriteGPULayer(texture, size); // size = max number of members

// Add members (do this all at once, not incrementally):
const member = { x: 100, y: 200, frame: 'tree', scaleX: 1, scaleY: 1, alpha: 1 };
layer.addMember(member);

// Reuse the member object for efficiency with millions of entries:
member.x = 300;
member.y = 400;
member.frame = 'bush';
layer.addMember(member);

// Enable lighting on the layer:
layer.setLighting(true);
```

**Key details:**
- Single texture only (no multi-atlas), single image per layer
- Members support tween-like animations (fade, bounce, wave, color shift) defined at creation
- Updating buffer contents is expensive -- populate once, leave unchanged
- Power-of-two textures recommended for pixel art to avoid seaming
- "Remove" members visually by setting `scaleX/scaleY/alpha` to 0 (avoids buffer rebuild)
- Components: Alpha, BlendMode, Depth, ElapseTimer, Lighting, Mask, RenderNodes, TextureCrop, Visible

**Source**: `src/gameobjects/spritegpulayer/SpriteGPULayer.js`

---
