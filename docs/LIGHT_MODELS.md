# Light Models System Documentation

## Overview
The Digital Twin now uses a modular 3D model system for lights, with dynamic color and brightness support from Home Assistant.

## Architecture

### 1. Model Definitions (`modules/models/modelFusion.js`)
Contains reusable 3D model creation functions:

- **`createRecessedSpot()`** - Ceiling-mounted inbouwspot
  - Trim ring (visible metal frame)
  - Inner housing (recessed dark area)
  - Glass lens (glows with light color)
  - Glow halo (ambient light effect)

- **`createCylinderSpot()`** - Hanging cylinder spot (WC-rol style)
  - Mounting plate (ceiling attachment)
  - Cylinder body (main housing)
  - Bottom cap
  - Lens (glows with light color)
  - Glow ring (ambient light effect)

- **`updateSpotAppearance(lightGroup, state)`** - Updates light appearance
  - Dynamically adjusts color and brightness
  - Updates both physical model and SpotLight
  - Syncs with Home Assistant state

### 2. Asset Factory (`modules/builders/assetFactory.js`)
Imports and uses models from modelFusion.js:
- Creates light instances from YAML data
- Adds Three.js SpotLight to each fixture
- Applies position using `x, y, z` coordinates
- Applies rotation using `rx, ry, rz` (degrees → radians)
- Stores Home Assistant entity ID for state updates

### 3. Main Application (`main.js`)
Handles MQTT updates and applies them to models:
- Receives light state from Home Assistant via MQTT
- Calls `updateSpotAppearance()` to update 3D models
- Manages light labels with toggle controls

## YAML Configuration

### Recessed Spot Example:
```yaml
- id: "kitchen_spot_1"
  ha_entity: "light.hue_color_spot_39"
  type: "lamp"
  model: "recessed_spot"
  x: 4.8
  y: 2.625
  z: 2.44
```

### Cylinder Spot Example:
```yaml
- id: "hallway_spot_1"
  ha_entity: "light.hue_color_spot_41"
  type: "lamp"
  model: "cylinder_spot"
  x: -1.0
  y: 3.0
  z: 0.5
  rx: 45  # Rotation in degrees
  ry: 0
  rz: 0
```

## Features

### Dynamic Color Support
- Reads RGB values from Home Assistant
- Updates lens emissive color in real-time
- Updates SpotLight color to match
- Applies glow halo with matching color

### Dynamic Brightness Support
- Maps brightness (0-255) to emissive intensity
- Updates SpotLight intensity (0-10 range)
- Controls glow opacity based on brightness
- Smooth transitions between states

### Rotation Control
- Supports individual axis rotation (rx, ry, rz)
- Angles specified in degrees (auto-converted to radians)
- Allows precise aiming of cylinder spots
- Recessed spots typically don't need rotation

## How It Works

1. **Initialization**:
   - `buildAssets()` reads YAML configuration
   - Creates 3D model using `createRecessedSpot()` or `createCylinderSpot()`
   - Adds SpotLight with initial intensity
   - Positions and rotates based on YAML data
   - Stores in `state.iotMeshes` with entity ID

2. **MQTT Updates**:
   - Home Assistant publishes light state changes
   - `MqttService` detects light entity updates
   - Parses state: `{isOn, brightness, rgb}`
   - Calls `updateLightDisplay()` with entity ID and state

3. **Visual Update**:
   - `updateSpotAppearance()` calculates intensity and color
   - Updates lens emissive material
   - Updates glow ring opacity and color
   - Updates SpotLight color and intensity
   - Scene re-renders with new lighting

## Benefits

✅ **Modular** - Models defined once, reused everywhere
✅ **Dynamic** - Real-time color and brightness updates
✅ **Realistic** - Emissive materials create authentic glow
✅ **Maintainable** - Clean separation of concerns
✅ **Extensible** - Easy to add new light models

## Adding New Light Models

To add a new light type:

1. Create model function in `modelFusion.js`:
```javascript
export function createNewLightType() {
    const group = new THREE.Group();
    // ... create geometry and materials

    // Store updatable materials
    group.userData.updateMaterials = {
        lens: lensMat,
        glow: glowMat
    };

    return group;
}
```

2. Add to `assetFactory.js`:
```javascript
if (asset.model === 'new_light_type') {
    mesh = createNewLightType();
}
```

3. Add to YAML:
```yaml
- id: "my_new_light"
  ha_entity: "light.entity_id"
  type: "lamp"
  model: "new_light_type"
  x: 0
  y: 2.6
  z: 0
```

The `updateSpotAppearance()` function will automatically handle color and brightness updates!
