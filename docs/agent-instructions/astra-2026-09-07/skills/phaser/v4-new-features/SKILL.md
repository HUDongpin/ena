---
name: v4-new-features
description: Explain Phaser 4 capabilities and help select new rendering features. For upgrading existing Phaser 3 code, use the migration skill.
---

# Phaser 4 New Features

Use this skill to compare Phaser 4 capabilities or implement a selected new feature. For existing Phaser 3 code, use the [migration guide](../v3-to-v4-migration/SKILL.md).

The material describes Phaser 4.1.0. Advanced rendering features use WebGL. RenderNodes centralize rendering state, while filters distinguish object-local processing from processing after the camera transform.

Read the references relevant to the selected feature:

| Task or decision | Reference |
|---|---|
| Compare the main additions and removals | [Feature overview](references/overview.md) |
| Select filters, masks, or post-processing effects | [Filters](references/filters.md); [full filter API](references/filters-api.md) for implementation detail |
| Register or extend a render node | [RenderNodes](references/render-nodes.md) |
| Capture a framebuffer at a particular display-list position | [CaptureFrame](references/capture-frame.md) |
| Render color gradients | [Gradient objects](references/gradients.md) |
| Generate cellular or simplex noise | [Noise objects](references/noise.md) |
| Render large, mostly static collections of sprites | [SpriteGPULayer](references/sprite-gpu-layer.md) |
| Add lighting or customize rendering through components | [New components](references/components.md); [component API](references/components-api.md) and [component matrix](references/components-reference.md) when needed |
| Choose or update a GPU tilemap layer | [TilemapGPULayer](references/tilemap-gpu-layer.md); [tilemap API](references/tilemaps-api.md) for implementation detail |
| Use tint modes or locate the corresponding Phaser source files | [Tint and source reference](references/REFERENCE.md) |

Source paths such as `src/renderer/` refer to the Phaser package source tree. Package provenance, original-file mappings, and the MIT license are included at the library root.
