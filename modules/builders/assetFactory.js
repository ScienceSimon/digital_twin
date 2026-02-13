import * as THREE from 'three';
import { gsap } from 'https://cdn.skypack.dev/gsap';
import {
    createRecessedSpot,
    createCylinderSpot,
    createSphereLamp,
    createLightTube,
    createTransparentBulb, } from '../models/modelFusion.js';
    
export function buildAssets(iotData, state) {
    // Check of er data is en of het een array is
    // console.log('🔧 buildAssets called with:', iotData);
    if (!iotData) {
        // console.log('⚠️ No iotData provided to buildAssets');
        return;
    }

    // Omdat je loader 'data.assets' pakt, is iotData hier direct de array
    const assetsArray = Array.isArray(iotData) ? iotData : iotData.assets;
    // console.log('📦 assetsArray:', assetsArray);
    if (!assetsArray) {
        // console.log('⚠️ No assetsArray found');
        return;
    }
    // console.log(`📊 Processing ${assetsArray.length} assets...`);

    assetsArray.forEach(asset => {
        let mesh;

        if (asset.type === 'solar_panel') {
            mesh = createSolarPanel();
            // console.log(`☀️ Creating solar panel: ${asset.id}`);
            // if (asset.position) {
            //     console.log(`   📍 Position: (${asset.position.x}, ${asset.position.y}, ${asset.position.z})`);
            // }
            // if (asset.rotation) {
            //     console.log(`   🔄 Rotation: x=${asset.rotation.x}° y=${asset.rotation.y}° z=${asset.rotation.z}°`);
            // }
        }

        if (asset.type === 'venetian_blinds') {
            mesh = createVenetianBlinds(asset);
            // console.log(`🪟 Creating venetian blinds: ${asset.id}`);
            // console.log(`   📍 Position: (${asset.x}, ${asset.y}, ${asset.z})`);
            // console.log(`   📏 Size: ${asset.width}m x ${asset.height}m`);
            // if (asset.rx || asset.ry || asset.rz) {
            //     console.log(`   🔄 Rotation: rx=${asset.rx || 0}° ry=${asset.ry || 0}° rz=${asset.rz || 0}°`);
            // }
        }

        if (asset.type === 'lamp') {
            if (asset.model === 'recessed_spot') {
                mesh = createRecessedSpot();
                // console.log(`✨ Creating recessed spot: ${asset.id}`);
                // console.log(`   📍 Position: (${asset.x}, ${asset.y}, ${asset.z})`);
            } else if (asset.model === 'cylinder_spot') {
                mesh = createCylinderSpot();
                // console.log(`✨ Creating cylinder spot: ${asset.id}`);
                // console.log(`   📍 Position: (${asset.x}, ${asset.y}, ${asset.z})`);
                // if (asset.rx || asset.ry || asset.rz) {
                //     console.log(`   🔄 Rotation: rx=${asset.rx || 0}° ry=${asset.ry || 0}° rz=${asset.rz || 0}°`);
                // }
            } else if (asset.model === 'sphere') {
                mesh = createSphereLamp();
                // console.log(`✨ Creating Sphere lamp: ${asset.id}`);
                // console.log(`   📍 Position: (${asset.x}, ${asset.y}, ${asset.z})`);
            } else if (asset.model === 'light_tube') {
                // Pak de lengte uit de asset data, standaard 1 meter
                const length = asset.length || 1;
                mesh = createLightTube(length);
                // console.log(`✨ Creating Light Tube (${length}m): ${asset.id}`);
                // console.log(`   📍 Position: (${asset.x}, ${asset.y}, ${asset.z})`);
                // if (asset.rx || asset.ry || asset.rz) {
                //     console.log(`   🔄 Rotation: rx=${asset.rx || 0}° ry=${asset.ry || 0}° rz=${asset.rz || 0}°`);
                // }
            } else if (asset.model === 'bulb') {
                mesh = createTransparentBulb();
                // console.log(`✨ Creating Transparent Bulb: ${asset.id}`);
                // console.log(`   📍 Position: (${asset.x}, ${asset.y}, ${asset.z})`);
                // if (asset.rx || asset.ry || asset.rz) {
                //     console.log(`   🔄 Rotation: rx=${asset.rx || 0}° ry=${asset.ry || 0}° rz=${asset.rz || 0}°`);
                // }
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

                // console.log(`   💡 Light created: "${mesh.name}" - SpotLight + PointLight added`);
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

            // Extra logging voor venetian blinds
            // if (asset.type === 'venetian_blinds') {
            //     console.log(`   ✅ Blind added to scene: name="${mesh.name}", has animateBlinds: ${typeof mesh.animateBlinds === 'function'}`);
            // }

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
        //console.log(`🎭 animateBlinds: tiltRad=${tiltRad.toFixed(3)}, openFactor=${openFactor}, lamellen=${lamellen.length}`);

        lamellen.forEach((lamel, index) => {
            // 1. Geleidelijk kantelen (Tilt)
            gsap.to(lamel.rotation, {
                x: tiltRad,
                duration: 1.5,
                ease: "power2.inOut",
                onStart: () => {
                    if (index === 0); //console.log(`🎬 GSAP tilt animation started`);
                }
            });

            // 2. Geleidelijk optrekken (Open/Dicht)
            // openFactor 0 = helemaal uitgerold (beneden), 1 = opgerold (boven bij 0)
            const targetY = -(index * spacing * (1 - openFactor));

            // Log lamel 0, 10, and 30 to see the full range of movement
            if (index === 0 || index === 10 || index === 30) {
                //console.log(`📏 Lamel ${index}: currentY=${lamel.position.y.toFixed(3)}, targetY=${targetY.toFixed(3)}`);
            }

            gsap.to(lamel.position, {
                y: targetY,
                duration: 2.5,
                delay: index * 0.01,
                ease: "power3.inOut",
                onStart: () => {
                    if (index === 0); //console.log(`🎬 GSAP position animation started`);
                },
                onComplete: () => {
                    if (index === 30); //console.log(`✅ GSAP position animation completed - Lamel 30 at y=${lamel.position.y.toFixed(3)}`);
                }
            });
        });
    };

    // Position and rotation will be set by buildAssets()
    return group;
}

// Model creation functions are now imported from modelFusion.js
// This keeps the asset factory clean and models reusable
