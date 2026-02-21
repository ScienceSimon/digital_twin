# Node-RED Setup: Radar Positioning Engine

## Eindresultaat

```
ESP32-sensoren -> MQTT broker -> Node-RED -> MQTT: Position -> Digital Twin
```

**Output naar de twin** (gepubliceerd op MQTT topic `Position`):
```json
{
  "presence": true,
  "persons": [
    { "x": 2.45, "y": 3.53, "z": 8.88, "room": "kantoor", "floor": 1, "confidence": 1, "source": "trilateration-multi" },
    { "x": 4.70, "y": 6.16, "z": 2.50, "room": "waskamer", "floor": 2, "confidence": 1, "source": "1-sensor-est" }
  ],
  "updatedAt": 1708432800000
}
```
- `persons[]`: meerdere personen, dynamisch aantal
- `x`, `y`, `z`: 3D-coordinaten in de twin (meters)
- `confidence`: 0.0-1.0 (hoger = zekerder)
- `source`: `trilateration-multi` (3+ sensoren), `2-sensor`, `1-sensor-est`

---

## Stap 1 - MQTT-broker instellen in Node-RED

1. Open Node-RED -> hamburger menu -> **Manage palette** -> installeer indien nodig `node-red-contrib-mqtt-broker`
2. Sleep een **mqtt in** node op het canvas
3. Dubbelklik -> **Server** -> `+ Add new mqtt-broker`
   - Server: `***.***.***.***`
   - Port: `1884`
   - Username / Password: zie configuratie
4. Topic: `homeassistant/ESP_Node_Network/nodes/+/sensors/radar_sync`
   (`+` is een MQTT-wildcard voor een niveau - matcht elk IP-adres van een ESP-node)
5. Output: **parsed JSON object**

---

## Stap 2 - Init-flow bouwen (eenmalig)

Deze flow slaat de sensorposities en kamerpolygonen op in de global context.

```
[Inject] -> [Function: Init Config]
```

### Inject-node
- Payload: leeg (timestamp)
- **Inject once after 0.1 seconds on start**

### Function-node "Init: Radar Config"
Kopieer de volledige inhoud van `01_init_config.js` in de function-body.

---

## Stap 3 - Positioning-flow bouwen

```
[MQTT In: homeassistant/ESP_Node_Network/nodes/+/sensors/radar_sync] -> [Function: Radar Positioning Engine] -> [MQTT Out: Position]
                                            |
                                     [Debug node]  (optioneel)
```

### Function-node "Radar Positioning Engine"
Kopieer de volledige inhoud van `02_positioning_engine.js` in de function-body.

### MQTT Out-node
- Server: zelfde als stap 1
- Topic: `Position`
- QoS: `0`
- Retain: `false`

---

## Stap 4 - Deploy & testen

1. Klik **Deploy**
2. Controleer of de Init-node "Radar config geladen: 28 sensoren, 3 vloeren." logt
3. Wacht op een echte sensormelding of stuur een test-bericht via **Inject**
4. In de **Debug-node** moet je zien:
   ```json
   { "presence": false, "persons": [], "updatedAt": 1234567890 }
   ```
   En bij aanwezigheid:
   ```json
   { "presence": true, "persons": [{ "x": ..., "y": ..., "z": ..., "room": "...", ... }], ... }
   ```

---

## Stap 5 - Twin ontvangt positiedata

De Digital Twin subscribet automatisch op het `Position` topic.

### MqttService.js
```javascript
// Subscribe op exact topic + subtopics
this.client.subscribe("Position");
this.client.subscribe("Position/#");

// Handler detecteert Position topics
if (topic === 'Position' || topic.startsWith('Position/')) {
    this.onMessageCallback(topic, payload, 'Location');
}
```

### main.js - MQTT callback
```javascript
// Dynamische beacon-creatie per persoon
if (entityId === 'Position' || entityId.startsWith('Position/')) {
    const data = JSON.parse(value);
    const persons = data.persons || (data.x !== undefined ? [data] : []);

    persons.forEach((person, i) => {
        // Maak beacon aan als die nog niet bestaat
        if (!state.positionBeacons[i]) {
            state.positionBeacons[i] = createRadarBeacon();
            state.scene.add(state.positionBeacons[i]);
        }
        // Animeer naar nieuwe positie
        gsap.to(state.positionBeacons[i].position, {
            x: person.x, y: person.y, z: person.z,
            duration: 0.3, ease: "power1.out"
        });
    });

    // Verberg beacons voor personen die niet meer gedetecteerd worden
    // Verberg alles bij presence: false
}
```

Elke persoon in de `persons` array krijgt een eigen pulserende beacon (cyan bol met uitdijende ring) die smooth naar de nieuwe coordinaten animeert.

---

## Aanpassingen

### dist in mm in plaats van cm?
Pas in `02_positioning_engine.js` aan:
```javascript
DIST_UNIT: 0.001,   // mm -> m
```

### esp0_XX sensoren hebben andere node-nummers?
Voeg in `01_init_config.js` toe met het juiste MQTT-nodenummer als sleutel:
```javascript
42: { id: "esp0_01", label: "Keuken Oost", x: 4.90, y: 0.10, floor: 0 },
```

### Detectierange aanpassen?
```javascript
MAX_DETECT_RANGE_M: 4.0,   // kleinere uitsluitingszone
```
