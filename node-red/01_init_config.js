// ============================================================
// NODE-RED FUNCTION NODE: "Init: Radar Config"
// ============================================================
// Plak deze code in een Function-node.
// Trigger: Inject-node (eenmalig bij deploy, "inject once after 0.1s")
//
// Doel: sla sensorposities en kamerpolygonen op in global context
// zodat de positioning engine ze kan lezen bij elke MQTT-meting.
// ============================================================

// ── Sensorkaart ──────────────────────────────────────────────
// Velden identiek aan assets_iot.yaml — geen hernoemen, direct vergelijkbaar:
//   x     = breedte  (0–4.95 m)
//   y     = hoogte   (absoluut boven begane grond, in meter)
//   z     = diepte   (0–11.22 m)
//   floor = vloerniveau (afgeleid uit y: <2.63=0, <5.26=1, anders=2)

const SENSORS = {
    // ── Begane grond ─────────────────────────────────────────
    15: { id: "ESP_Node_15", label: "Hal", x: 2.20, y: 0.50, z: 2.05, floor: 0, valid_rooms: ["hal", "meterkast", "toilet"] },
    24: { id: "ESP_Node_24", label: "Hal", x: 0.50, y: 1.80, z: 1.60, floor: 0, valid_rooms: ["hal", "woonkamer"] },
    25: { id: "ESP_Node_25", label: "Trap", x: 0.50, y: 2.20, z: 5.90, floor: 0, valid_rooms: ["hal", "overloop"] },

    // ── 1e verdieping ─────────────────────────────────────────
    11: { id: "ESP_Node_11", label: "Sportkamer", x: 2.15, y: 3.63, z: 0.00, floor: 1, valid_rooms: ["sportkamer", "overloop"] },
    17: { id: "ESP_Node_17", label: "Sportkamer W", x: 0.05, y: 4.50, z: 0.05, floor: 1, valid_rooms: ["sportkamer"] },
    18: { id: "ESP_Node_18", label: "Sportkamer O", x: 4.90, y: 3.00, z: 0.05, floor: 1, valid_rooms: ["sportkamer", "badkamer"] },
    19: { id: "ESP_Node_19", label: "Sportkamer OZ", x: 4.85, y: 3.00, z: 2.90, floor: 1, valid_rooms: ["sportkamer", "badkamer"] },
    2:  { id: "ESP_Node_2",  label: "Kantoor W", x: 0.05, y: 5.13, z: 6.10, floor: 1, valid_rooms: ["kantoor", "overloop"] },
    12: { id: "ESP_Node_12", label: "Kantoor M", x: 2.20, y: 3.63, z: 9.25, floor: 1, valid_rooms: ["kantoor", "overloop", "inloopkast"] },
    13: { id: "ESP_Node_13", label: "Kantoor O", x: 0.00, y: 5.13, z: 9.25, floor: 1, valid_rooms: ["kantoor"] },
    10: { id: "ESP_Node_10", label: "Inloopkast", x: 4.75, y: 3.60, z: 5.00, floor: 1, valid_rooms: ["inloopkast", "overloop", "badkamer"] },
    14: { id: "ESP_Node_14", label: "Inloopkast O", x: 4.90, y: 5.13, z: 9.25, floor: 1, valid_rooms: ["inloopkast"] },
    16: { id: "ESP_Node_16", label: "Inloopkast M", x: 2.30, y: 5.13, z: 9.25, floor: 1, valid_rooms: ["inloopkast", "kantoor"] },

    // ── Zolder ───────────────────────────────────────────────
    4:  { id: "ESP_Node_4",  label: "Slaapkamer M", x: 2.05, y: 5.90, z: 3.00, floor: 2, valid_rooms: ["slaapkamer", "waskamer"] },
    9:  { id: "ESP_Node_9",  label: "Waskamer O", x: 4.70, y: 6.40, z: 2.00, floor: 2, valid_rooms: ["waskamer", "slaapkamer"] },
    20: { id: "ESP_Node_20", label: "Slaapkamer O", x: 4.90, y: 5.90, z: 3.00, floor: 2, valid_rooms: ["slaapkamer"] },
    21: { id: "ESP_Node_21", label: "Slaapkamer OZ", x: 4.90, y: 7.66, z: 9.25, floor: 2, valid_rooms: ["slaapkamer"] },
    22: { id: "ESP_Node_22", label: "Slaapkamer WZ", x: 0.05, y: 7.66, z: 9.25, floor: 2, valid_rooms: ["slaapkamer"] },
    23: { id: "ESP_Node_23", label: "Waskamer W", x: 0.05, y: 7.40, z: 0.05, floor: 2, valid_rooms: ["waskamer"] },
};

// ── Kamerpolygonen per vloer ─────────────────────────────────
// Afgeleid uit house.yaml. Alleen indoor-kamers (no_wall: true = outdoor → weggelaten).
// Polygoon-formaat: [[x, y], ...]  (overeenkomend met house.yaml coördinaten)

const HOUSE_POLYGONS = {
    0: [  // Begane grond
        { id: "toilet", polygon: [[0, 0], [1.01, 0], [1.01, 1.01], [1.01, 1.30], [0, 1.30]] },
        { id: "meterkast", polygon: [[0, 1.30], [1.01, 1.30], [1.01, 1.79], [0, 1.79]] },
        { id: "hal", polygon: [[0, 1.79], [1.01, 1.79], [1.01, 0], [1.34, 0], [2.28, 0], [2.43, 0], [2.43, 2.94], [1.01, 2.94], [0, 2.94]] },
        { id: "keuken", polygon: [[2.43, 0], [4.95, 0], [4.95, 2.94], [2.43, 2.94]] },
        { id: "woonkamer", polygon: [[1.01, 2.94], [4.95, 2.94], [4.95, 11.22], [0, 11.22], [0, 6.07], [1.01, 6.07], [1.01, 2.94]] },
        { id: "kast", polygon: [[0, 2.94], [1.01, 2.94], [1.01, 6.07], [0, 6.07]] },
        { id: "Schuur", polygon: [[-1.19, -2.93], [1.01, -2.93], [1.01, 0], [0, 0], [-1.19, 0]] },
    ],
    1: [  // 1e verdieping
        { id: "sportkamer", polygon: [[0, 0], [4.95, 0], [4.95, 2.94], [0, 2.94]] },
        { id: "overloop", polygon: [[1.01, 2.94], [2.25, 2.94], [2.25, 6.07], [1.01, 6.07]] },
        { id: "badkamer", polygon: [[2.25, 2.94], [4.59, 2.94], [4.59, 4.96], [2.25, 4.96]] },
        { id: "inloopkast", polygon: [[2.25, 4.96], [4.95, 4.96], [4.95, 9.30], [2.25, 9.30]] },
        { id: "kantoor", polygon: [[0, 6.07], [2.25, 6.07], [2.25, 9.30], [0, 9.30]] },
    ],
    2: [  // Zolder
        { id: "waskamer", polygon: [[0, 0], [4.95, 0], [4.95, 2.94], [0, 2.94]] },
        { id: "slaapkamer", polygon: [[1.01, 2.94], [4.95, 2.94], [4.95, 9.30], [0, 9.30], [0, 6.07], [1.01, 6.07]] },
    ],
};

// ── Sensorgroepen ─────────────────────────────────────────────
// Sensoren die samen een gebied bewaken, ongeacht hun eigen kamer/vloer.
// min_sensors: minimaal aantal actieve sensoren in de groep voordat
//              de groepslocatie wordt gerapporteerd. Minder → elke sensor
//              valt terug op zijn eigen kamer (sportkamer / kantoor / trap).
const SENSOR_GROUPS = {
    overloop: { floor: 1, min_sensors: 2 },
};

// ── Opslaan in global context ─────────────────────────────────
global.set("radar_sensors", SENSORS);
global.set("house_polygons", HOUSE_POLYGONS);
global.set("sensor_groups", SENSOR_GROUPS);

// node.log("Radar config geladen: " + Object.keys(SENSORS).length + " sensoren, 3 vloeren.");
// return null;  // geen output nodig

msg.payload = {
    bericht: "Configuratie succesvol geladen",
    aantalSensoren: Object.keys(SENSORS).length
};
return msg;
