# Node-RED Setup: Radar Positioning Engine

## Eindresultaat

```
ESP32-sensoren → MQTT broker → Node-RED → MQTT: Position/Location → Digital Twin
```

**Output naar de twin** (gepubliceerd op `Position/Location`):
```json
{
  "presence": true,
  "persons": [
    { "x": 2.45, "y": 6.10, "room": "woonkamer", "floor": 0, "confidence": 0.82, "source": "trilateration" },
    { "x": 1.20, "y": 0.50, "room": "sportkamer", "floor": 1, "confidence": 0.65, "source": "2-sensor" }
  ],
  "updatedAt": 1708432800000
}
```
- `persons[]`: max 3 personen (1 per vloer)
- `confidence`: 0.0–1.0 (hoger = zekerder)
- `source`: `trilateration` (3+ sensoren), `2-sensor`, `1-sensor`

---

## Stap 1 — MQTT-broker instellen in Node-RED

1. Open Node-RED → hamburger menu → **Manage palette** → installeer indien nodig `node-red-contrib-mqtt-broker`
2. Sleep een **mqtt in** node op het canvas
3. Dubbelklik → **Server** → `+ Add new mqtt-broker`
   - Server: `***.***.***.***`
   - Port: `1884`
   - Username: `************`
   - Password: `***************`
4. Topic: `homeassistant/ESP_Node_Network/nodes/+/sensors/radar_sync`
   (`+` is een MQTT-wildcard voor één niveau — matcht elk IP-adres van een ESP-node)
5. Output: **parsed JSON object**

---

## Stap 2 — Init-flow bouwen (eenmalig)

Deze flow slaat de sensorposities en kamerpolygonen op in de global context.

```
[Inject] → [Function: Init Config]
```

### Inject-node
- Payload: leeg (timestamp)
- **✓ Inject once after 0.1 seconds on start**

### Function-node "Init: Radar Config"
Kopieer de volledige inhoud van `01_init_config.js` in de function-body.

---

## Stap 3 — Positioning-flow bouwen

```
[MQTT In: homeassistant/ESP_Node_Network/nodes/+/sensors/radar_sync] → [Function: Radar Positioning Engine] → [MQTT Out: Position/Location]
                                            ↓
                                     [Debug node]  (optioneel)
```

### Function-node "Radar Positioning Engine"
Kopieer de volledige inhoud van `02_positioning_engine.js` in de function-body.

### MQTT Out-node
- Server: zelfde als stap 1
- Topic: `Position/Location`
- QoS: `0`
- Retain: `false`

---

## Stap 4 — Deploy & testen

1. Klik **Deploy**
2. Controleer of de Init-node "Radar config geladen: 28 sensoren, 3 vloeren." logt
3. Stuur een test-bericht via **Inject** (optioneel) of wacht op een echte sensormelding
4. In de **Debug-node** moet je zien:
   ```json
   { "presence": false, "persons": [], "updatedAt": 1234567890 }
   ```
   En bij aanwezigheid:
   ```json
   { "presence": true, "persons": [{ "x": ..., "y": ..., "room": "...", ... }], ... }
   ```

---

## Stap 5 — Twin abonneren op Position/Location

In de Digital Twin pas je de MQTT-subscribe aan:

```javascript
// In Mqttservice.js — subscribe ook op Position/Location
this.client.subscribe("Position/Location");

// In _handleMessage — voeg case toe
if (topic === 'Position/Location') {
    if (this.onMessageCallback) {
        this.onMessageCallback(topic, payload, 'persons');
    }
}
```

In de applicatie-code:
```javascript
mqtt.onMessageCallback = (topic, payload, type) => {
    if (type === 'persons') {
        // payload.persons = [{ x, y, room, floor, confidence }, ...]
        // payload.presence = true/false
        renderPersons(payload.persons);
    }
};
```

---

## Aanpassingen

### dist in mm in plaats van cm?
Pas in `02_positioning_engine.js` aan:
```javascript
DIST_UNIT: 0.001,   // mm → m
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
