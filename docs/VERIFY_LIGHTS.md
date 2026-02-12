# Light System Verification Guide

## What to Check in Browser Console

When you load the Digital Twin, you should see these console messages:

### 1. Light Creation Messages
```
✨ Creating recessed spot: kitchen_spot_1
   📍 Position: (4.8, 2.625, 2.44)
   💡 SpotLight added with entityId: light.hue_color_spot_39

✨ Creating recessed spot: kitchen_spot_2
   📍 Position: (4.8, 2.625, 0.65)
   💡 SpotLight added with entityId: light.hue_color_spot_40

✨ Creating cylinder spot: hallway_spot_1
   📍 Position: (-1, 3, 0.5)
   🔄 Rotation: rx=45° ry=0° rz=0°
   💡 SpotLight added with entityId: light.hue_color_spot_41
```

### 2. Asset Summary
```
✅ Asset loading complete:
   💡 Lights created: 5
   📦 Total scene objects: [number]
```

### 3. MQTT Light Updates (when lights change)
```
 LIGHT  light.hue_color_spot_39      ON 255/255
```

## What to See in 3D View

### Kitchen Spots (Recessed)
- **Location**: Kitchen ceiling (around x=4.8, y=2.625)
- **Look for**:
  - White/silver trim rings flush with ceiling
  - Warm yellowish glow from lens
  - Subtle halo around each spot
  - Light cones pointing downward

### Hallway Spots (Cylinder)
- **Location**: Hallway area (x=-1, y=3, z=0.5)
- **Look for**:
  - Dark cylindrical housings hanging from ceiling
  - Rotated 45° on X-axis (angled)
  - Warm glow at bottom of cylinders
  - Light cones in the direction they're pointing

## Initial Appearance

Even without Home Assistant connection, lights should show:
- ✅ Visible fixture geometry (rings, cylinders)
- ✅ Subtle warm glow (emissive = 0.3)
- ✅ Soft halo effect (opacity = 0.2)
- ✅ SpotLight cones with intensity = 5

## Testing Color & Brightness

### Using Home Assistant:

1. **Turn lights ON/OFF**
   - Lights should glow brighter when ON
   - Glow should disappear when OFF
   - Console shows: `LIGHT ... ON/OFF`

2. **Change brightness**
   - Adjust slider in Home Assistant
   - Glow intensity should change smoothly
   - Console shows: `LIGHT ... 128/255` (example)

3. **Change color**
   - Set RGB color in Home Assistant
   - Lens and glow should change color
   - SpotLight cone should match color
   - Console shows RGB values

## Troubleshooting

### "I don't see any lights"

**Check console for:**
- ❌ No creation messages → Lights not in YAML or wrong format
- ❌ No SpotLight messages → Model creation failed
- ✅ All messages present → Lights created but may be positioned wrong

**Try:**
1. Toggle "Light Labels" in menu to see where they should be
2. Navigate camera to kitchen ceiling (x=4.8, y=2.6, z=2.5)
3. Look up at the ceiling
4. Check Y position matches ceiling height (should be ≤ 2.63)

### "Lights appear but don't change color"

**Check console for:**
- ❌ No MQTT messages → MQTT not connected
- ❌ `updateLightDisplay` errors → Check browser console
- ✅ LIGHT messages present → Should work

**Try:**
1. Verify MQTT connection in console: `MQTT: Verbonden met Home Assistant`
2. Change light state in Home Assistant
3. Watch for MQTT LIGHT messages
4. Check entity IDs match in YAML

### "Rotation doesn't work on cylinder spots"

**Verify in YAML:**
```yaml
- id: "hallway_spot_1"
  type: "lamp"
  model: "cylinder_spot"
  rx: 45  # ← These must be present
  ry: 0
  rz: 0
```

**Check console:**
```
🔄 Rotation: rx=45° ry=0° rz=0°  ← Should see this
```

### "Lights are too bright/dim"

**Adjust in modelFusion.js:**
```javascript
// Initial visibility (line ~36)
emissiveIntensity: 0.3,  // Change this (0.0 - 1.0)

// Glow opacity (line ~48)
opacity: 0.2,  // Change this (0.0 - 1.0)
```

**Adjust SpotLight in assetFactory.js:**
```javascript
const light = new THREE.SpotLight(0xffffcc, 5);  // Change 5 to your preference
```

## Performance Tips

Current settings:
- ✅ Shadows disabled for lights (performance)
- ✅ Low-poly geometry (32 segments)
- ✅ Efficient material updates

If you experience lag with many lights:
1. Reduce SpotLight distance to 6 (currently 8)
2. Reduce geometry segments to 16
3. Disable glow halos (comment out glow creation)

## Expected Behavior Summary

| State | Fixture Appearance | SpotLight | Glow |
|-------|-------------------|-----------|------|
| **Initial (no MQTT)** | Visible, warm glow | Intensity 5, yellow-white | Subtle, 20% opacity |
| **OFF (from HA)** | Visible, no glow | Intensity 0 | Invisible |
| **ON (from HA)** | Visible, bright glow | Intensity scaled to brightness | Scaled opacity |
| **Colored (RGB)** | Colored glow | Colored cone | Colored halo |

All states should be smooth and visible! 🎨💡
