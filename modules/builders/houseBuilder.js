import * as THREE from 'three';
import { CSS2DObject } from 'css2drenderer';

const WALL_THICKNESS = 0.08;

// Floor material library - verschillende vloertypen
const FLOOR_MATERIALS = {
    'wood': {
        color: 0xc19a6b,
        roughness: 0.7,
        metalness: 0.0,
        name: 'Houten vloer'
    },
    'dark_wood': {
        color: 0x654321,
        roughness: 0.6,
        metalness: 0.0,
        name: 'Donker hout'
    },
    'tile': {
        color: 0x111111,
        roughness: 0.15,
        metalness: 0.05,
        name: 'Tegelvloer'
    },
    'marble': {
        color: 0xf5f5f5,
        roughness: 0.1,
        metalness: 0.3,
        name: 'Marmer'
    },
    'carpet': {
        color: 0xa89f91,
        roughness: 1.0,
        metalness: 0.0,
        name: 'Tapijt'
    },
    'concrete': {
        color: 0x808080,
        roughness: 0.9,
        metalness: 0.0,
        name: 'Beton'
    },
    'laminate': {
        color: 0xd4a574,
        roughness: 0.4,
        metalness: 0.05,
        name: 'Laminaat'
    },
    'tiles_anthracite': {
        color: 0x3a3a3a,
        roughness: 0.2,
        metalness: 0.1,
        name: 'Antraciet tegels'
    },
    'pebbles': {
        color: 0x6a6a60,
        roughness: 0.9,
        metalness: 0.0,
        name: 'Kiezelstenen'
    },
    'default': {
        color: 0xcccccc,
        roughness: 0.5,
        metalness: 0.0,
        name: 'Standaard'
    }
};

// --- HULPFUNCTIES ---
const dist = (p1, p2) => Math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2);

function isSameSeg(winEntry, p1, p2) {
    const seg = winEntry.segment || winEntry;
    if (!seg || seg.length < 2) return false;
    const a = seg[0], b = seg[1];
    const threshold = 0.05;
    return (dist(a, p1) < threshold && dist(b, p2) < threshold) ||
           (dist(a, p2) < threshold && dist(b, p1) < threshold);
}

// Check of een punt binnen een polygon ligt (ray casting algoritme)
function isPointInPolygon(point, polygon) {
    const [x, y] = point;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0], yi = polygon[i][1];
        const xj = polygon[j][0], yj = polygon[j][1];
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// Check of een trapgat overlapt met een kamer
function stairwellOverlapsRoom(stairwell, room) {
    // Check of minstens één punt van het trapgat binnen de kamer ligt
    return stairwell.polygon.some(point => isPointInPolygon(point, room.polygon));
}

export function calculateYBase(level, house) {
    if (!house) return 0;
    let y = 0;
    for (let i = 0; i < level; i++) {
        y += (house.floors[i].height || 2.6);
    }
    return y;
}

function getCeilingHeight(z, profile) {
    const pts = profile.points;
    for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        if (z >= a.z && z <= b.z) {
            const t = (z - a.z) / (b.z - a.z);
            return a.height + (b.height - a.height) * t;
        }
    }
    return pts[pts.length - 1].height;
}

// --- CORE BOUW FUNCTIES ---

function makeTextSprite(message) {
    const div = document.createElement('div');
    div.className = 'room-label-new';
    div.setAttribute('data-room-name', message);
    div.innerHTML = `<span class="status-dot" style="margin-right: 4px;"></span>${message}`;
    const label = new CSS2DObject(div);
        return label;
}

function createWindow(win, yBase) {
    const seg = win.segment || win;
    const start = seg[0], end = seg[1];
    const dx = end[0] - start[0], dy = end[1] - start[1];
    const len = Math.sqrt(dx * dx + dy * dy);
    const zMin = win.z_min !== undefined ? win.z_min : 0.9;
    const zMax = win.z_max !== undefined ? win.z_max : 2.1;
    const h = zMax - zMin;

    const glassLibrary = {
        "clear": { color: 0x88ccff, opacity: 0.2 },
        "black": { color: 0x111111, opacity: 0.8 },
        "smoke": { color: 0x444444, opacity: 0.2 }
    };
    const settings = glassLibrary[win.glass_type] || glassLibrary["clear"];
    const group = new THREE.Group();

    const glass = new THREE.Mesh(
        new THREE.BoxGeometry(len, h, 0.02),
        new THREE.MeshPhongMaterial({ color: settings.color, transparent: true, opacity: settings.opacity, side: THREE.DoubleSide, shininess: 100 })
    );
    glass.position.y = h / 2;
    group.add(glass);

    const frameMat = new THREE.MeshPhongMaterial({ color: 0xffffff });
    const frameT = 0.05, frameDepth = WALL_THICKNESS + 0.01;
    const horGeom = new THREE.BoxGeometry(len, frameT, frameDepth);
    const vertGeom = new THREE.BoxGeometry(frameT, h, frameDepth);

    const top = new THREE.Mesh(horGeom, frameMat); top.position.y = h; group.add(top);
    const bot = new THREE.Mesh(horGeom, frameMat); bot.position.y = 0; group.add(bot);
    const left = new THREE.Mesh(vertGeom, frameMat); left.position.set(-len/2 + frameT/2, h/2, 0); group.add(left);
    const right = new THREE.Mesh(vertGeom, frameMat); right.position.set(len/2 - frameT/2, h/2, 0); group.add(right);

    group.position.set((start[0] + end[0]) / 2, yBase + zMin, (start[1] + end[1]) / 2);
    group.rotation.y = -Math.atan2(dy, dx);
    return group;
}

function buildSlopedCeiling(room, yBase, profile) {
    const group = new THREE.Group();
    const material = new THREE.MeshPhongMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const zPoints = profile.points.map(p => p.z).sort((a, b) => a - b);
    const minX = Math.min(...room.polygon.map(p => p[0])), maxX = Math.max(...room.polygon.map(p => p[0]));

    for (let i = 0; i < zPoints.length - 1; i++) {
        const zStart = zPoints[i], zEnd = zPoints[i + 1];
        const shape = new THREE.Shape();
        shape.moveTo(minX, zStart); shape.lineTo(maxX, zStart);
        shape.lineTo(maxX, zEnd); shape.lineTo(minX, zEnd);
        const geom = new THREE.ShapeGeometry(shape);
        const pos = geom.attributes.position;
        for (let j = 0; j < pos.count; j++) {
            const z = pos.getY(j);
            pos.setY(j, yBase + getCeilingHeight(z, profile));
            pos.setZ(j, z);
        }
        geom.computeVertexNormals();
        group.add(new THREE.Mesh(geom, material));
    }
    return group;
}

// --- DE HOOFD BUILDER ---

export function buildHouse(houseData, state) {
    const houseGroup = new THREE.Group();

    houseData.floors.forEach(floor => {
        const layerGroup = new THREE.Group();
        const yBase = calculateYBase(floor.level, houseData);
        const wallMat = new THREE.MeshPhongMaterial({ color: 0xdddddd });
        const noFloorRooms = floor.rooms.filter(r => r.has_floor === false);

        // Voor het plafond: haal trapgaten van de VOLGENDE verdieping op
        const nextFloor = houseData.floors.find(f => f.level === floor.level + 1);
        const nextFloorStairwells = nextFloor ? nextFloor.rooms.filter(r => r.has_floor === false) : [];

        floor.rooms.forEach(room => {
            // Vloer/Plafond
            if (room.has_floor !== false) {
                // VLOER shape - met holes voor trapgaten op DEZE verdieping (alleen als ze overlappen)
                const floorShape = new THREE.Shape();
                room.polygon.forEach((p, i) => i === 0 ? floorShape.moveTo(p[0], p[1]) : floorShape.lineTo(p[0], p[1]));
                noFloorRooms.forEach(nfr => {
                    // Alleen hole toevoegen als trapgat overlapt met deze kamer
                    if (stairwellOverlapsRoom(nfr, room)) {
                        const hole = new THREE.Path();
                        nfr.polygon.forEach((p, i) => i === 0 ? hole.moveTo(p[0], p[1]) : hole.lineTo(p[0], p[1]));
                        floorShape.holes.push(hole);
                    }
                });

                // VLOER (floor) - op grondniveau van deze verdieping
                // Kies het juiste materiaal op basis van floor_type
                const floorType = room.floor_type || 'default';
                const floorMaterial = FLOOR_MATERIALS[floorType] || FLOOR_MATERIALS['default'];

                // Create tiled floor for tiles_anthracite
                if (floorType === 'tiles_anthracite' && room.tile_size) {
                    const tileSize = room.tile_size || 0.6; // 60cm default
                    const tileGap = 0.005; // 5mm gap between tiles

                    // Get bounds of the polygon
                    const minX = Math.min(...room.polygon.map(p => p[0]));
                    const maxX = Math.max(...room.polygon.map(p => p[0]));
                    const minZ = Math.min(...room.polygon.map(p => p[1]));
                    const maxZ = Math.max(...room.polygon.map(p => p[1]));

                    // Create tiles in grid pattern
                    for (let x = minX; x < maxX; x += tileSize) {
                        for (let z = minZ; z < maxZ; z += tileSize) {
                            const tileCenterX = x + tileSize / 2;
                            const tileCenterZ = z + tileSize / 2;

                            // Check if tile center is inside polygon
                            if (isPointInPolygon([tileCenterX, tileCenterZ], room.polygon)) {
                                const tileGeo = new THREE.PlaneGeometry(
                                    tileSize - tileGap,
                                    tileSize - tileGap
                                );
                                const tileMat = new THREE.MeshPhongMaterial({
                                    color: floorMaterial.color,
                                    side: THREE.DoubleSide,
                                    shininess: floorMaterial.metalness > 0 ? 30 : 5
                                });
                                const tileMesh = new THREE.Mesh(tileGeo, tileMat);
                                tileMesh.rotation.x = Math.PI / 2;
                                tileMesh.position.set(tileCenterX, yBase + 0.002, tileCenterZ);
                                tileMesh.userData.floorType = floorType;
                                tileMesh.userData.roomId = room.id;
                                layerGroup.add(tileMesh);
                                state.allFloors.push(tileMesh);
                            }
                        }
                    }
                } else {
                    // Regular floor mesh
                    const floorMesh = new THREE.Mesh(
                        new THREE.ShapeGeometry(floorShape),
                        new THREE.MeshPhongMaterial({
                            color: floorMaterial.color,
                            side: THREE.DoubleSide,
                            shininess: floorMaterial.metalness > 0 ? 30 : 5
                        })
                    );
                    floorMesh.rotation.x = Math.PI / 2;
                    floorMesh.position.y = yBase + 0.002;  // Iets hoger dan yBase
                    floorMesh.userData.floorType = floorType;
                    floorMesh.userData.roomId = room.id;
                    layerGroup.add(floorMesh);
                    state.allFloors.push(floorMesh);
                }

                // PLAFOND (ceiling) - aan bovenkant van deze verdieping
                // Skip ceiling for outdoor rooms (height=0 or no_wall=true)
                const roomHeight = room.height !== undefined ? room.height : (floor.height || 2.6);
                if (roomHeight === 0 || room.no_wall === true) {
                    // No ceiling for outdoor areas
                } else if (floor.ceiling_profile) {
                    const sloped = buildSlopedCeiling(room, yBase, floor.ceiling_profile);
                    layerGroup.add(sloped);
                    state.allFloors.push(sloped);
                } else {
                    const ceilingShape = new THREE.Shape();
                    room.polygon.forEach((p, i) => i === 0 ? ceilingShape.moveTo(p[0], p[1]) : ceilingShape.lineTo(p[0], p[1]));
                    // Voeg holes toe voor trapgaten op DEZE verdieping (alleen als ze overlappen)
                    noFloorRooms.forEach(nfr => {
                        if (stairwellOverlapsRoom(nfr, room)) {
                            const hole = new THREE.Path();
                            nfr.polygon.forEach((p, i) => i === 0 ? hole.moveTo(p[0], p[1]) : hole.lineTo(p[0], p[1]));
                            ceilingShape.holes.push(hole);
                        }
                    });
                    // Voeg holes toe voor trapgaten van de VOLGENDE verdieping (alleen als ze overlappen)
                    nextFloorStairwells.forEach(stairwell => {
                        if (stairwellOverlapsRoom(stairwell, room)) {
                            const hole = new THREE.Path();
                            stairwell.polygon.forEach((p, i) => i === 0 ? hole.moveTo(p[0], p[1]) : hole.lineTo(p[0], p[1]));
                            ceilingShape.holes.push(hole);
                        }
                    });

                    const ceil = new THREE.Mesh(
                        new THREE.ShapeGeometry(ceilingShape),
                        new THREE.MeshPhongMaterial({
                            color: 0xeeeeee,
                            side: THREE.DoubleSide
                        })
                    );
                    ceil.rotation.x = Math.PI / 2;
                    ceil.position.y = yBase + (floor.height || 2.6) - 0.002;  // Iets lager dan yBase + height
                    layerGroup.add(ceil);
                    state.allFloors.push(ceil);
                }
            }

            // Labels
            if (room.label || room.name) {
                const label = makeTextSprite(room.label || room.name);
                let cx = 0, cz = 0;
                room.polygon.forEach(p => { cx += p[0]; cz += p[1]; });
                label.position.set(cx / room.polygon.length, yBase + (floor.height || 2.6) - 0.3, cz / room.polygon.length);
                layerGroup.add(label);
                state.labelSprites.push(label);
            }

            // Muren & Ramen - skip for outdoor rooms (no_wall: true)
            if (room.no_wall === true) return;
            const poly = room.polygon;
            const windows = room.windows || [];
            const openSegments = [...(room.no_walls || []), ...(room.doors || [])];

            for (let i = 0; i < poly.length; i++) {
                const start = poly[i], end = poly[(i + 1) % poly.length];
                if (openSegments.some(seg => isSameSeg(seg, start, end))) continue;

                const dx = end[0]-start[0], dy = end[1]-start[1], len = Math.sqrt(dx*dx+dy*dy);
                const winData = windows.find(win => isSameSeg(win, start, end));

                if (winData) {
                    const windowObj = createWindow(winData, yBase);
                    layerGroup.add(windowObj);
                    state.allWindows.push(windowObj);

                    const zMin = winData.z_min ?? 0.9, zMax = winData.z_max ?? 2.1;
                    const addFiller = (hS, hH) => {
                        if (hH <= 0.01) return;
                        const filler = new THREE.Mesh(new THREE.BoxGeometry(len, hH, WALL_THICKNESS), wallMat);
                        filler.position.set((start[0]+end[0])/2, yBase + hS + (hH/2), (start[1]+end[1])/2);
                        filler.rotation.y = -Math.atan2(dy, dx);
                        filler.visible = state.wallsFullHeight;
                        layerGroup.add(filler);
                        state.allWalls.push(filler);
                        state.allWallData.push({ mesh: filler, start, end, yBase, fullHeight: hH, layerGroup, floor, isFiller: true });
                    };
                    addFiller(0, zMin);
                    addFiller(zMax, (floor.height || 2.6) - zMax);
                }

                const wall = new THREE.Mesh(new THREE.BoxGeometry(len, 0.2, WALL_THICKNESS), wallMat);
                wall.position.set((start[0]+end[0])/2, yBase + 0.1, (start[1]+end[1])/2);
                wall.rotation.y = -Math.atan2(dy, dx);
                if (!winData) layerGroup.add(wall);
                state.allWalls.push(wall);
                state.allWallData.push({ mesh: wall, start, end, yBase, fullHeight: floor.height || 2.6, layerGroup, floor, hasWindow: !!winData });
            }
        });
        state.floorGroups[floor.level] = layerGroup;
        houseGroup.add(layerGroup);
    });
    // --- TRAPPEN ---
    buildStairs(houseData, houseGroup);

    state.scene.add(houseGroup);
}

// --- TRAP BUILDER ---
function buildStairs(_, parentGroup) {
    const material = new THREE.MeshPhongMaterial({ color: 0x654321 }); // dark_wood
    const stairsGroup = new THREE.Group();
    stairsGroup.name = 'stairs';

    // Helper: create a single step (solid block from baseY to top)
    function addStep(x, baseY, z, w, h, d) {
        const geom = new THREE.BoxGeometry(w, h, d);
        const mesh = new THREE.Mesh(geom, material);
        mesh.position.set(x, baseY + h / 2, z);
        stairsGroup.add(mesh);
    }

    // Helper: create a landing platform
    function addLanding(x, y, z, w, d) {
        const thickness = 0.05;
        const geom = new THREE.BoxGeometry(w, thickness, d);
        const mesh = new THREE.Mesh(geom, material);
        mesh.position.set(x, y - thickness / 2, z);
        stairsGroup.add(mesh);
    }

    // === TRAP 1: Begane grond (y=0) → Eerste verdieping (y=2.63) ===
    // Start between Hal and Kast at z=2.7, full width x=0.04-0.97
    // Main run goes south (z+) to z=4.8 at y=1.785
    // Left turn 90° then climbs east to exit at [1.01, 5.14]-[1.01, 6.07] at y=2.63
    {
        const riser = 2.63 / 15;
        const stairW = 0.93; // x: 0.04 to 0.97
        const stairCenterX = 0.505;

        // Main run: 10 steps going south (z increasing), full width
        const mainTread = 0.21; // (4.8 - 2.7) / 10
        for (let i = 0; i < 10; i++) {
            addStep(
                stairCenterX,               // x center
                i * riser,                  // y base
                2.7 + i * mainTread,        // z going south
                stairW,                     // width (x)
                riser,                      // height
                mainTread                   // depth (z)
            );
        }

        // Quarter-turn: 5 winder steps fanning 90° around inner pivot
        // Pivot at inner corner (0.97, 4.80) in scene (x, z)
        // Shape XY maps to scene XZ: shape X = scene X offset, shape Y = scene Z offset
        // Wide end sweeps from west (angle π in shape = -X = toward x=0.04)
        //   to south (angle π/2 in shape = +Y = toward z=5.73)
        const landingY = 10 * riser; // ~1.753
        const pivotX = 0.97;
        const pivotZ = 4.80;
        const innerR = 0.06;
        const outerR = 0.93; // reaches x=0.04 at angle π
        const totalAngle = Math.PI / 2; // 90 degrees
        const stepAngle = totalAngle / 5;

        for (let i = 0; i < 5; i++) {
            // Sweep from π (west, continuing straight run) to π/2 (south, toward exit)
            const startAngle = Math.PI - i * stepAngle;
            const endAngle = Math.PI - (i + 1) * stepAngle;

            // Create pie-slice shape
            const shape = new THREE.Shape();
            // Start at inner arc start point
            shape.moveTo(
                innerR * Math.cos(startAngle),
                innerR * Math.sin(startAngle)
            );
            // Line to outer arc start point
            shape.lineTo(
                outerR * Math.cos(startAngle),
                outerR * Math.sin(startAngle)
            );
            // Arc along outer edge (clockwise = negative angle)
            shape.absarc(0, 0, outerR, startAngle, endAngle, true);
            // Line to inner arc end point
            shape.lineTo(
                innerR * Math.cos(endAngle),
                innerR * Math.sin(endAngle)
            );
            // Arc back along inner edge (counter-clockwise)
            shape.absarc(0, 0, innerR, endAngle, startAngle, false);

            // Extrude upward by riser height (matches solid box steps)
            const extrudeSettings = { depth: riser, bevelEnabled: false };
            const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);

            // Rotation π/2 around X maps: shape X→scene X, shape Y→scene Z, extrude Z→scene Y
            const mesh = new THREE.Mesh(geom, material);
            mesh.rotation.x = Math.PI / 2;
            mesh.position.set(pivotX, landingY + i * riser, pivotZ);

            stairsGroup.add(mesh);
        }
    }

    parentGroup.add(stairsGroup);
}