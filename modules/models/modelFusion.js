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
 * @param {number} diameter - Diameter in meters (default 0.5)
 */
export function createLightRing(diameter = 0.5) {
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

    // Circular glow disc underneath
    const glowGeo = new THREE.RingGeometry(radius - 0.08, radius + 0.08, 64);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0x000000, transparent: true, opacity: 0, side: THREE.DoubleSide
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.y = -0.02;
    glow.rotation.x = -Math.PI / 2;
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
