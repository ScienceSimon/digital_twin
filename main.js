import * as THREE from 'three';
import { initScene } from './modules/core/scene.js';
import { loadAllData } from './modules/core/loaders.js';
import { buildHouse } from './modules/builders/houseBuilder.js';
import { buildAssets } from './modules/builders/assetFactory.js';
import { MqttService } from './modules/core/MqttService.js';
import { CSS2DObject } from 'css2drenderer';
import { updateSpotAppearance } from './modules/models/modelFusion.js'; 
import { gsap } from 'https://cdn.skypack.dev/gsap';

const state = {
    scene: null,
    sunLight: null,
    sunSphere: null,
    houseData: null,
    iotData: null,
    staticData: null,
    allWalls: [],
    allWallData: [],
    allFloors: [],
    allWindows: [],
    labelSprites: [],
    sensorLabels: {
        temperature: [],
        failed: [],
        binary: [],
        window: [], // Nog niet in gebruik
        lights: [],  // Voor lamp labels
        blinds: [],  // Voor blind labels
        all: {}
    },
    floorGroups: {},
    wallsFullHeight: false,
    userLoc: { lat: 52.0, lon: 4.3 }, // Default locatie
    blindStates: {} // Track current position and tilt for each blind
};

async function init() {
    // 1. Initialiseer de Three.js basis
    const core = initScene();
    state.scene = core.scene;
    state.sunLight = core.sunLight;
    state.sunSphere = core.sunSphere;

    try {
        // 2. Laad alle data
        const allData = await loadAllData();
        state.houseData  = allData.house;
        state.iotData    = allData.iot;
        state.staticData = allData.static;
        state.metricsData = allData.metrics;

        // console.log('🔍 Loaded static data:', state.staticData);
        // console.log('🔍 Is static data an array?', Array.isArray(state.staticData));
        // console.log('🔍 Static data length:', state.staticData?.length);

        if (!state.houseData) {
            throw new Error("Kritieke fout: house.yaml kon niet worden geladen.");
        }

        // 3. Definieer de sensorLijst één keer centraal
        const sensorLijst = state.iotData?.assets || state.iotData?.sensors || state.iotData;

        // 4. MQTT Initialisatie
        if (sensorLijst) {
            console.log("MQTT Service opstarten...");
            
            state.mqtt = new MqttService(config.MQTT_HOST, config.MQTT_PORT, config.MQTT_USER, config.MQTT_PASS);
            state.mqtt.setSensorData(sensorLijst);

            // Callback instellen
            state.mqtt.onMessageCallback = (entityId, value, attribute) => {
                // Check if this is a cover-related message
                const isCoverMessage = attribute === 'current_position' ||
                                      attribute === 'current_tilt_position' ||
                                      (attribute === 'state' && (value === 'open' || value === 'opening' || value === 'closed' || value === 'closing'));

                const blindObject = state.scene.getObjectByName('cover.' + entityId) ||
                        state.scene.getObjectByName(entityId);

                // if (isCoverMessage && blindObject) {
                //     console.log(`🔍 Found blind object: ${blindObject.name}, has animateBlinds: ${typeof blindObject.animateBlinds === 'function'}`);
                // } else if (isCoverMessage && !blindObject) {
                //     console.log(`⚠️ Blind object NOT found for: ${entityId} (tried: cover.${entityId} and ${entityId})`);
                // }

                if (blindObject && blindObject.animateBlinds) {
                    try {
                        // Initialize blind state if it doesn't exist
                        if (!state.blindStates[entityId]) {
                            state.blindStates[entityId] = { openAmount: 0, tiltRad: 0 };
                        }

                        if (attribute === 'state') {
                            const openAmount = (value === 'open' || value === 'opening') ? 0.95 : 0;
                            state.blindStates[entityId].openAmount = openAmount;
                            //console.log(`🪟 Animating ${entityId}: state=${value}, openAmount=${openAmount}`);
                            blindObject.animateBlinds(state.blindStates[entityId].tiltRad, openAmount);
                            return;
                        }

                        if (attribute === 'current_position') {
                            const position = parseFloat(value);
                            const openAmount = position / 100;
                            state.blindStates[entityId].openAmount = openAmount;
                            //console.log(`🪟 Animating ${entityId}: position=${position}%, openAmount=${openAmount}`);
                            blindObject.animateBlinds(state.blindStates[entityId].tiltRad, openAmount);
                            return;
                        }

                        if (attribute === 'current_tilt_position') {
                            const tiltDeg = parseFloat(value);
                            const tiltRad = (tiltDeg / 100) * (Math.PI / 2);
                            state.blindStates[entityId].tiltRad = tiltRad;
                            //console.log(`🪟 Animating ${entityId}: tilt=${tiltDeg}°, preserving openAmount=${state.blindStates[entityId].openAmount}`);
                            blindObject.animateBlinds(tiltRad, state.blindStates[entityId].openAmount);
                            return;
                        }
                    } catch (error) {
                        console.error('❌ Error animating blinds:', entityId, error);
                    }
                }

                // 1. Zoek de lamp op de meest directe manier
                const nameWithPrefix = 'light.' + entityId;
                const lightMesh = state.scene.getObjectByName(nameWithPrefix) || state.scene.getObjectByName(entityId);

                // Voor lampen: update bij state, rgb_color of brightness changes
                if (lightMesh && (attribute === 'state' || attribute === 'rgb_color' || attribute === 'brightness')) {
                    // console.log("✅ Lamp gevonden! Updating:", lightMesh.name, value);
                    updateSpotAppearance(lightMesh, value);
                    return;
                }

                // Check for metric labels (power, electricity, etc.)
                const metricElement = document.querySelector(`[data-metric-id="${entityId}"]`);
                // console.log('🔍 Metric check:', { entityId, attribute, metricElement: !!metricElement, value });
                if (metricElement && attribute === 'state') {
                    // console.log('⚡ Updating metric:', entityId, 'value:', value);
                    const valueEl = metricElement.querySelector('.metric-value');
                    const iconEl = metricElement.querySelector('.metric-icon');
                    // console.log('📊 Metric elements:', { valueEl: !!valueEl, iconEl: !!iconEl });
                    if (valueEl) {
                        const numValue = parseFloat(value);
                        
                        // Geforceerde scherpte: haal blur en schaduw weg bij elke update
                        valueEl.style.filter = 'none';
                        valueEl.style.textShadow = 'none';
                        valueEl.style.webkitFilter = 'blur(0px)';

                        if (!isNaN(numValue)) {
                            valueEl.textContent = `${numValue.toFixed(2)} kW`;

                            // Bepaal de kleur: Rood bij > 0, anders altijd Groen
                            const statusColor = (numValue > 0) ? '#ff0000' : '#00ff00';

                            // Pas de kleur toe op zowel de tekst als het icoon voor een strak resultaat
                            valueEl.style.color = statusColor;
                            if (iconEl) {
                                iconEl.style.color = statusColor;
                            }
                        } else {
                            valueEl.textContent = value;
                            valueEl.style.color = '#ffffff'; // Fallback naar wit als het geen getal is
                        }
                    }
                    return;
                }

                // --- Netwerk Logica ---
                const netwerkContainer = document.querySelector('[data-metric-id="netto_stroomverbruik"]');

                if (netwerkContainer && attribute === 'state') {
                    // Definieer de sensoren
                    const isDownload = entityId === 'dream_machine_special_edition_port_9_rx';
                    const isUpload = entityId === 'dream_machine_special_edition_port_9_tx';

                    if (isDownload || isUpload) {
                        const targetClass = isDownload ? '.download-speed' : '.upload-speed';
                        const el = netwerkContainer.querySelector(targetClass);
                        
                        if (el) {
                            const val = parseFloat(value);
                            if (!isNaN(val)) {
                                // Formatteer naar Mbps, of pas dit aan naar je eigen voorkeur
                                el.textContent = `${val.toFixed(1)} Mbps`;
                            } else {
                                el.textContent = '--';
                            }
                        }
                    }
                }

                const element = document.getElementById(`temp-pill-${entityId}`) ||
                                document.querySelector(`[data-binary-ids~="${entityId}"]`);
                if (!element) return;

                if (attribute === 'state') {
                    const isMotion = entityId.includes('beweging') || entityId.includes('motion');
                    if (isMotion) {
                        if (value === 'on' || value === 'occupied') {
                            element.classList.add('motion-active');
                        } else {
                            element.classList.remove('motion-active');
                        }
                    } else {
                        const tempSpan = element.querySelector('.temp-value');
                        const temp = parseFloat(value);
                        if (tempSpan && !isNaN(temp)) {
                            tempSpan.textContent = `${temp.toFixed(1)}°C`;
                            element.classList.remove('sensor-failed');
                        }
                    }
                }
            };
            // MQTT connect will be called after assets are built
        }

        // 5. Locatie & Zon
        const loc = state.houseData.metadata?.location;
        if (loc) {
            state.userLoc = loc;
            const locEl = document.getElementById('locDisplay');
            if (locEl) locEl.innerText = `Locatie: ${loc.lat}, ${loc.lon}`;
        }

        // 6. Bouw het huis
        buildHouse(state.houseData, state);

        // 6b. Bouw IoT assets (lampen, sensoren, etc.)
        buildAssets(state.iotData, state);

        // 6c. Bouw static assets (zonnepanelen, etc.)
        buildAssets(state.staticData, state);

        // 6d. Asset loading summary
        const lightCount = state.iotMeshes?.filter(item => item.data.type === 'lamp').length || 0;
        const blindsCount = state.iotMeshes?.filter(item => item.data.type === 'venetian_blinds').length || 0;
        const solarCount = state.iotMeshes?.filter(item => item.data.type === 'solar_panel').length || 0;
        console.log(`✅ Assets geladen: ${lightCount} lampen, ${blindsCount} blinds, ${solarCount} zonnepanelen (${state.scene.children.length} objecten)`);

        // 6e. Connect MQTT now that all assets exist
        if (state.mqtt) {
            console.log("🔌 Connecting to MQTT...");
            state.mqtt.connect();
        }

        // 7. IoT Labels plaatsen
        if (sensorLijst && Array.isArray(sensorLijst)) {
            sensorLijst.forEach(sensor => {
                const sId = sensor.id || sensor.entity_id;
                const x = parseFloat(sensor.x) || 0;
                const y = parseFloat(sensor.y) || 0;
                const z = parseFloat(sensor.z) || 0;

                // Skip lamps en blinds - die krijgen geen temperatuur labels
                if (sensor.type === 'lamp' || sensor.type === 'venetian_blinds') return;

                const div = document.createElement('div');
                div.id = `temp-pill-${sId}`;
                div.className = 'temp-pill';
                div.innerHTML = `
                    <div class="temp-value" style="font-size: 10px; font-weight: bold; margin-bottom: 2px;">--°C</div>
                    <div class="coord-display" style="font-size: 6px; font-family: monospace; opacity: 0.5;">
                        [${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}]
                    </div>
                `;

                const labelObj = new CSS2DObject(div);
                labelObj.position.set(x, y, z);
                state.scene.add(labelObj);
                state.sensorLabels.temperature.push(labelObj);
            });
        }

        // 7a. Koppel detectie-dots aan kamerlabels (via state.labelSprites, niet DOM)
        if (sensorLijst && Array.isArray(sensorLijst)) {
            sensorLijst.forEach(sensor => {
                if (!sensor.binary_id || !sensor.friendly_name) return;
                const match = state.labelSprites.find(sprite => {
                    const roomName = sprite.element.getAttribute('data-room-name');
                    return roomName === sensor.friendly_name || sensor.friendly_name.startsWith(roomName);
                });
                if (match) {
                    const existing = match.element.getAttribute('data-binary-ids') || '';
                    const ids = existing ? existing.split(' ') : [];
                    ids.push(sensor.binary_id);
                    match.element.setAttribute('data-binary-ids', ids.join(' '));
                }
            });
        }

        // 7b. Light Labels plaatsen (alleen naam)
        if (sensorLijst && Array.isArray(sensorLijst)) {
            sensorLijst.forEach(light => {
                if (light.type !== 'lamp') return;

                const x = parseFloat(light.x) || 0;
                const y = parseFloat(light.y) || 0;
                const z = parseFloat(light.z) || 0;

                // Gebruik ha_entity als naam
                const labelText = light.ha_entity || light.id;

                const div = document.createElement('div');
                div.id = `light-label-${light.id}`;
                div.className = 'light-label';
                div.innerHTML = `
                    <div>${labelText}</div>
                    <div class="coord-display" style="font-size: 6px; font-family: monospace; opacity: 0.5;">
                        [${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}]
                    </div>
                `;

                const labelObj = new CSS2DObject(div);
                labelObj.position.set(x, y, z);
                state.scene.add(labelObj);
                state.sensorLabels.lights.push(labelObj);
            });
        }

        // 7b2. Blind Labels plaatsen (alleen naam)
        if (sensorLijst && Array.isArray(sensorLijst)) {
            sensorLijst.forEach(blind => {
                if (blind.type !== 'venetian_blinds') return;

                const x = parseFloat(blind.x) || 0;
                const y = parseFloat(blind.y) || 0;
                const z = parseFloat(blind.z) || 0;

                const labelText = blind.friendly_name || blind.ha_entity || blind.id;

                const div = document.createElement('div');
                div.id = `blind-label-${blind.id}`;
                div.className = 'blind-label';
                div.innerHTML = `
                    <div>${labelText}</div>
                    <div class="coord-display" style="font-size: 6px; font-family: monospace; opacity: 0.5;">
                        [${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}]
                    </div>
                `;

                const labelObj = new CSS2DObject(div);
                labelObj.position.set(x, y, z);
                state.scene.add(labelObj);
                state.sensorLabels.blinds.push(labelObj);
            });
        }

        // 7b3. Metric labels (electricity, power, etc.)
        // console.log('🔍 Loaded metrics data:', state.metricsData);
        if (state.metricsData && Array.isArray(state.metricsData)) {
            state.metricsData.forEach(metric => {

            if (metric && (metric.id === 'dream_machine_special_edition_port_9_rx' || 
                       metric.id === 'dream_machine_special_edition_port_9_tx')) {
            return; 
        }
           
                const x = metric.position?.x || 0;
                const y = metric.position?.y || 0;
                const z = metric.position?.z || 0;

                const div = document.createElement('div');
                div.id = `metric-${metric.id}`;
                div.className = 'metric-label';
                div.setAttribute('data-metric-id', metric.id);
                div.setAttribute('data-metric-id', metric.id);

div.innerHTML = `
    <div style="display: flex; align-items: flex-start; gap: 6px; padding: 4px;">
        <div style="display: flex; flex-direction: column;">
            <div class="metric-name" style="font-size: 8px; opacity: 0.8; margin-bottom: 1px; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
                ${metric.name || metric.id}
            </div>
            
            <div class="metric-value" style="font-size: 11px; font-weight: 600; line-height: 1; color: white; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
                --
            </div>
            
            ${metric.id === 'netto_stroomverbruik' ? `
            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.2);">
                <div style="font-size: 8px; opacity: 0.8; margin-bottom: 1px; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
                    Current Internet speeds
                </div>
                <div style="display: flex; gap: 10px; font-size: 11px; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
                    <span style="color: #00aaff;">↓ <span class="download-speed">0.0 Mbps</span></span>
                    <span style="color: #a277ff;">↑ <span class="upload-speed">0.0 Mbps</span></span>
                </div>
            </div>
            ` : ''}
        </div>
    </div>
`;

                const labelObj = new CSS2DObject(div);
                labelObj.position.set(x, y, z);
                state.scene.add(labelObj);

                if (!state.sensorLabels.metrics) state.sensorLabels.metrics = [];
                state.sensorLabels.metrics.push(labelObj);
            });
        }

        // 7c. Defaults: light en blind labels uit, coördinaten uit
        state.sensorLabels.lights.forEach(s => s.visible = false);
        state.sensorLabels.blinds.forEach(s => s.visible = false);
        [...state.sensorLabels.temperature, ...state.sensorLabels.lights, ...state.sensorLabels.blinds].forEach(s => {
            const coord = s.element.querySelector('.coord-display');
            if (coord) coord.style.display = 'none';
        });

        // 8. Start simulatie & loop
        updateSun(12);
        animate(core.renderer, core.labelRenderer, core.scene, core.camera, core.controls);
        console.log("Digital Twin succesvol geïnitialiseerd.");

    } catch (err) {
        console.error("Fout bij initialisatie:", err);
    }
}
  
    // Functie voor Temperatuur/motion sensoren
export function updateTemperatureDisplay(sensorId, value, type = 'temperature') {
    const element = document.getElementById(`temp-pill-${sensorId}`) ||
                    document.querySelector(`[data-binary-ids~="${sensorId}"]`);

    if (!element) return;

    const valueEl = element.querySelector('.temp-value');
    const dotEl = element.querySelector('.status-dot');

    if (type === 'temperature') {
        const temp = parseFloat(value);
        if (!isNaN(temp) && valueEl) {
            valueEl.innerText = `${temp.toFixed(1)}°C`;

            // Kleur berekening (van koud blauw naar warm rood/oranje)
            const t = Math.max(0, Math.min(1, (temp - 15) / (30 - 15)));
            const r = Math.floor(173 + (255 - 173) * t);
            const g = Math.floor(216 + (0 - 216) * t);
            const b = Math.floor(230 + (0 - 230) * t);
            const color = `rgb(${r}, ${g}, ${b})`;

            // Pas kleur toe
            element.style.color = color;
        }
    }

    if (type === 'motion' || type === 'binary') {
        const isOn = (value === 'on' || value === 'occupied' || value === 'true');
        if (dotEl) {
            dotEl.className = `status-dot ${isOn ? 'status-detected' : 'status-clear'}`;
        }
    }
}

export function updateLightDisplay(entityId, lightState) {
    // console.log(`updateLightDisplay called for ${entityId}`, lightState);

    if (!state.iotMeshes) {
        console.warn(`state.iotMeshes is not defined`);
        return;
    }

    // console.log(`Total meshes in state.iotMeshes: ${state.iotMeshes.length}`);

    // Debug: Log all entityIds in iotMeshes
    // state.iotMeshes.forEach((item, idx) => {
    //     if (item.mesh && item.mesh.userData && item.mesh.userData.entityId) {
    //         console.log(`  [${idx}] entityId: ${item.mesh.userData.entityId}`);
    //     }
    // });

    // Zoek de lamp mesh met dit entityId
    const lightMesh = state.iotMeshes.find(item =>
        item.mesh && item.mesh.userData && item.mesh.userData.entityId === entityId
    );

    if (!lightMesh) {
        console.warn(`No mesh found for entityId: ${entityId}`);
        return;
    }

    // console.log(`Found mesh for ${entityId}, calling updateSpotAppearance`);

    // Use the centralized model update function from modelFusion.js
    updateSpotAppearance(lightMesh.mesh, lightState);
}

// Helper functie om de hoogte van het plafond te bepalen op basis van een profiel
function getCeilingHeight(z, profile) {
    if (!profile || !profile.points) return 2.6; 
    const pts = profile.points;
    for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        if (z >= a.z && z <= b.z) {
            const t = (z - a.z) / (b.z - a.z);
            return a.height + (b.height - a.height) * t;
        }
    }
    return pts[pts.length - 1].height;
}

// --- ZON LOGICA ---
function updateSun(hour) {
    const hourAngle = (hour - 12) * 15 * Math.PI / 180;
    const latRad = state.userLoc.lat * Math.PI / 180;
    const altitude = Math.asin(Math.sin(latRad) * Math.sin(-0.2) + Math.cos(latRad) * Math.cos(-0.2) * Math.cos(hourAngle));
    const azimuth = Math.acos((Math.sin(-0.2) - Math.sin(altitude) * Math.sin(latRad)) / (Math.cos(altitude) * Math.cos(latRad))) * (hour > 12 ? 1 : -1);

    const r = 50;
    const x = r * Math.cos(altitude) * Math.sin(azimuth);
    const y = r * Math.sin(altitude);
    const z = r * Math.cos(altitude) * Math.cos(azimuth);

    state.sunLight.position.set(x, y, z);
    state.sunSphere.position.set(x, y, z);

    // Verminder zonlicht intensiteit voor meer contrast met lampen
    state.sunLight.intensity = y > 0 ? 0.3 : 0;

    // Maak de lucht veel donkerder zodat lampen beter uitkomen
    // Max lightness = 0.15 (was 1.0), min = 0.02 (was 0.05)
    state.scene.background.setHSL(0.6, 0.3, Math.max(y / 50 * 0.15, 0.02));
}

// --- UI EVENT HANDLERS (Gekoppeld aan window.engine voor index.html) ---
window.engine = {
    toggleFloor: (level, btn) => {
        if (state.floorGroups[level]) {
            state.floorGroups[level].visible = !state.floorGroups[level].visible;
            btn.classList.toggle('active');
        }
    },

    toggleXRay: (isTrans) => {
        const wOp = isTrans ? 0.2 : 1.0;
        const fOp = isTrans ? 0.1 : 1.0;

        state.allWalls.forEach(w => {
            w.material.transparent = isTrans;
            w.material.opacity = wOp;
        });

        state.allFloors.forEach(f => {
            f.traverse(c => {
                if (c.isMesh) {
                    c.material.transparent = isTrans;
                    c.material.opacity = fOp;
                }
            });
        });

        state.allWindows.forEach(group => {
            group.traverse(child => {
                if (child.isMesh && child.material.transparent) {
                    if (child.userData.origOp === undefined) child.userData.origOp = child.material.opacity;
                    child.material.opacity = isTrans ? 0.05 : child.userData.origOp;
                }
            });
        });
    },

    toggleLabels: (visible) => state.labelSprites.forEach(l => l.visible = visible),
    
    toggleFloors: (visible) => state.allFloors.forEach(f => f.visible = visible),

    toggleTemperature: (visible) => {
        if (state.sensorLabels.temperature) {
            state.sensorLabels.temperature.forEach(s => s.visible = visible);
        }
    },

    toggleLights: (visible) => {
        if (state.sensorLabels.lights) {
            state.sensorLabels.lights.forEach(s => s.visible = visible);
        }
    },

    toggleBlinds: (visible) => {
        if (state.sensorLabels.blinds) {
            state.sensorLabels.blinds.forEach(s => s.visible = visible);
        }
    },

    toggleCoordinates: (visible) => {
        document.querySelectorAll('.coord-display').forEach(el => {
            el.style.display = visible ? '' : 'none';
        });
    },

    // Alleen de sensoren met type-fouten of ontbrekende types
    toggleFailedSensors: (visible) => {
        if (state.sensorLabels.failed) {
            state.sensorLabels.failed.forEach(s => s.visible = visible);
        }
    },

    toggleWalls: (show) => {
        if (!show) {
            state.allWalls.forEach(w => w.visible = false);
            state.allWindows.forEach(w => w.visible = false);
            return;
        }

        state.allWindows.forEach(w => w.visible = true);
        state.wallsFullHeight = !state.wallsFullHeight;
        
        const xrayToggle = document.querySelector('input[onchange*="toggleXRay"]');
        const isXRay = xrayToggle ? xrayToggle.checked : false;

        state.allWallData.forEach(data => {
            data.layerGroup.remove(data.mesh);

            // Als er een raam in zit, tekenen we de volle muur niet (raam-opening)
            if (data.hasWindow && state.wallsFullHeight) return;

            const dx = data.end[0] - data.start[0];
            const dy = data.end[1] - data.start[1];
            const len = Math.sqrt(dx * dx + dy * dy);
            
            const wallMat = new THREE.MeshPhongMaterial({
                color: 0xdddddd,
                side: THREE.DoubleSide,
                transparent: isXRay,
                opacity: isXRay ? 0.2 : 1.0
            });

            let newWall;
            if (state.wallsFullHeight) {
                // --- LOGICA VOOR SCHUINE MUREN ---
                if (data.floor && data.floor.ceiling_profile) {
                    // Gebruik de helper om hoogte aan begin en eind te bepalen
                    const hStart = getCeilingHeight(data.start[1], data.floor.ceiling_profile);
                    const hEnd = getCeilingHeight(data.end[1], data.floor.ceiling_profile);
                    
                    const shape = new THREE.Shape();
                    shape.moveTo(0, 0);
                    shape.lineTo(len, 0);
                    shape.lineTo(len, hEnd);
                    shape.lineTo(0, hStart);
                    shape.closePath();

                    newWall = new THREE.Mesh(
                        new THREE.ExtrudeGeometry(shape, { depth: 0.08, bevelEnabled: false }),
                        wallMat
                    );
                    // Bij Extrude ligt het nulpunt op het startpunt van de muur
                    newWall.position.set(data.start[0], data.yBase, data.start[1]);
                } else {
                    // STANDAARD RECHTE MUUR
                    newWall = new THREE.Mesh(new THREE.BoxGeometry(len, data.fullHeight, 0.08), wallMat);
                    newWall.position.set((data.start[0] + data.end[0]) / 2, data.yBase + (data.fullHeight / 2), (data.start[1] + data.end[1]) / 2);
                }
            } else {
                // LAGE MODUS (20cm)
                newWall = new THREE.Mesh(new THREE.BoxGeometry(len, 0.2, 0.08), wallMat);
                newWall.position.set((data.start[0] + data.end[0]) / 2, data.yBase + 0.1, (data.start[1] + data.end[1]) / 2);
            }

            newWall.rotation.y = -Math.atan2(dy, dx);
            newWall.castShadow = true;
            newWall.receiveShadow = true;
            
            data.layerGroup.add(newWall);
            data.mesh = newWall;
        });
        
        state.allWalls = state.allWallData.map(d => d.mesh);
    }
};

// --- ANIMATIE LOOP ---
function animate(renderer, labelRenderer, scene, camera, controls) {
    // Geef labelRenderer ook weer door aan de volgende frame
    requestAnimationFrame(() => animate(renderer, labelRenderer, scene, camera, controls));
    
    controls.update();
    
    // Render de 3D objecten
    renderer.render(scene, camera);
    
    // RENDER HIER DE LABELS:
    if (labelRenderer) {
        labelRenderer.render(scene, camera);
    }
}
// Slider koppelen voor zon-tijd
const timeSlider = document.getElementById('timeSlider');
if (timeSlider) {
    timeSlider.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        const display = document.getElementById('timeDisplay');
        if (display) {
            display.innerText = Math.floor(val) + ":" + Math.floor((val % 1) * 60).toString().padStart(2, '0');
        }
        updateSun(val);
    });
}



// Start de applicatie
init();