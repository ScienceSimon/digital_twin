import * as THREE from 'three';
import { gsap } from 'https://cdn.skypack.dev/gsap';

/**
 * Creates a radar beacon with a pulsing effect in the Office
 */
export function createRadarBeacon() {
    const group = new THREE.Group();

    // De vaste kern
    const coreGeo = new THREE.SphereGeometry(0.08, 32, 32);
    const coreMat = new THREE.MeshStandardMaterial({ 
        color: 0x00aaff, 
        emissive: 0x00ff00,
        emissiveIntensity: 3 
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    group.add(core);

    // De pulserende ring
    const ringGeo = new THREE.SphereGeometry(0.1, 32, 32);
    const ringMat = new THREE.MeshBasicMaterial({ 
        color: 0x00ffff, 
        transparent: true, 
        opacity: 0.6 
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    group.add(ring);

    // Animatie (GSAP moet wel beschikbaar zijn in dit bestand)
    gsap.to(ring.scale, { x: 4, y: 4, z: 4, duration: 2, repeat: -1, ease: "power2.out" });
    gsap.to(ringMat, { opacity: 0, duration: 2, repeat: -1, ease: "power2.out" });

    return group;
}

/**
 * Creates a transparent glass bulb with a filament inside
 * Size: approx. 10cm diameter (standard bulb size)
 */
export function createTransparentBulb() {
    const group = new THREE.Group();
    group.name = 'transparent_bulb';

    // 1. De Glazen Bol (Semi-transparant, glows with color)
    const glassGeo = new THREE.SphereGeometry(0.05, 32, 32);
    const glassMat = new THREE.MeshStandardMaterial({
        color: 0x111111,
        transparent: true,
        opacity: 0.4,
        emissive: 0x000000,
        emissiveIntensity: 0,
        metalness: 0.1,
        roughness: 0.1
    });
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.y = 0.05;
    group.add(glass);

    // 2. Het Filament (De 'lens' die echt oplicht)
    const filamentGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.04, 8);
    const filamentMat = new THREE.MeshBasicMaterial({
        color: 0x000000, // Start uit
        toneMapped: false
    });
    const filament = new THREE.Mesh(filamentGeo, filamentMat);
    filament.position.y = 0.05;
    filament.name = 'filament';
    group.add(filament);

    // 3. De Fitting (Metaal onderkant)
    const baseGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.02, 16);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 1, roughness: 0.2 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.005;
    group.add(base);

    // Voor de update functie koppelen we het filament aan 'lens' en glas aan 'glow'
    group.userData.updateMaterials = {
        lens: filamentMat,
        glow: glassMat // Glas gloeit mee met de lamp kleur
    };

    return group;
}

/**
 * Creates a light tube (lichtslang)
 * @param {number} length - Lengte in meters (bijv. 1 of 2)
 */
export function createLightTube(length = 1) {
    const group = new THREE.Group();
    group.name = `light_tube_${length}m`;

    // 1. De slang zelf (halftransparant wit plastic)
    // We maken een liggende cilinder. Radius 0.015 (3cm dikte)
    const tubeGeo = new THREE.CylinderGeometry(0.015, 0.015, length, 16);
    const tubeMat = new THREE.MeshStandardMaterial({
        color: 0x000000, // Uit staat
        transparent: true,
        opacity: 0.9,
        emissive: 0x000000,
        metalness: 0.2,
        roughness: 0.5
    });
    const tube = new THREE.Mesh(tubeGeo, tubeMat);
    
    // Draai de cilinder zodat hij over de Z-as ligt (horizontaal)
    tube.rotation.z = Math.PI / 2;
    tube.name = 'tube_body';
    group.add(tube);

    // 2. De Glow (een zachte gloed achter/onder de slang)
    const glowGeo = new THREE.PlaneGeometry(length + 0.2, 0.1);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.02; // Net onder de slang
    glow.name = 'glow';
    group.add(glow);

    // Koppelen aan je bestaande update-systeem
    group.userData.updateMaterials = {
        lens: tubeMat, // We misbruiken 'lens' voor de hele slang
        glow: glowMat
    };

    return group;
}

/**
 * modelFusion.js
 * 3D model definitions for IoT assets in the digital twin
 * All models support dynamic color and brightness updates
 */


/**
 * Creates a floor sphere lamp (bollamp op de grond)
 * Features:
 * - Frosted glass sphere (Milk glass)
 * - Support for dynamic color and brightness via updateSpotAppearance
 * - Designed to sit on the floor
 */
export function createSphereLamp() {
    const group = new THREE.Group();
    group.name = 'sphere_lamp';

    // 1. De Voet (Kleine cilinder waar de bol in rust)
    const baseGeo = new THREE.CylinderGeometry(0.10, 0.12, 0.04, 32);
    const baseMat = new THREE.MeshStandardMaterial({ 
        color: 0x1a1a1a, 
        metalness: 0.8, 
        roughness: 0.3 
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.02; // Staat op de grond
    base.name = 'base';
    group.add(base);

    // 2. De Bol (Melkglas effect)
    // De bol wordt de 'lens' die oplicht in de update functie
    const sphereGeo = new THREE.SphereGeometry(0.175, 32, 32);
    const sphereMat = new THREE.MeshStandardMaterial({
        color: 0x000000, // Start uit (zwart)
        transparent: true,
        opacity: 0.9,
        emissive: 0x000000, // Wordt aangestuurd door update functie
        metalness: 0.1,
        roughness: 0.2
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.y = 0.175; // Straal is 0.175, dus onderkant raakt de vloer
    sphere.name = 'sphere_body';
    group.add(sphere);

    // 3. De 'Glow' (Voor de zachte gloed op de vloer rondom de bol)
    const glowGeo = new THREE.RingGeometry(0.18, 0.50, 64);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.001; // Net boven de vloer om 'z-fighting' te voorkomen
    glow.name = 'glow';
    group.add(glow);

    // Store references to updatable materials
    // We gebruiken 'lens' als alias voor de bol, zodat updateSpotAppearance werkt
    group.userData.updateMaterials = {
        lens: sphereMat, 
        glow: glowMat
    };

    return group;
}

/**
 * Creates a recessed ceiling spot light (inbouwspot)
 * Features:
 * - Ceiling trim ring
 * - Glass lens with emissive material
 * - Dynamic color and brightness support
 * - Designed to be mounted flush with ceiling
 *
 * POSITIONING: Y-coordinate should be the CEILING HEIGHT
 * The model is designed so when placed at ceiling level, the trim is flush with ceiling
 */
export function createRecessedSpot() {
    const group = new THREE.Group();
    group.name = 'recessed_spot';

    // 1. Trim ring - flush with ceiling surface (at Y=0 of group)
    const ringGeo = new THREE.RingGeometry(0.06, 0.09, 32);
    const ringMat = new THREE.MeshStandardMaterial({
        color: 0xdddddd,
        metalness: 0.9,
        roughness: 0.2
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2; // Facing down
    ring.position.y = 0; // Flush with ceiling
    ring.name = 'trim_ring';
    group.add(ring);

    // 2. Inner housing
    const housingGeo = new THREE.CylinderGeometry(0.058, 0.058, 0.001, 32);
    const housingMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        metalness: 0.3,
        roughness: 0.8
    });
    const housing = new THREE.Mesh(housingGeo, housingMat);
    housing.position.y = 0.0005; // Inside/above ceiling (very thin)
    housing.name = 'housing';
    group.add(housing);

    // 3. Glass/lens - visible from below, slightly recessed
    const lensGeo = new THREE.CircleGeometry(0.058, 32);
    const lensMat = new THREE.MeshBasicMaterial({
        color: 0x000000, // Start in OFF state (black)
        transparent: false,
        side: THREE.DoubleSide,
        toneMapped: false // Allow HDR colors (brightness > 1.0)
    });
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.rotation.x = -Math.PI / 2; // Facing down
    lens.position.y = -0.02; // Slightly recessed from ceiling
    lens.name = 'lens';
    group.add(lens);

    // 4. Glow halo effect (visible from below) - prominenter
    const glowGeo = new THREE.RingGeometry(0.058, 0.12, 32);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0x000000, // Start in OFF state (black)
        transparent: true,
        opacity: 0, // Start invisible (OFF)
        side: THREE.DoubleSide
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = Math.PI / 2; // Facing down
    glow.position.y = -0.025; // Just below lens
    glow.name = 'glow';
    group.add(glow);

    // Store references to updatable materials
    group.userData.updateMaterials = {
        lens: lensMat,
        glow: glowMat
    };

    return group;
}

/**
 * Creates a cylinder spot light (opbouwspot / WC-rol)
 * Features:
 * - Cylindrical housing
 * - Lens at the bottom
 * - Dynamic color and brightness support
 * - Designed to hang from ceiling with rotation control
 *
 * POSITIONING: Y-coordinate should be the CEILING HEIGHT
 * The model hangs DOWN from the ceiling, with mounting plate at ceiling level
 */
export function createCylinderSpot() {
    const group = new THREE.Group();
    group.name = 'cylinder_spot';

    // 1. Mounting plate (flat against ceiling surface)
    const plateGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.015, 32);
    const plateMat = new THREE.MeshStandardMaterial({
        color: 0x2a2a2a,
        metalness: 0.8,
        roughness: 0.3
    });
    const plate = new THREE.Mesh(plateGeo, plateMat);
    plate.position.y = 0.0075; // Half of height, so top is at Y=0 (ceiling)
    plate.name = 'mounting_plate';
    group.add(plate);

    // 2. Cylinder body - the main housing (more compact)
    const cylinderGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.15, 32);
    const cylinderMat = new THREE.MeshStandardMaterial({
        color: 0x1a1a1a,
        metalness: 0.7,
        roughness: 0.4
    });
    const cylinder = new THREE.Mesh(cylinderGeo, cylinderMat);
    cylinder.position.y = -0.085;
    cylinder.name = 'cylinder_body';
    group.add(cylinder);

    // 3. Bottom cap (slightly wider)
    const capGeo = new THREE.CylinderGeometry(0.048, 0.045, 0.02, 32);
    const capMat = new THREE.MeshStandardMaterial({
        color: 0x2a2a2a,
        metalness: 0.8,
        roughness: 0.3
    });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.y = -0.17;
    cap.name = 'bottom_cap';
    group.add(cap);

    // 4. Lens - this will glow with the light color
    const lensGeo = new THREE.CircleGeometry(0.042, 32);
    const lensMat = new THREE.MeshBasicMaterial({
        color: 0x000000, // Start in OFF state (black)
        transparent: false,
        side: THREE.DoubleSide,
        toneMapped: false // Allow HDR colors (brightness > 1.0)
    });
    const lens = new THREE.Mesh(lensGeo, lensMat);
    lens.rotation.x = -Math.PI / 2;
    lens.position.y = -0.181;
    lens.name = 'lens';
    group.add(lens);

    // 5. Glow ring around lens - prominenter
    const glowGeo = new THREE.RingGeometry(0.042, 0.09, 32);
    const glowMat = new THREE.MeshBasicMaterial({
        color: 0x000000, // Start in OFF state (black)
        transparent: true,
        opacity: 0, // Start invisible (OFF)
        side: THREE.DoubleSide
    });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = -0.182;
    glow.name = 'glow';
    group.add(glow);

    // Store references to updatable materials
    group.userData.updateMaterials = {
        lens: lensMat,
        glow: glowMat
    };

    return group;
}

/**
 * Updates the color and brightness of a spot light model
 * @param {THREE.Group} lightGroup - The light group (recessed_spot or cylinder_spot)
 * @param {Object} state - Light state {isOn, brightness, rgb}
 */
export function updateSpotAppearance(lightGroup, state) {
    if (!lightGroup || !lightGroup.userData.updateMaterials) return;

    const { lens, glow } = lightGroup.userData.updateMaterials;
    const { isOn, brightness, rgb } = state;

    // Calculate intensity (0-1 range)
    const intensity = isOn ? brightness / 255 : 0;

    // Determine base color
    let baseColor;
    if (rgb && Array.isArray(rgb)) {
        baseColor = new THREE.Color(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
    } else {
        baseColor = new THREE.Color(1, 1, 1); // Default white
    }

    // For MeshBasicMaterial with toneMapped=false, we can use HDR colors (brightness > 1.0)
    // Make the lens SUPER bright when ON - multiply by 10 for maximum glow visibility
    const superBrightColor = baseColor.clone().multiplyScalar(intensity * 10);

    // Update lens material
    if (lens.emissive !== undefined) {
        // MeshStandardMaterial (sphere, tube) - use emissive for glow
        lens.color.copy(baseColor);
        lens.emissive.copy(baseColor);
        lens.emissiveIntensity = intensity * 3;
    } else {
        // MeshBasicMaterial with HDR (spots, bulb filament)
        lens.color.copy(superBrightColor);
    }

    // Update glow material - make it very prominent
    if (glow) {
        glow.color.copy(baseColor);
        glow.opacity = intensity * 0.95; // Max opacity 0.95 when fully on
    }

    // Update the SpotLight if it exists (for wall glow)
    const spotlight = lightGroup.getObjectByName('main_light');
    if (spotlight) {
        spotlight.intensity = intensity * 20; // Scale to visible range
        spotlight.color.copy(baseColor);
    }

    // Update the PointLight if it exists (for glow at the spot itself)
    const pointLight = lightGroup.getObjectByName('spot_glow');
    if (pointLight) {
        pointLight.intensity = intensity * 3; // Glow intensity at the spot
        pointLight.color.copy(baseColor);
    }
    
}

