## RenderNodes (Replacing Pipelines)

In v3, a `Pipeline` was a rendering system that often handled multiple responsibilities. In v4, each `RenderNode` handles a single rendering task via its `run()` method. Some nodes also have a `batch()` method to accumulate state before drawing.

### Architecture

The `RenderNodeManager` (on the WebGL renderer) owns all render nodes. Game objects reference nodes through role-based maps.

```js
// RenderNode roles on a game object:
// - 'Submitter': runs other node roles for each element
// - 'Transformer': provides vertex coordinates
// - 'Texturer': handles textures

// GameObjects have default and custom render node maps:
gameObject.defaultRenderNodes  // built-in nodes per role
gameObject.customRenderNodes   // overrides per role
gameObject.renderNodeData      // data keyed by node name
```

### Setting Custom RenderNodes

```js
// Override a specific render role:
gameObject.setRenderNodeRole('Submitter', 'MyCustomSubmitter');

// Pass data to a render node:
gameObject.setRenderNodeRole('Transformer', 'MyTransformer', {
    customProperty: 42
});

// Remove a custom node (falls back to default):
gameObject.setRenderNodeRole('Submitter', null);
```

### Built-in RenderNode Types

**Batch Handlers** (accumulate and draw multiple objects per draw call):
- `BatchHandlerQuad` -- standard quad batching (Image, Sprite, BitmapText, etc.)
- `BatchHandlerQuadSingle` -- single-quad variant
- `BatchHandlerTileSprite` -- TileSprite batching
- `BatchHandlerTriFlat` -- flat triangle batching (Graphics, Shape)
- `BatchHandlerPointLight` -- point light batching
- `BatchHandlerStrip` -- triangle strip batching

**Submitters** (coordinate rendering per object type):
- `SubmitterQuad`, `SubmitterTile`, `SubmitterTileSprite`
- `SubmitterSpriteGPULayer`, `SubmitterTilemapGPULayer`

**Transformers** (compute vertex positions):
- `TransformerImage`, `TransformerStamp`, `TransformerTile`, `TransformerTileSprite`

**Texturers** (manage texture binding):
- `TexturerImage`, `TexturerTileSprite`

**Filters** (post-processing -- see [Filter API](filters-api.md)):
- `BaseFilter`, `BaseFilterShader`
- `FilterBarrel`, `FilterBlend`, `FilterBlocky`, `FilterBlur` (Low/Med/High variants)
- `FilterBokeh`, `FilterColorMatrix`, `FilterCombineColorMatrix`
- `FilterDisplacement`, `FilterGlow`, `FilterGradientMap`, `FilterImageLight`
- `FilterKey`, `FilterMask`, `FilterNormalTools`, `FilterPanoramaBlur`
- `FilterParallelFilters`, `FilterPixelate`, `FilterQuantize`
- `FilterSampler`, `FilterShadow`, `FilterThreshold`, `FilterVignette`, `FilterWipe`

**Other**:
- `Camera`, `FillCamera`, `FillRect`, `FillPath`, `FillTri`
- `DrawLine`, `StrokePath`, `ShaderQuad`
- `ListCompositor`, `RebindContext`, `YieldContext`
- `DynamicTextureHandler`

### Extending: Custom RenderNodes

```js
// Register a custom node constructor:
renderer.renderNodes.addNodeConstructor('MyNode', MyNodeClass);

// Or add a pre-built node instance:
renderer.renderNodes.addNode('MyNode', myNodeInstance);
```

---
