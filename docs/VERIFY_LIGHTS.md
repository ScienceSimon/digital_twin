# Light System Verification Guide

## What to Check in Browser Console

When you load the Digital Twin, you should see these console messages:

### 1. Asset Summary
```
Assets geladen: X lampen, Y blinds, Z zonnepanelen (N objecten)
```

### 2. MQTT Connection
```
MQTT: Verbonden met Home Assistant
```

### 3. Light Updates in Event Log
When lights change state, they appear in the on-screen Event Log panel (LIGHT type entries).

## What to See in 3D View

### Recessed Spots (Inbouwspots)
- White/silver trim rings flush with ceiling
- Warm yellowish glow from lens when ON
- Subtle halo around each spot
- Light cones pointing downward

### Cylinder Spots (Opbouwspots)
- Dark cylindrical housings hanging from ceiling
- Can be rotated (angled)
- Warm glow at bottom when ON
- Light cones in the aimed direction

### Other Light Types
- **Sphere lamps** - Glowing sphere on floor level
- **Light tubes** - Linear strip lights
- **Light rings** - Circular ring lamps
- **Bulbs** - Transparent glass bulbs with filament

## Testing Color & Brightness

### Using Home Assistant:

1. **Turn lights ON/OFF** - Glow appears/disappears, event log shows LIGHT ON/OFF
2. **Change brightness** - Glow intensity changes smoothly
3. **Change color** - Lens, glow, and SpotLight cone all change color

## Scene Controls

Toggle visibility via the Scene Controls panel:

| Toggle | What it controls |
|--------|-----------------|
| Room Labels | Room name labels with motion dots |
| Light Labels | Light entity name labels |
| Blind Labels | Venetian blind labels |
| Device Labels | Device name labels |
| Temperature | Temperature sensor pills |
| Modules | Presence sensor module labels |
| Ethernet Labels | Network device labels |
| Ethernet Tubes | Animated data beam tubes |
| Coordinates | XYZ position display on labels |
| Failed Sensors | Failed sensor indicators |

## Troubleshooting

### "I don't see any lights"
1. Check console for asset loading messages
2. Toggle "Light Labels" ON to see where lights should be
3. Navigate camera to the right room and look at the ceiling
4. Check Y position matches ceiling height in `house.yaml`

### "Lights appear but don't change color"
1. Verify MQTT connection: `MQTT: Verbonden met Home Assistant`
2. Change light state in Home Assistant
3. Check the Event Log panel for LIGHT entries
4. Verify `ha_entity` in YAML matches the Home Assistant entity ID

### "Rotation doesn't work on cylinder spots"
- Only `cylinder_spot` model supports rotation
- Check `rotation: { x: 45, y: 0, z: 0 }` in YAML
- Values are in degrees

## Performance Notes

- Shadows disabled for lights (performance)
- Low-poly geometry
- MQTT callback updates 3D meshes directly (no DOM)
- Sensor label DOM updates throttled to 10fps with frustum culling
- Labels outside camera view are not updated
