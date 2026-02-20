import * as THREE from 'three';
import { gsap } from 'gsap';

// =============================================
// SHARED GEOMETRIES (created once, reused by all instances)
// =============================================

// Radar beacon
const _beaconCoreGeo = new THREE.SphereGeometry(0.08, 16, 16);
const _beaconRingGeo = new THREE.SphereGeometry(0.1, 16, 16);

// Transparent bulb
const _bulbGlassGeo = new THREE.SphereGeometry(0.05, 24, 24);
const _bulbFilamentGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.04, 8);
const _bulbBaseGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.02, 16);

// Sphere lamp
const _sphereBaseGeo = new THREE.CylinderGeometry(0.10, 0.12, 0.04, 24);
const _sphereBodyGeo = new THREE.SphereGeometry(0.175, 24, 24);
const _sphereGlowGeo = new THREE.RingGeometry(0.18, 0.50, 32);

// Recessed spot
const _recessedRingGeo = new THREE.RingGeometry(0.06, 0.09, 32);
const _recessedHousingGeo = new THREE.CylinderGeometry(0.058, 0.058, 0.001, 32);
const _recessedLensGeo = new THREE.CircleGeometry(0.058, 32);
const _recessedGlowGeo = new THREE.RingGeometry(0.058, 0.12, 32);

// Cylinder spot
const _cylinderPlateGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.015, 32);
const _cylinderBodyGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.15, 32);
const _cylinderCapGeo = new THREE.CylinderGeometry(0.048, 0.045, 0.02, 32);
const _cylinderLensGeo = new THREE.CircleGeometry(0.042, 32);
const _cylinderGlowGeo = new THREE.RingGeometry(0.042, 0.09, 32);

// =============================================
// SHARED MATERIALS (static parts that never change color)
// =============================================

const _beaconCoreMat = new THREE.MeshStandardMaterial({ color: 0x00aaff, emissive: 0x00ff00, emissiveIntensity: 3 });
const _bulbBaseMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 1, roughness: 0.2 });
const _sphereBaseMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.8, roughness: 0.3 });
const _recessedRingMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9, roughness: 0.2 });
const _recessedHousingMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.3, roughness: 0.8 });
const _cylinderPlateMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.8, roughness: 0.3 });
const _cylinderBodyMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.7, roughness: 0.4 });
// capMat is identical to plateMat, reuse it
const _cylinderCapMat = _cylinderPlateMat;

// =============================================
// REUSABLE COLOR OBJECTS (for updateSpotAppearance hot path)
// =============================================
const _tmpBaseColor = new THREE.Color();
const _tmpBrightColor = new THREE.Color();

/**
 * Creates a radar beacon with a pulsing effect in the Office
 */
export function createRadarBeacon() {
    const group = new THREE.Group();

    const core = new THREE.Mesh(_beaconCoreGeo, _beaconCoreMat);
    group.add(core);

    // Ring needs per-instance material (animated opacity)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.6 });
    const ring = new THREE.Mesh(_beaconRingGeo, ringMat);
    group.add(ring);

    gsap.to(ring.scale, { x: 4, y: 4, z: 4, duration: 2, repeat: -1, ease: "power2.out" });
    gsap.to(ringMat, { opacity: 0, duration: 2, repeat: -1, ease: "power2.out" });

    return group;
}

/**
 * Creates a transparent glass bulb with a filament inside
 */
export function createTransparentBulb() {
    const group = new THREE.Group();
    group.name = 'transparent_bulb';

    // Per-instance materials (lens/glow change with lamp state)
    const glassMat = new THREE.MeshStandardMaterial({
        color: 0x111111, transparent: true, opacity: 0.4,
        emissive: 0x000000, emissiveIntensity: 0, metalness: 0.1, roughness: 0.1
    });
    const glass = new THREE.Mesh(_bulbGlassGeo, glassMat);
    glass.position.y = 0.05;
    group.add(glass);

    const filamentMat = new THREE.MeshBasicMaterial({ color: 0x000000, toneMapped: false });
    const filament = new THREE.Mesh(_bulbFilamentGeo, filamentMat);
    filament.position.y = 0.05;
    filament.name = 'filament';
    group.add(filament);

    const base = new THREE.Mesh(_bulbBaseGeo, _bulbBaseMat);
    base.position.y = 0.005;
    group.add(base);

    group.userData.updateMaterials = { lens: filamentMat, glow: glassMat };
    return group;
}

/**
 * Creates a light tube (lichtslang)
 * @param {number} length - Lengte in meters
 */
export function createLightTube(length = 1) {
    const group = new THREE.Group();
    group.name = `light_tube_${length}m`;

    // Tube geometry depends on length, so per-instance
    const tubeGeo = new THREE.CylinderGeometry(0.015, 0.015, length, 16);
    const tubeMat = new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0.9, toneMapped: false
    });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    tube.rotation.z = Math.PI / 2;
    tube.name = 'tube_body';
    group.add(tube);

    const glowGeo = new THREE.PlaneGeometry(length, 0.15);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0, side: THREE.DoubleSide
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.02;
    glow.name = 'glow';
    group.add(glow);

    group.userData.isLightTube = true;
    group.userData.updateMaterials = { lens: tubeMat, glow: glowMat };
    return group;
}

/**
 * Creates a circular light tube (ring lamp)
 * @param {number} diameter - Diameter in meters (default 0.15)
 */
export function createLightRing(diameter = 0.15) {
    const group = new THREE.Group();
    group.name = `light_ring_${diameter}m`;

    const radius = diameter / 2;
    const tubeRadius = 0.015;

    const ringGeo = new THREE.TorusGeometry(radius, tubeRadius, 16, 64);
    const ringMat = new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0.9, toneMapped: false
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.name = 'tube_body';
    group.add(ring);

    // Circular glow — use a flat torus so it shares the same default plane as the ring
    const glowGeo = new THREE.TorusGeometry(radius, radius * 0.6, 4, 64);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0, side: THREE.DoubleSide
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.name = 'glow';
    group.add(glow);

    group.userData.isLightTube = true;
    group.userData.updateMaterials = { lens: ringMat, glow: glowMat };
    return group;
}

/**
 * Creates a floor sphere lamp (bollamp op de grond)
 */
export function createSphereLamp() {
    const group = new THREE.Group();
    group.name = 'sphere_lamp';

    const base = new THREE.Mesh(_sphereBaseGeo, _sphereBaseMat);
    base.position.y = 0.02;
    base.name = 'base';
    group.add(base);

    // Per-instance materials (change with lamp state)
    const sphereMat = new THREE.MeshStandardMaterial({
        color: 0x000000, transparent: true, opacity: 0.9,
        emissive: 0x000000, metalness: 0.1, roughness: 0.2
    });
    const sphere = new THREE.Mesh(_sphereBodyGeo, sphereMat);
    sphere.position.y = 0.175;
    sphere.name = 'sphere_body';
    group.add(sphere);

    const glowMat = new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0, side: THREE.DoubleSide
    });
    const glow = new THREE.Mesh(_sphereGlowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.001;
    glow.name = 'glow';
    group.add(glow);

    group.userData.updateMaterials = { lens: sphereMat, glow: glowMat };
    return group;
}

/**
 * Creates a recessed ceiling spot light (inbouwspot)
 */
export function createRecessedSpot() {
    const group = new THREE.Group();
    group.name = 'recessed_spot';

    const ring = new THREE.Mesh(_recessedRingGeo, _recessedRingMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0;
    ring.name = 'trim_ring';
    group.add(ring);

    const housing = new THREE.Mesh(_recessedHousingGeo, _recessedHousingMat);
    housing.position.y = 0.0005;
    housing.name = 'housing';
    group.add(housing);

    // Per-instance materials (change with lamp state)
    const lensMat = new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: false, side: THREE.DoubleSide, toneMapped: false
    });
    const lens = new THREE.Mesh(_recessedLensGeo, lensMat);
    lens.rotation.x = -Math.PI / 2;
    lens.position.y = -0.02;
    lens.name = 'lens';
    group.add(lens);

    const glowMat = new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0, side: THREE.DoubleSide
    });
    const glow = new THREE.Mesh(_recessedGlowGeo, glowMat);
    glow.rotation.x = Math.PI / 2;
    glow.position.y = -0.025;
    glow.name = 'glow';
    group.add(glow);

    group.userData.updateMaterials = { lens: lensMat, glow: glowMat };
    return group;
}

/**
 * Creates a cylinder spot light (opbouwspot)
 */
export function createCylinderSpot() {
    const group = new THREE.Group();
    group.name = 'cylinder_spot';

    const plate = new THREE.Mesh(_cylinderPlateGeo, _cylinderPlateMat);
    plate.position.y = 0.0075;
    plate.name = 'mounting_plate';
    group.add(plate);

    const cylinder = new THREE.Mesh(_cylinderBodyGeo, _cylinderBodyMat);
    cylinder.position.y = -0.085;
    cylinder.name = 'cylinder_body';
    group.add(cylinder);

    const cap = new THREE.Mesh(_cylinderCapGeo, _cylinderCapMat);
    cap.position.y = -0.17;
    cap.name = 'bottom_cap';
    group.add(cap);

    // Per-instance materials (change with lamp state)
    const lensMat = new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: false, side: THREE.DoubleSide, toneMapped: false
    });
    const lens = new THREE.Mesh(_cylinderLensGeo, lensMat);
    lens.rotation.x = -Math.PI / 2;
    lens.position.y = -0.181;
    lens.name = 'lens';
    group.add(lens);

    const glowMat = new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0, side: THREE.DoubleSide
    });
    const glow = new THREE.Mesh(_cylinderGlowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.182;
    glow.name = 'glow';
    group.add(glow);

    group.userData.updateMaterials = { lens: lensMat, glow: glowMat };
    return group;
}

/**
 * Creates a 4U UniFi rack: Patch Panel + Dream Machine + 24-port Switch + NAS
 * Dimensions: 50cm wide, 18cm high, 30cm deep
 */
export function createServerRack() {
    const group = new THREE.Group();
    group.name = 'server_rack_4u';

    const W = 0.50, H = 0.18, D = 0.30;
    const U = H / 4; // 1U height = 0.045m
    const FZ = D / 2; // front z

    // === SHARED MATERIALS ===
    // UniFi signature silver-gray
    const uiSilver = new THREE.MeshStandardMaterial({
        color: 0xd0d0d4, metalness: 0.85, roughness: 0.18
    });
    const uiDarkSilver = new THREE.MeshStandardMaterial({
        color: 0x9a9a9e, metalness: 0.8, roughness: 0.22
    });
    const uiBlack = new THREE.MeshStandardMaterial({
        color: 0x1a1a1c, metalness: 0.7, roughness: 0.3
    });
    const uiBack = new THREE.MeshStandardMaterial({
        color: 0x111113, metalness: 0.6, roughness: 0.5
    });
    const screwMat = new THREE.MeshStandardMaterial({
        color: 0x777777, metalness: 1.0, roughness: 0.1
    });
    const portMat = new THREE.MeshStandardMaterial({
        color: 0x222224, metalness: 0.6, roughness: 0.4
    });
    const blueLedMat = new THREE.MeshBasicMaterial({
        color: 0x0066ff, toneMapped: false
    });

    // Shared geometries
    const screwGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.004, 8);
    const ledGeo = new THREE.CircleGeometry(0.003, 8);
    const ethPortGeo = new THREE.BoxGeometry(0.012, 0.010, 0.004);

    // === OUTER SHELL (rack frame) ===
    const shellMat = new THREE.MeshStandardMaterial({
        color: 0x2a2a2e, metalness: 0.75, roughness: 0.3
    });

    const sideL = new THREE.Mesh(new THREE.BoxGeometry(0.002, H, D), shellMat);
    sideL.position.set(-W / 2, H / 2, 0);
    group.add(sideL);

    const sideR = new THREE.Mesh(new THREE.BoxGeometry(0.002, H, D), shellMat);
    sideR.position.set(W / 2, H / 2, 0);
    group.add(sideR);

    const topPanel = new THREE.Mesh(new THREE.BoxGeometry(W, 0.002, D), shellMat);
    topPanel.position.set(0, H, 0);
    group.add(topPanel);

    const bottomPanel = new THREE.Mesh(new THREE.BoxGeometry(W, 0.002, D), shellMat);
    bottomPanel.position.set(0, 0, 0);
    group.add(bottomPanel);

    const backPanel = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.002), uiBack);
    backPanel.position.set(0, H / 2, -D / 2);
    group.add(backPanel);

    // Rack rails (vertical strips on front sides)
    const railMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, metalness: 0.9, roughness: 0.15 });
    const railGeo = new THREE.BoxGeometry(0.012, H, 0.003);

    const railL = new THREE.Mesh(railGeo, railMat);
    railL.position.set(-W / 2 + 0.006, H / 2, FZ + 0.001);
    group.add(railL);

    const railR = new THREE.Mesh(railGeo, railMat);
    railR.position.set(W / 2 - 0.006, H / 2, FZ + 0.001);
    group.add(railR);

    // Helper: add rack screws for a unit at given Y base
    function addScrews(yBase, uHeight) {
        const sy = yBase + uHeight / 2;
        const s1 = new THREE.Mesh(screwGeo, screwMat);
        s1.rotation.x = Math.PI / 2;
        s1.position.set(-W / 2 + 0.006, sy, FZ + 0.004);
        group.add(s1);
        const s2 = new THREE.Mesh(screwGeo, screwMat);
        s2.rotation.x = Math.PI / 2;
        s2.position.set(W / 2 - 0.006, sy, FZ + 0.004);
        group.add(s2);
    }

    // Helper: UniFi blue LED strip across front of a unit
    function addBlueLedStrip(yPos, width) {
        const strip = new THREE.Mesh(
            new THREE.BoxGeometry(width, 0.002, 0.001),
            blueLedMat
        );
        strip.position.set(0, yPos, FZ + 0.003);
        group.add(strip);
    }

    // =============================================
    // UNIT 1 (bottom): PATCH PANEL — 1U
    // =============================================
    const pp_y = 0.001;
    // Front plate
    const ppFront = new THREE.Mesh(new THREE.BoxGeometry(W - 0.026, U - 0.004, 0.003), uiSilver);
    ppFront.position.set(0, pp_y + U / 2, FZ);
    group.add(ppFront);
    addScrews(pp_y, U);

    // 24 keystone ports (2 rows of 12)
    const keystoneMat = new THREE.MeshStandardMaterial({ color: 0x333336, metalness: 0.5, roughness: 0.5 });
    const keystoneGeo = new THREE.BoxGeometry(0.013, 0.012, 0.003);
    for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 12; col++) {
            const kx = -0.175 + col * 0.0155;
            const ky = pp_y + 0.010 + row * 0.018;
            const ks = new THREE.Mesh(keystoneGeo, keystoneMat);
            ks.position.set(kx + 0.008, ky + 0.006, FZ + 0.003);
            group.add(ks);
            // Port hole (dark inset)
            const hole = new THREE.Mesh(
                new THREE.BoxGeometry(0.008, 0.007, 0.001),
                new THREE.MeshBasicMaterial({ color: 0x0a0a0a })
            );
            hole.position.set(kx + 0.008, ky + 0.006, FZ + 0.005);
            group.add(hole);
        }
    }

    // Port number labels area (subtle lighter strip)
    const labelStrip = new THREE.Mesh(
        new THREE.BoxGeometry(W * 0.72, 0.003, 0.001),
        new THREE.MeshStandardMaterial({ color: 0x444448, metalness: 0.4, roughness: 0.6 })
    );
    labelStrip.position.set(0.01, pp_y + U / 2 + 0.001, FZ + 0.004);
    group.add(labelStrip);

    // =============================================
    // UNIT 2: DREAM MACHINE SPECIAL EDITION — 1U
    // =============================================
    const dm_y = U + 0.001;
    // Front plate — signature UniFi silver
    const dmFront = new THREE.Mesh(new THREE.BoxGeometry(W - 0.026, U - 0.004, 0.004), uiSilver);
    dmFront.position.set(0, dm_y + U / 2, FZ);
    group.add(dmFront);
    addScrews(dm_y, U);

    // Blue LED strip (the UniFi signature)
    addBlueLedStrip(dm_y + U - 0.005, W * 0.65);

    // Ventilation pattern (subtle horizontal lines)
    const ventSlitMat = new THREE.MeshStandardMaterial({ color: 0xb8b8bc, metalness: 0.7, roughness: 0.3 });
    for (let i = 0; i < 6; i++) {
        const slit = new THREE.Mesh(
            new THREE.BoxGeometry(W * 0.3, 0.001, 0.001),
            ventSlitMat
        );
        slit.position.set(-0.06, dm_y + 0.008 + i * 0.005, FZ + 0.003);
        group.add(slit);
    }

    // Status LED (small white dot)
    const dmLed = new THREE.Mesh(ledGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
    dmLed.position.set(W / 2 - 0.03, dm_y + U / 2, FZ + 0.004);
    dmLed.name = 'led_dm_status';
    group.add(dmLed);

    // UniFi logo area (subtle emboss)
    const logoMat = new THREE.MeshStandardMaterial({ color: 0xc8c8cc, metalness: 0.9, roughness: 0.1 });
    const logo = new THREE.Mesh(new THREE.CircleGeometry(0.008, 16), logoMat);
    logo.position.set(W / 2 - 0.05, dm_y + U / 2, FZ + 0.003);
    group.add(logo);

    // =============================================
    // UNIT 3: 24-PORT SWITCH — 1U
    // =============================================
    const sw_y = 2 * U + 0.001;
    // Front plate — slightly darker silver
    const swFront = new THREE.Mesh(new THREE.BoxGeometry(W - 0.026, U - 0.004, 0.004), uiDarkSilver);
    swFront.position.set(0, sw_y + U / 2, FZ);
    group.add(swFront);
    addScrews(sw_y, U);

    // Blue LED strip
    addBlueLedStrip(sw_y + U - 0.005, W * 0.65);

    // 24 ethernet ports (single row)
    const portInnerMat = new THREE.MeshBasicMaterial({ color: 0x080808 });
    for (let i = 0; i < 24; i++) {
        const px = -0.19 + i * 0.0165;
        const py = sw_y + U / 2 - 0.005;
        const port = new THREE.Mesh(ethPortGeo, portMat);
        port.position.set(px, py, FZ + 0.003);
        group.add(port);
        // Inner dark hole
        const inner = new THREE.Mesh(
            new THREE.BoxGeometry(0.008, 0.006, 0.001),
            portInnerMat
        );
        inner.position.set(px, py, FZ + 0.006);
        group.add(inner);
    }

    // Port activity LEDs (tiny green dots above each port)
    const portLedMat = new THREE.MeshBasicMaterial({ color: 0x00cc44, toneMapped: false });
    const portLedGeo = new THREE.CircleGeometry(0.0015, 6);
    for (let i = 0; i < 24; i++) {
        const px = -0.19 + i * 0.0165;
        const led = new THREE.Mesh(portLedGeo, portLedMat);
        led.position.set(px, sw_y + U / 2 + 0.008, FZ + 0.004);
        group.add(led);
    }

    // SFP+ ports (2 on the right side)
    const sfpMat = new THREE.MeshStandardMaterial({ color: 0x444448, metalness: 0.7, roughness: 0.3 });
    for (let i = 0; i < 2; i++) {
        const sfp = new THREE.Mesh(
            new THREE.BoxGeometry(0.016, 0.008, 0.004),
            sfpMat
        );
        sfp.position.set(W / 2 - 0.04 + i * 0.022, sw_y + U / 2 - 0.005, FZ + 0.003);
        group.add(sfp);
    }

    // =============================================
    // UNIT 4 (top): 4-BAY NAS — 1U
    // =============================================
    const nas_y = 3 * U + 0.001;
    // Front plate
    const nasFront = new THREE.Mesh(new THREE.BoxGeometry(W - 0.026, U - 0.004, 0.004), uiSilver);
    nasFront.position.set(0, nas_y + U / 2, FZ);
    group.add(nasFront);
    addScrews(nas_y, U);

    // 4 drive bays with handles
    const bayMat = new THREE.MeshStandardMaterial({ color: 0xbababd, metalness: 0.8, roughness: 0.2 });
    const bayInsetMat = new THREE.MeshStandardMaterial({ color: 0x888890, metalness: 0.6, roughness: 0.4 });
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x666670, metalness: 0.9, roughness: 0.15 });
    const bayW = 0.065, bayH = U - 0.012;

    for (let i = 0; i < 4; i++) {
        const bx = -0.145 + i * (bayW + 0.006);
        const by = nas_y + U / 2;

        // Bay tray
        const bay = new THREE.Mesh(new THREE.BoxGeometry(bayW, bayH, 0.004), bayMat);
        bay.position.set(bx, by, FZ + 0.002);
        group.add(bay);

        // Bay inset (recessed area)
        const inset = new THREE.Mesh(new THREE.BoxGeometry(bayW - 0.008, bayH - 0.008, 0.002), bayInsetMat);
        inset.position.set(bx, by, FZ + 0.005);
        group.add(inset);

        // Handle (horizontal bar at bottom of bay)
        const handle = new THREE.Mesh(new THREE.BoxGeometry(bayW - 0.012, 0.004, 0.003), handleMat);
        handle.position.set(bx, by - bayH / 2 + 0.006, FZ + 0.006);
        group.add(handle);

        // Drive activity LED
        const driveLed = new THREE.Mesh(ledGeo, new THREE.MeshBasicMaterial({
            color: 0x00cc44, toneMapped: false
        }));
        driveLed.position.set(bx + bayW / 2 - 0.006, by + bayH / 2 - 0.005, FZ + 0.006);
        group.add(driveLed);
    }

    // NAS status LED
    const nasLed = new THREE.Mesh(ledGeo, new THREE.MeshBasicMaterial({ color: 0x0088ff, toneMapped: false }));
    nasLed.position.set(W / 2 - 0.03, nas_y + U / 2, FZ + 0.004);
    nasLed.name = 'led_nas_status';
    group.add(nasLed);

    // Power button (small circle on right)
    const pwrBtn = new THREE.Mesh(
        new THREE.CircleGeometry(0.005, 12),
        new THREE.MeshStandardMaterial({ color: 0x555558, metalness: 0.9, roughness: 0.1 })
    );
    pwrBtn.position.set(W / 2 - 0.03, nas_y + U / 2 - 0.012, FZ + 0.004);
    group.add(pwrBtn);

    return group;
}

/**
 * Creates a UniFi Flex Mini 5-port switch
 * Dimensions: ~10cm wide, 7cm deep, 2.5cm high
 */
export function createFlexMini() {
    const group = new THREE.Group();
    group.name = 'usw_flex_mini';

    const W = 0.10, H = 0.025, D = 0.07;
    const FZ = D / 2;

    // Main body — UniFi white/silver
    const bodyMat = new THREE.MeshStandardMaterial({
        color: 0xe8e8ec, metalness: 0.6, roughness: 0.25
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), bodyMat);
    body.position.set(0, H / 2, 0);
    group.add(body);

    // Top surface — slightly lighter with subtle bevel
    const topMat = new THREE.MeshStandardMaterial({
        color: 0xf0f0f4, metalness: 0.5, roughness: 0.2
    });
    const top = new THREE.Mesh(new THREE.BoxGeometry(W - 0.002, 0.001, D - 0.002), topMat);
    top.position.set(0, H + 0.0005, 0);
    group.add(top);

    // Blue LED strip on front
    const blueLedMat = new THREE.MeshBasicMaterial({ color: 0x0066ff, toneMapped: false });
    const ledStrip = new THREE.Mesh(
        new THREE.BoxGeometry(W * 0.6, 0.0015, 0.001),
        blueLedMat
    );
    ledStrip.position.set(0, H - 0.003, FZ + 0.001);
    group.add(ledStrip);

    // 5 ethernet ports on front
    const portMat = new THREE.MeshStandardMaterial({ color: 0x222224, metalness: 0.6, roughness: 0.4 });
    const portInnerMat = new THREE.MeshBasicMaterial({ color: 0x080808 });
    const portGeo = new THREE.BoxGeometry(0.012, 0.010, 0.003);
    const portInnerGeo = new THREE.BoxGeometry(0.008, 0.006, 0.001);

    for (let i = 0; i < 5; i++) {
        const px = -0.032 + i * 0.016;
        const py = H / 2;

        const port = new THREE.Mesh(portGeo, portMat);
        port.position.set(px, py, FZ + 0.002);
        group.add(port);

        const inner = new THREE.Mesh(portInnerGeo, portInnerMat);
        inner.position.set(px, py, FZ + 0.004);
        group.add(inner);

        // Activity LED above port
        const ledMat = new THREE.MeshBasicMaterial({ color: 0x00cc44, toneMapped: false });
        const led = new THREE.Mesh(new THREE.CircleGeometry(0.0015, 6), ledMat);
        led.position.set(px, py + 0.007, FZ + 0.002);
        group.add(led);
    }

    return group;
}

export function createU6Mesh() {
    const group = new THREE.Group();
    group.name = 'u6_mesh';

    const R = 0.02;
    const H = 0.12;

    // Hoofdbehuizing (Witte cilinder)
    const bodyMat = new THREE.MeshStandardMaterial({
        color: 0xf2f2f5, metalness: 0.3, roughness: 0.35
    });
    const bodyGeo = new THREE.CylinderGeometry(R, R, H, 32);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = H / 2;
    group.add(body);

    // Radio Wave Pulsen (Animatie)
    const waveGeo = new THREE.TorusGeometry(R, 0.0005, 8, 48);
    const waves = [
        { color: 0x00aaff, delay: 0 },
        { color: 0x00aaff, delay: 1.2 },
        { color: 0xa277ff, delay: 0.6 },
        { color: 0xa277ff, delay: 1.8 },
    ];

    waves.forEach(({ color, delay }) => {
        const waveMat = new THREE.MeshBasicMaterial({
            color, transparent: true, opacity: 0.5, side: THREE.DoubleSide
        });
        const wave = new THREE.Mesh(waveGeo, waveMat);
        wave.rotation.x = Math.PI / 2;
        wave.position.y = H / 2;
        group.add(wave);

        // Animatie met GSAP
        gsap.to(wave.scale, {
            x: 50, y: 50, z: 50,
            duration: 5, repeat: -1, delay,
            ease: "power1.out"
        });
        gsap.to(waveMat, {
            opacity: 0,
            duration: 3, repeat: -1, delay,
            ease: "power1.out"
        });
    });

    return group;
}

/**
 * Creates a Lian Li O11 Vision PC case
 * Dimensions: ~47cm tall, 29cm wide, 46cm deep (real scale)
 * @param {string} variant - 'black' (default) or 'white'
 */
export function createLianLiVision(variant = 'black') {
    const group = new THREE.Group();
    group.name = 'lianli_vision';

    const isWhite = variant === 'white';
    const W = 0.29, H = 0.47, D = 0.46;

    // === COLOR PALETTE ===
    const colors = isWhite ? {
        frame: 0xe8e8ec, side: 0xd8d8dc, edge: 0xf0f0f4,
        glass: 0x888890, internal: 0x1a1a20, gpu: 0x2a2a30,
        gpuAccent: 0x444448, ram: 0x1a1a22, fanRing: 0xccccd0,
        io: 0xd0d0d4, pwr: 0xbbbbbd, foot: 0xaaaaaa
    } : {
        frame: 0x1a1a1e, side: 0x222226, edge: 0x2a2a2e,
        glass: 0x111115, internal: 0x0a0a0e, gpu: 0x2a2a30,
        gpuAccent: 0x444448, ram: 0x1a1a22, fanRing: 0x222226,
        io: 0x333336, pwr: 0x555558, foot: 0x111111
    };

    // === FRAME ===
    const frameMat = new THREE.MeshStandardMaterial({
        color: colors.frame, metalness: 0.85, roughness: 0.2
    });

    const back = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.003), frameMat);
    back.position.set(0, H / 2, -D / 2);
    group.add(back);

    const bottom = new THREE.Mesh(new THREE.BoxGeometry(W, 0.003, D), frameMat);
    bottom.position.set(0, 0.0015, 0);
    group.add(bottom);

    const top = new THREE.Mesh(new THREE.BoxGeometry(W, 0.003, D), frameMat);
    top.position.set(0, H, 0);
    group.add(top);

    // === TEMPERED GLASS PANELS (front + left side) ===
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: colors.glass,
        transparent: true,
        opacity: isWhite ? 0.2 : 0.25,
        metalness: 0.1,
        roughness: 0.05,
        reflectivity: 0.9,
        clearcoat: 1.0,
        clearcoatRoughness: 0.02,
        side: THREE.DoubleSide
    });

    const frontGlass = new THREE.Mesh(new THREE.BoxGeometry(W - 0.01, H - 0.02, 0.003), glassMat);
    frontGlass.position.set(0, H / 2, D / 2);
    group.add(frontGlass);

    const leftGlass = new THREE.Mesh(new THREE.BoxGeometry(0.003, H - 0.02, D - 0.01), glassMat);
    leftGlass.position.set(-W / 2, H / 2, 0);
    group.add(leftGlass);

    // Right side panel — solid
    const sideMat = new THREE.MeshStandardMaterial({
        color: colors.side, metalness: 0.8, roughness: 0.25
    });
    const rightPanel = new THREE.Mesh(new THREE.BoxGeometry(0.003, H, D), sideMat);
    rightPanel.position.set(W / 2, H / 2, 0);
    group.add(rightPanel);

    // === FRAME EDGES — brushed aluminum pillars ===
    const edgeMat = new THREE.MeshStandardMaterial({
        color: colors.edge, metalness: 0.9, roughness: 0.15
    });
    const edgeGeo = new THREE.BoxGeometry(0.008, H, 0.008);

    const fl = new THREE.Mesh(edgeGeo, edgeMat);
    fl.position.set(-W / 2, H / 2, D / 2);
    group.add(fl);

    const fr = new THREE.Mesh(edgeGeo, edgeMat);
    fr.position.set(W / 2, H / 2, D / 2);
    group.add(fr);

    const topF = new THREE.Mesh(new THREE.BoxGeometry(W, 0.008, 0.008), edgeMat);
    topF.position.set(0, H, D / 2);
    group.add(topF);

    const topL = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, D), edgeMat);
    topL.position.set(-W / 2, H, 0);
    group.add(topL);

    // === INTERNAL COMPONENTS (visible through glass) ===
    const internalMat = new THREE.MeshStandardMaterial({
        color: colors.internal, metalness: 0.7, roughness: 0.4
    });

    const moboTray = new THREE.Mesh(new THREE.BoxGeometry(0.005, H * 0.65, D * 0.55), internalMat);
    moboTray.position.set(W * 0.15, H * 0.55, -D * 0.05);
    group.add(moboTray);

    const gpuMat = new THREE.MeshStandardMaterial({
        color: colors.gpu, metalness: 0.8, roughness: 0.2
    });
    const gpu = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 0.25), gpuMat);
    gpu.position.set(0, H * 0.38, 0);
    group.add(gpu);

    const gpuAccent = new THREE.Mesh(
        new THREE.BoxGeometry(0.11, 0.003, 0.24),
        new THREE.MeshStandardMaterial({ color: colors.gpuAccent, metalness: 0.9, roughness: 0.1 })
    );
    gpuAccent.position.set(0, H * 0.38 + 0.021, 0);
    group.add(gpuAccent);

    const ramMat = new THREE.MeshStandardMaterial({ color: colors.ram, metalness: 0.7, roughness: 0.3 });
    for (let i = 0; i < 4; i++) {
        const ram = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.05, 0.14), ramMat);
        ram.position.set(W * 0.15 - 0.02 - i * 0.009, H * 0.68, 0);
        group.add(ram);
    }

    // === RGB FANS (3 bottom + 3 side) ===
    const fanRingMat = new THREE.MeshStandardMaterial({
        color: colors.fanRing, metalness: 0.7, roughness: 0.3
    });
    const rgbMat = new THREE.MeshBasicMaterial({
        color: 0xe5e5e5, toneMapped: false, transparent: true, opacity: 0.6
    });

    for (let i = 0; i < 3; i++) {
        const fz = -D * 0.22 + i * 0.13;
        const fanRing = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.005, 8, 24), fanRingMat);
        fanRing.rotation.x = Math.PI / 2;
        fanRing.position.set(0, 0.01, fz);
        group.add(fanRing);

        const rgbRing = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.003, 8, 24), rgbMat);
        rgbRing.rotation.x = Math.PI / 2;
        rgbRing.position.set(0, 0.012, fz);
        group.add(rgbRing);
    }

    for (let i = 0; i < 3; i++) {
        const fy = H * 0.25 + i * 0.13;
        const fanRing = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.005, 8, 24), fanRingMat);
        fanRing.rotation.z = Math.PI / 2;
        fanRing.position.set(-W / 2 + 0.055, fy, -0.20);
        group.add(fanRing);

        const rgbRing = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.003, 8, 24), rgbMat);
        rgbRing.rotation.z = Math.PI / 2;
        rgbRing.position.set(-W / 2 + 0.057, fy, -0.20);
        group.add(rgbRing);
    }
4
    // === TOP I/O panel ===
    const ioPanel = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.002, 0.03),
        new THREE.MeshStandardMaterial({ color: colors.io, metalness: 0.8, roughness: 0.2 })
    );
    ioPanel.position.set(0, H + 0.002, D / 2 - 0.04);
    group.add(ioPanel);

    const pwrBtn = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.006, 0.003, 16),
        new THREE.MeshStandardMaterial({ color: colors.pwr, metalness: 0.9, roughness: 0.1 })
    );
    pwrBtn.position.set(0, H + 0.004, D / 2 - 0.04);
    group.add(pwrBtn);

    // === RUBBER FEET ===
    const footMat = new THREE.MeshStandardMaterial({ color: colors.foot, roughness: 0.95 });
    const footGeo = new THREE.BoxGeometry(0.04, 0.008, 0.02);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
        const foot = new THREE.Mesh(footGeo, footMat);
        foot.position.set(sx * (W / 2 - 0.03), -0.004, sz * (D / 2 - 0.04));
        group.add(foot);
    });

    return group;
}

// =============================================
// iROBOT ROOMBA VACUUM
// =============================================
/**
 * Creates an iRobot Roomba-style robot vacuum
 * Circular disc body (~34cm diameter, ~9cm tall)
 */
export function createRoombaVacuum() {
    const group = new THREE.Group();
    group.name = 'irobot_vacuum';

    const bodyRadius = 0.17;
    const bodyHeight = 0.07;

    // Main body — dark charcoal disc
    const bodyGeo = new THREE.CylinderGeometry(bodyRadius, bodyRadius, bodyHeight, 32);
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x2a2a2a, shininess: 40 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = bodyHeight / 2 + 0.01;
    group.add(body);

    // Top accent ring — lighter grey near edge
    const ringGeo = new THREE.TorusGeometry(bodyRadius * 0.85, 0.004, 8, 48);
    const ringMat = new THREE.MeshPhongMaterial({ color: 0x555555 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = bodyHeight + 0.01;
    group.add(ring);

    // Top panel — raised center disc
    const panelGeo = new THREE.CylinderGeometry(bodyRadius * 0.45, bodyRadius * 0.45, 0.005, 24);
    const panelMat = new THREE.MeshPhongMaterial({ color: 0x1a1a1a, shininess: 60 });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.y = bodyHeight + 0.012;
    group.add(panel);

    // Clean button — blue circle on top
    const btnGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.004, 16);
    const btnMat = new THREE.MeshPhongMaterial({ color: 0x2196F3, emissive: 0x2196F3, emissiveIntensity: 0.3 });
    const btn = new THREE.Mesh(btnGeo, btnMat);
    btn.position.y = bodyHeight + 0.016;
    group.add(btn);

    // Front bumper — half-ring
    const bumperGeo = new THREE.TorusGeometry(bodyRadius + 0.003, 0.008, 8, 24, Math.PI);
    const bumperMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
    const bumper = new THREE.Mesh(bumperGeo, bumperMat);
    bumper.rotation.x = -Math.PI / 2;
    bumper.position.set(0, bodyHeight * 0.5, 0);
    group.add(bumper);

    // Camera/sensor on front-top
    const camGeo = new THREE.BoxGeometry(0.02, 0.015, 0.01);
    const camMat = new THREE.MeshPhongMaterial({ color: 0x111111 });
    const cam = new THREE.Mesh(camGeo, camMat);
    cam.position.set(0, bodyHeight + 0.005, bodyRadius * 0.7);
    group.add(cam);

    // Side wheels
    for (const side of [-1, 1]) {
        const wheelGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.015, 12);
        const wheelMat = new THREE.MeshPhongMaterial({ color: 0x1a1a1a });
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(side * bodyRadius * 0.6, 0.015, 0);
        group.add(wheel);
    }

    // Front caster
    const casterGeo = new THREE.SphereGeometry(0.01, 8, 8);
    const casterMat = new THREE.MeshPhongMaterial({ color: 0x222222 });
    const caster = new THREE.Mesh(casterGeo, casterMat);
    caster.position.set(0, 0.01, bodyRadius * 0.75);
    group.add(caster);

    return group;
}

// =============================================
// iROBOT DOCKING STATION
// =============================================
/**
 * Creates an iRobot docking/charging station
 * Upright wedge (~15cm wide, ~10cm deep, ~8cm tall)
 */
export function createRoombaDock() {
    const group = new THREE.Group();
    group.name = 'irobot_dock';

    // Base plate
    const baseGeo = new THREE.BoxGeometry(0.20, 0.005, 0.12);
    const baseMat = new THREE.MeshPhongMaterial({ color: 0x2a2a2a });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.0025;
    group.add(base);

    // Back upright
    const uprightGeo = new THREE.BoxGeometry(0.18, 0.08, 0.015);
    const uprightMat = new THREE.MeshPhongMaterial({ color: 0x333333, shininess: 30 });
    const upright = new THREE.Mesh(uprightGeo, uprightMat);
    upright.position.set(0, 0.045, -0.05);
    group.add(upright);

    // Ramp surface
    const rampGeo = new THREE.BoxGeometry(0.16, 0.003, 0.10);
    const rampMat = new THREE.MeshPhongMaterial({ color: 0x2e2e2e });
    const ramp = new THREE.Mesh(rampGeo, rampMat);
    ramp.position.set(0, 0.008, 0.0);
    ramp.rotation.x = 0.05;
    group.add(ramp);

    // Charging contacts — copper strips
    for (const side of [-0.03, 0.03]) {
        const contactGeo = new THREE.BoxGeometry(0.015, 0.003, 0.04);
        const contactMat = new THREE.MeshPhongMaterial({ color: 0xB87333, shininess: 80 });
        const contact = new THREE.Mesh(contactGeo, contactMat);
        contact.position.set(side, 0.01, 0.01);
        group.add(contact);
    }

    // IR beacon dome on top
    const beaconGeo = new THREE.SphereGeometry(0.008, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    const beaconMat = new THREE.MeshPhongMaterial({ color: 0x111111, transparent: true, opacity: 0.8 });
    const beacon = new THREE.Mesh(beaconGeo, beaconMat);
    beacon.position.set(0, 0.085, -0.05);
    group.add(beacon);

    // Status LED
    const ledGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.002, 8);
    const ledMat = new THREE.MeshBasicMaterial({ color: 0x4CAF50, toneMapped: false });
    const led = new THREE.Mesh(ledGeo, ledMat);
    led.rotation.x = Math.PI / 2;
    led.position.set(0, 0.06, -0.042);
    group.add(led);

    return group;
}

/**
 * Updates the color and brightness of a spot light model
 */
export function updateSpotAppearance(lightGroup, state) {
    if (!lightGroup || !lightGroup.userData.updateMaterials) return;

    const { lens, glow } = lightGroup.userData.updateMaterials;
    const { isOn, brightness, rgb } = state;

    const intensity = isOn ? brightness / 255 : 0;

    // Reuse module-level color objects instead of allocating new ones
    if (rgb && Array.isArray(rgb)) {
        _tmpBaseColor.setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
    } else {
        _tmpBaseColor.setRGB(1, 1, 1);
    }

    // Light tubes: bright uniform glow along the full length
    if (lightGroup.userData.isLightTube) {
        _tmpBrightColor.copy(_tmpBaseColor).multiplyScalar(intensity * 12);
        lens.color.copy(_tmpBrightColor);
        lens.opacity = isOn ? 1.0 : 0.9;
        if (glow) {
            glow.color.copy(_tmpBaseColor);
            glow.opacity = intensity * 0.7;
        }
        // Update lights
        const spotlight = lightGroup.getObjectByName('main_light');
        if (spotlight) { spotlight.intensity = intensity * 20; spotlight.color.copy(_tmpBaseColor); }
        const pointLight = lightGroup.getObjectByName('spot_glow');
        if (pointLight) { pointLight.intensity = intensity * 3; pointLight.color.copy(_tmpBaseColor); }
        return;
    }

    _tmpBrightColor.copy(_tmpBaseColor).multiplyScalar(intensity * 10);

    // Update lens material
    if (lens.emissive !== undefined) {
        lens.color.copy(_tmpBaseColor);
        lens.emissive.copy(_tmpBaseColor);
        lens.emissiveIntensity = intensity * 3;
    } else {
        lens.color.copy(_tmpBrightColor);
    }

    // Update glow material
    if (glow) {
        glow.color.copy(_tmpBaseColor);
        glow.opacity = intensity * 0.95;
    }

    // Update the SpotLight if it exists
    const spotlight = lightGroup.getObjectByName('main_light');
    if (spotlight) {
        spotlight.intensity = intensity * 20;
        spotlight.color.copy(_tmpBaseColor);
    }

    // Update the PointLight if it exists
    const pointLight = lightGroup.getObjectByName('spot_glow');
    if (pointLight) {
        pointLight.intensity = intensity * 3;
        pointLight.color.copy(_tmpBaseColor);
    }
}
