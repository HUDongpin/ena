### CaptureFrame

Captures the current framebuffer contents to a texture at the point in the display list where it sits. Does not render anything itself. WebGL only.

```js
// Everything above this in the display list gets captured:
const image1 = this.add.image(400, 300, 'background');

// Enable framebuffer usage on the camera:
this.cameras.main.setForceComposite(true);

// Create the capture point:
const capture = this.add.captureFrame('myCapturedTexture');

// Use the captured texture on another object:
const overlay = this.add.image(400, 300, 'myCapturedTexture');
// Add filters to the overlay to distort the captured scene
```

**Key details:**
- Requires `camera.setForceComposite(true)` or a framebuffer context (Filters, DynamicTexture, camera with partial alpha)
- Inside a Container with filters, captures only that Container's contents
- Setting `visible = false` stops capturing
- Components: BlendMode, Depth, RenderNodes, Visible

**Source**: `src/gameobjects/captureframe/CaptureFrame.js`
