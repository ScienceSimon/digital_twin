import * as THREE from 'three';
import { gsap } from 'gsap';
import {
    createRecessedSpot,
    createCylinderSpot,
    createSphereLamp,
    createLightTube,
    createTransparentBulb,
    createRadarBeacon } from '../models/modelFusion.js';
    
export function buildAssets(iotData, state) {
    if (!iotData) return;

    const assetsArray = Array.isArray(iotData) ? iotData : iotData.assets;
    if (!assetsArray) return;

    assetsArray.forEach(asset => {
        let mesh;

        if (asset.type === 'solar_panel') {
            mesh = createSolarPanel();
        }

        if (asset.type === 'venetian_blinds') {
            mesh = createVenetianBlinds(asset);
        }

        if (asset.type === 'radar_beacon') {
            mesh = createRadarBeacon();
            
            const entityId = asset.ha_entity || asset.id;
            mesh.name = entityId;
            mesh.userData.entityId = entityId;
        }

        if (asset.type === 'lamp') {
            if (asset.model === 'recessed_spot') {
                mesh = createRecessedSpot();
            } else if (asset.model === 'cylinder_spot') {
                mesh = createCylinderSpot();
            } else if (asset.model === 'sphere') {
                mesh = createSphereLamp();
            } else if (asset.model === 'light_tube') {
                const length = asset.length || 1;
                mesh = createLightTube(length);
            } else if (asset.model === 'bulb') {
                mesh = createTransparentBulb();
            }

            if (mesh) {
                // Set mesh name to match MQTT entity ID for Home Assistant integration
                const entityId = asset.ha_entity || asset.id;
                mesh.name = entityId;
                mesh.userData.entityId = entityId;

                // Voeg een spotlight toe aan de lamp (voor muur-glow)
                const light = new THREE.SpotLight(0xffffcc, 5);
                light.name = 'main_light';
                light.angle = Math.PI / 6;
                light.penumbra = 0.3;
                light.decay = 2;
                light.distance = 8;
                light.castShadow = false; // Disable shadows for performance

                // Voeg een pointlight toe voor de glow AAN de spot zelf
                const pointLight = new THREE.PointLight(0xffffcc, 0.5, 1.5);
                pointLight.name = 'spot_glow';
                pointLight.decay = 2;

                // Positioneer beide lichten op de LENS positie (waar het licht echt uit komt)
                if (asset.model === 'recessed_spot') {
                    light.position.y = -0.02;
                    pointLight.position.y = -0.02;
                } else if (asset.model === 'cylinder_spot') {
                    light.position.y = -0.181;
                    pointLight.position.y = -0.181;
                } else if (asset.model === 'sphere') {
                    light.position.y = 0.175; // Midden van de bol
                    pointLight.position.y = 0.175;
                    pointLight.distance = 3;
                } else if (asset.model === 'bulb') {
                    light.position.y = 0.05; // Midden van de bulb
                    pointLight.position.y = 0.05;
                    pointLight.distance = 1.0;
                } else if (asset.model === 'light_tube') {
                    light.position.y = 0;
                    pointLight.position.y = 0;
                    pointLight.distance = 2;
                }

                // Position target below the light for downward shine
                light.target.position.set(0, -2, 0);
                mesh.add(light);
                mesh.add(light.target);
                mesh.add(pointLight);

            }
        }

        if (mesh) {
            // Zet de positie - ondersteun beide formaten
            const x = asset.x !== undefined ? asset.x : asset.position?.x || 0;
            const y = asset.y !== undefined ? asset.y : asset.position?.y || 0;
            const z = asset.z !== undefined ? asset.z : asset.position?.z || 0;
            mesh.position.set(x, y, z);

            // Zet de rotatie (graden naar radialen)
            if (asset.rotation) {
                mesh.rotation.set(
                    asset.rotation.x * (Math.PI / 180),
                    asset.rotation.y * (Math.PI / 180),
                    asset.rotation.z * (Math.PI / 180)
                );
            } else if (asset.rx !== undefined || asset.ry !== undefined || asset.rz !== undefined) {
                mesh.rotation.set(
                    (asset.rx || 0) * (Math.PI / 180),
                    (asset.ry || 0) * (Math.PI / 180),
                    (asset.rz || 0) * (Math.PI / 180)
                );
            }

            // Voeg toe aan de scene
            state.scene.add(mesh);

            // Sla op in de state voor interactie later
            if (!state.iotMeshes) state.iotMeshes = [];
            state.iotMeshes.push({ mesh, data: asset });
        }
    });

    // Logging wordt gedaan in main.js na alle assets geladen zijn
}

function createSolarPanel() {
    const group = new THREE.Group();

    // 1. Het Frame (Stevig aluminium)
    const frameGeo = new THREE.BoxGeometry(1.65, 0.05, 1.0);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9, roughness: 0.3 });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    group.add(frame);

    // 2. De Achtergrond (De zilveren/witte basis die je tussen de cellen door ziet)
    const backGeo = new THREE.PlaneGeometry(1.6, 0.95);
    const backMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
    const back = new THREE.Mesh(backGeo, backMat);
    back.rotation.x = -Math.PI / 2;
    back.position.y = 0.026;
    group.add(back);

    // 3. De Individuele Cellen (De blauwe vierkantjes)
    const rows = 4;
    const cols = 6;
    const cellPadding = 0.01;
    const cellW = (1.58 / cols) - cellPadding;
    const cellH = (0.93 / rows) - cellPadding;
    
    const cellGeo = new THREE.PlaneGeometry(cellW, cellH);
    const cellMat = new THREE.MeshStandardMaterial({ 
        color: 0x0a0c1a,
        metalness: 0.6, 
        roughness: 0.2 
    });

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = new THREE.Mesh(cellGeo, cellMat);
            
            const x = -0.79 + (cellW / 2) + c * (cellW + cellPadding);
            const z = -0.46 + (cellH / 2) + r * (cellH + cellPadding);
            
            cell.position.set(x, 0.027, z);
            cell.rotation.x = -Math.PI / 2;
            group.add(cell);
        }
    }

    // 4. De Glasplaat (Voor de spiegeling over alles heen)
    const glassGeo = new THREE.PlaneGeometry(1.6, 0.95);
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.3,
        metalness: 0,
        roughness: 0,
        reflectivity: 1.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0,
        transmission: 0.9
    });

    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.rotation.x = -Math.PI / 2;
    glass.position.y = 0.029;
    group.add(glass);

    return group;
}

// modules/builders/assetFactory.js
export function createVenetianBlinds(data) {
    const group = new THREE.Group();
    group.name = data.ha_entity || data.id;

    const width = data.width || 0.6;
    const maxHeight = data.height || 2.5;
    const spacing = 0.08;
    const numLamel = Math.floor(maxHeight / spacing);

    const lamelGeo = new THREE.BoxGeometry(width, 0.01, 0.06);
    const lamelMat = new THREE.MeshStandardMaterial({
        color: 0x1a1612,
        roughness: 0.8,
        metalness: 0.0
    });

    const lamellen = [];

    for (let i = 0; i < numLamel; i++) {
        const lamelContainer = new THREE.Group(); // Container voor rotatie-as
        const lamelMesh = new THREE.Mesh(lamelGeo, lamelMat);

        lamelContainer.add(lamelMesh);
        // Lamellen hangen naar beneden vanaf bevestigingspunt (y=0 aan plafond)
        lamelContainer.position.y = -(i * spacing);

        group.add(lamelContainer);
        lamellen.push(lamelContainer);
    }

    // --- DE LIVE ANIMATIE FUNCTIE ---
    group.animateBlinds = (tiltRad, openFactor) => {
        lamellen.forEach((lamel, index) => {
            gsap.to(lamel.rotation, {
                x: tiltRad,
                duration: 1.5,
                ease: "power2.inOut"
            });

            const targetY = -(index * spacing * (1 - openFactor));

            gsap.to(lamel.position, {
                y: targetY,
                duration: 2.5,
                delay: index * 0.01,
                ease: "power3.inOut"
            });
        });
    };

    // Position and rotation will be set by buildAssets()
    return group;
}

// Model creation functions are now imported from modelFusion.js
// This keeps the asset factory clean and models reusable
