// ============================================================
// RADAR POSITIONING ENGINE: MESH & VALID ROOMS
// ============================================================

const CFG = {
    STALE_PRES_MS: 5000,
    STALE_ABS_MS: 3000,
    DIST_UNIT: 0.01,
    MAX_DETECT_RANGE_M: 6.0,
    PERSON_HEIGHT_M: 0.90
};

const FLOOR_Z = { 0: 0.00, 1: 2.63, 2: 5.26 };

// --- Hulpfuncties ---

function to2D(dist3D, sensorH, floor) {
    const personAbsH = (FLOOR_Z[floor] || 0) + CFG.PERSON_HEIGHT_M;
    const dh = Math.abs(sensorH - personAbsH);
    // Beveiliging tegen negatieve getallen onder de wortel (NaN)
    if (dist3D <= dh) return 0.15;
    return Math.sqrt(Math.max(0.01, Math.pow(dist3D, 2) - Math.pow(dh, 2)));
}

function pointInPolygon(px, py, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [xi, yi] = polygon[i]; const [xj, yj] = polygon[j];
        if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
}

function classifyPosition(x, y, floor, housePolygons) {
    const rooms = housePolygons[floor] || [];
    for (const room of rooms) {
        if (pointInPolygon(x, y, room.polygon)) return room.id;
    }
    return null;
}

function trilaterateThreePlus(sensors) {
    let x = 0, y = 0, tw = 0;
    for (const s of sensors) {
        const w = 1 / (s.r + 0.01);
        x += s.x * w; y += s.y * w; tw += w;
    }
    x /= tw; y /= tw;

    for (let iter = 0; iter < 15; iter++) {
        let dx = 0, dy = 0, tw2 = 0;
        for (const s of sensors) {
            const d = Math.hypot(x - s.x, y - s.y);
            if (d < 1e-6) continue;
            const residual = d - s.r;
            const w = 1 / (d + 0.1);
            dx += w * residual * (x - s.x) / d;
            dy += w * residual * (y - s.y) / d;
            tw2 += w;
        }
        if (tw2 < 1e-9) break;
        x -= dx / tw2; y -= dy / tw2;
    }
    return { x, y };
}

// --- De door jou gevraagde logica ---

function locateInRoom(activeSensors, floor, housePolygons) {
    const n = activeSensors.length;
    const y3d = Math.round((FLOOR_Z[floor] + CFG.PERSON_HEIGHT_M) * 1000) / 1000;
    let pt = { x: 0, y: 0 };
    let source = "";

    const sensorInput = activeSensors.map(e => ({
        x: e.sensor.x, y: e.sensor.z, r: to2D(e.dist, e.sensor.y, floor)
    }));

    if (n === 1) {
        // Fallback bij 1 sensor
        pt = { x: activeSensors[0].sensor.x, y: activeSensors[0].sensor.z + 0.5 };
        source = "1-sensor-est";
    } else {
        pt = trilaterateThreePlus(sensorInput);
        source = "trilateration-multi";
    }

    if (isNaN(pt.x) || isNaN(pt.y)) return null;

    const detectedRoom = classifyPosition(pt.x, pt.y, floor, housePolygons);

    // Check of een van de actieve sensoren deze kamer "mag" zien
    const isValidForRoom = activeSensors.some(s =>
        s.sensor.valid_rooms && s.sensor.valid_rooms.includes(detectedRoom)
    );

    return {
        x: Math.round(pt.x * 1000) / 1000,
        y: y3d,
        z: Math.round(pt.y * 1000) / 1000,
        room: detectedRoom || "OUTSIDE_AREA",
        floor,
        confidence: isValidForRoom ? 1.0 : 0.5,
        source
    };
}

// --- Hoofd Handler ---

const SENSORS = global.get("radar_sensors");
const HOUSE_POLYGONS = global.get("house_polygons");
if (!SENSORS || !HOUSE_POLYGONS) return null;

let sensorState = context.get("sensorState") || {};
const now = Date.now();
const payload = msg.payload;

if (payload && payload.node !== undefined) {
    const sensor = SENSORS[payload.node];
    if (sensor) {
        sensorState[payload.node] = {
            sensor,
            dist: Math.max(0, payload.dist || 0) * CFG.DIST_UNIT,
            pres: !!payload.pres,
            timestamp: now
        };
    }
}

// Cleanup
for (const key in sensorState) {
    if (now - sensorState[key].timestamp > (sensorState[key].pres ? CFG.STALE_PRES_MS : CFG.STALE_ABS_MS)) delete sensorState[key];
}
context.set("sensorState", sensorState);

// Mesh per vloer
const byFloor = {};
let hasPresence = false;
for (const entry of Object.values(sensorState)) {
    if (entry.pres) {
        hasPresence = true;
        if (!byFloor[entry.sensor.floor]) byFloor[entry.sensor.floor] = [];
        byFloor[entry.sensor.floor].push(entry);
    }
}

if (!hasPresence) {
    msg.payload = { presence: false, persons: [], updatedAt: now };
    return msg;
}

const persons = [];
for (const [floor, sensors] of Object.entries(byFloor)) {
    const res = locateInRoom(sensors, parseInt(floor), HOUSE_POLYGONS);
    if (res) persons.push(res);
}

const finalPersons = persons.sort((a, b) => b.confidence - a.confidence).slice(0, 3);

msg.payload = {
    presence: true,
    persons: finalPersons,
    updatedAt: now
};

return msg;