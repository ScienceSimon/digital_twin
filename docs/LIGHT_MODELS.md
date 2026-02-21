# Light Models System Documentation

## Overview
The Digital Twin uses a modular 3D model system for lights, with dynamic color and brightness support from Home Assistant via MQTT.

## Architecture

### 1. Model Definitions (`modules/models/modelFusion.js`)
Contains reusable 3D model creation functions for lights:

- **`createRecessedSpot()`** - Ceiling-mounted inbouwspot (trim ring, housing, glass lens, glow halo)
- **`createCylinderSpot()`** - Hanging cylinder spot (mounting plate, cylinder body, bottom cap, lens, glow ring)
- **`createTransparentBulb()`** - Glass bulb with filament
- **`createLightTube(length)`** - Linear light strip (lichtslang)
- **`createLightRing(diameter)`** - Circular ring lamp
- **`createSphereLamp()`** - Floor sphere lamp (bollamp)

Also contains non-light models:
- **`createRadarBeacon()`** - Pulsing radar beacon (used for position tracking)
- **`createServerRack()`** - 4U UniFi rack
- **`createFlexMini()`** - UniFi Flex Mini 5-port switch
- **`createU6Mesh()`** - UniFi U6 WiFi mesh AP with animated waves
- **`createLianLiVision(variant)`** - PC case (black/white)
- **`createRoombaVacuum()`** / **`createRoombaDock()`** - iRobot Roomba

**`updateSpotAppearance(lightGroup, state)`** - Updates light appearance dynamically:
  - Adjusts emissive color and intensity from `{isOn, brightness, rgb}` state
  - Updates SpotLight/PointLight color and intensity
  - Controls glow opacity based on brightness

### 2. Asset Factory (`modules/builders/assetFactory.js`)
Creates 3D instances from YAML configuration. Supported `model` values for `type: "lamp"`:
- `recessed_spot`, `cylinder_spot`, `sphere`, `light_tube`, `light_ring`, `bulb`

Other asset types: `venetian_blinds`, `solar_panel`, `server_rack`, `flex_mini`, `u6_mesh`, `lianli_vision`, `irobot_vacuum`, `irobot_dock`, `dummy_cube`, `radar_beacon`

### 3. Main Application (`main.js`)
Handles MQTT updates via a decoupled data/view architecture:
- **MQTT callback** receives light state and calls `updateSpotAppearance()` directly on the 3D mesh (immediate, no DOM)
- **`MqttService`** detects light entity updates and parses state/brightness/rgb_color attributes
- All sensor label updates (temperature, motion, metrics, speeds) are stored in `state.dataStore` and rendered via `updateLabels()` at max 10fps with frustum culling

### 4. Data Files
- **`data/assets_iot.yaml`** - IoT asset definitions (lights, blinds, sensors, devices, ethernet)
- **`data/assets_static.yaml`** - Static assets (solar panels)
- **`data/statestream.yaml`** - Metrics and network port entities
- **`data/ethernet.yaml`** - Ethernet connection definitions between devices
- **`data/house.yaml`** - House geometry, rooms, floors

## YAML Configuration

### Recessed Spot:
```yaml
- id: "kitchen_spot_1"
  ha_entity: "light.hue_color_spot_39"
  type: "lamp"
  model: "recessed_spot"
  position: { x: 4.8, y: 2.625, z: 2.44 }
```

### Cylinder Spot:
```yaml
- id: "hallway_spot_1"
  ha_entity: "light.hue_color_spot_41"
  type: "lamp"
  model: "cylinder_spot"
  position: { x: -1.0, y: 3.0, z: 0.5 }
  rotation: { x: 45, y: 0, z: 0 }
```

### Other lamp models:
```yaml
# Sphere lamp
- id: "living_room_lamp"
  ha_entity: "light.woonkamer"
  type: "lamp"
  model: "sphere"
  position: { x: 0.3, y: 0.4, z: 8.8 }

# Light tube
- id: "kitchen_strip"
  ha_entity: "light.keuken_strip"
  type: "lamp"
  model: "light_tube"
  position: { x: 4.6, y: 2.6, z: 1.78 }
```

## Features

### Dynamic Color Support
- Reads RGB values from Home Assistant via MQTT `rgb_color` attribute
- Updates lens emissive color in real-time
- Updates SpotLight color to match
- Applies glow halo with matching color

### Dynamic Brightness Support
- Maps brightness (0-255) to emissive intensity
- Updates SpotLight intensity
- Controls glow opacity based on brightness

### Rotation Control
- Supports individual axis rotation (rx, ry, rz or rotation object)
- Angles specified in degrees (auto-converted to radians)
- Useful for aiming cylinder spots

## Data Flow

1. **Initialization**: `buildAssets()` reads YAML, creates 3D models, adds SpotLights, stores in `state.iotMeshes`
2. **MQTT message**: `MqttService` detects light entity, parses state/brightness/rgb_color, stores attributes
3. **Callback**: `onMessageCallback` finds the 3D mesh by entity ID and calls `updateSpotAppearance()` directly
4. **Visual update**: Lens emissive, glow opacity, and SpotLight are updated immediately (no DOM involved)

## Adding New Light Models

1. Create model function in `modelFusion.js`:
```javascript
export function createNewLightType() {
    const group = new THREE.Group();
    // ... create geometry and materials
    group.userData.updateMaterials = { lens: lensMat, glow: glowMat };
    return group;
}
```

2. Add to `assetFactory.js`:
```javascript
if (asset.model === 'new_light_type') {
    mesh = createNewLightType();
}
```

3. Add to `assets_iot.yaml`:
```yaml
- id: "my_new_light"
  ha_entity: "light.entity_id"
  type: "lamp"
  model: "new_light_type"
  position: { x: 0, y: 2.6, z: 0 }
```

`updateSpotAppearance()` will automatically handle color and brightness updates.
