import * as THREE from 'three';
import config from './config.js';
import { initScene } from './modules/core/scene.js';
import { loadAllData } from './modules/core/loaders.js';
import { buildHouse } from './modules/builders/houseBuilder.js';
import { buildAssets } from './modules/builders/assetFactory.js';
import { MqttService } from './modules/core/MqttService.js';
import { CSS2DObject } from 'css2drenderer';
import { updateSpotAppearance, createRadarBeacon } from './modules/models/modelFusion.js'; 
import { gsap } from 'gsap';
import { SkySystem } from './modules/core/SkySystem.js';

// DOM refs cached at label creation time — zero querySelector at runtime
const _labelDomRefs = new Map();

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
        lights: [],
        blinds: [],
        ethernet: [],
        all: {}
    },
    floorGroups: {},
    wallsFullHeight: false,
    userLoc: { lat: 52.0, lon: 4.3 },
    blindStates: {},
    dataStore: {},
    sunOffset: 1.15 * Math.PI,
};

async function init() {
    // 1. Initialiseer de Three.js basis
    const core = initScene();
    state.scene = core.scene;
    state.sunLight = core.sunLight;
    state.sunSphere = core.sunSphere;

    try {
        // 2. Laad house.yaml eerst — rest laadt parallel op de achtergrond
        const { house, rest } = await loadAllData();
        state.houseData = house;

        if (!state.houseData) {
            throw new Error("Kritieke fout: house.yaml kon niet worden geladen.");
        }

        if (!state.iotMeshes) {
            state.iotMeshes = [];
        }

        // 3. Locatie & Zon
        const loc = state.houseData.metadata?.location;
        if (loc) {
            state.userLoc = loc;
            const locEl = document.getElementById('locDisplay');
            if (locEl) locEl.innerText = `Locatie: ${loc.lat}, ${loc.lon}`;
        }

        // 3b. Sky system
        state.skySystem = new SkySystem(state.scene, state.userLoc.lat, state.userLoc.lon);
        state.skySystem.startWeatherPolling();

        // 4. Bouw het huis & start renderen — gebruiker ziet meteen het huis
        buildHouse(state.houseData, state);
        const _now = new Date();
        updateSun(_now.getHours() + _now.getMinutes() / 60);
        animate(core.renderer, core.labelRenderer, core.scene, core.camera, core.controls);

        // Show "Loading..." overlay while assets load (house already visible)
        const loadingScreen = document.getElementById('loading-screen');
        const loadingText = document.getElementById('loading-text');
        if (loadingScreen) loadingScreen.style.display = 'flex';
        let _dots = 0;
        const _loadingInterval = setInterval(() => {
            _dots = (_dots % 3) + 1;
            if (loadingText) loadingText.textContent = 'Loading' + '.'.repeat(_dots);
        }, 500);

        // 5. Wacht op de rest van de data (was al aan het laden in parallel)
        const restData = await rest;
        state.iotData    = restData.iot;
        state.staticData = restData.static;
        state.metricsData = restData.metrics;

        // 6. Position beacons (dynamically created per tracked person)
        state.positionBeacons = {};

        // 7. Bouw IoT + static assets
        buildAssets(state.iotData, state);
        buildAssets(state.staticData, state);

        // 7b. Ethernet connections (animated data beams between assets)
        state.ethernetBeams = [];
        state.ethernetTubes = [];
        state.ethernetDeviceMap = {}; // maps device ID -> { rx, tx, maxSpeed } for label updates
        const ethernetData = restData.ethernet;
        const connections = ethernetData?.connections || ethernetData;
        if (Array.isArray(connections)) {
            const assetList = state.iotData?.assets || state.iotData || [];
            const assetMap = {};
            assetList.forEach(a => {
                const pos = a.position || { x: a.x || 0, y: a.y || 0, z: a.z || 0 };
                assetMap[a.id] = new THREE.Vector3(pos.x, pos.y, pos.z);
            });

            connections.forEach(conn => {
                const from = assetMap[conn.from];
                const to = assetMap[conn.to];
                if (!from || !to) return;

                // Build a tube along the path
                const path = new THREE.LineCurve3(from, to);
                const tubeGeo = new THREE.TubeGeometry(path, 64, 0.015, 8, false);

                const beamMat = new THREE.ShaderMaterial({
                    uniforms: {
                        uTime: { value: 0 },
                        uColorA: { value: new THREE.Color(0x00aaff) },  // download blue
                        uColorB: { value: new THREE.Color(0xa277ff) },  // upload purple
                        uDownload: { value: 0.0 },  // 0..1 normalized (0=idle, 1=500Mbps)
                        uUpload: { value: 0.0 },     // 0..1 normalized
                    },
                    vertexShader: `
                        varying vec2 vUv;
                        void main() {
                            vUv = uv;
                            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                        }
                    `,
                    fragmentShader: `
                        uniform float uTime;
                        uniform vec3 uColorA;
                        uniform vec3 uColorB;
                        uniform float uDownload;
                        uniform float uUpload;
                        varying vec2 vUv;

                        float hash(float n) {
                            return fract(sin(n) * 43758.5453);
                        }

                        void main() {
                            vec3 bg = vec3(0.01, 0.015, 0.035);
                            float pix = 0.0;
                            float purpleWeight = 0.0;
                            float totalWeight = 0.0;

                            // Download pixels (blue) — traveling from WAN to server
                            // Speed stays constant, density increases with traffic
                            float dlDensity = 5.0 + uDownload * 55.0;
                            float dlSpeed = 0.5;
                            float dlThresh = 0.92 - uDownload * 0.7;

                            float t1 = vUv.x + uTime * dlSpeed;
                            float s1 = fract(t1 * dlDensity);
                            float id1 = floor(t1 * dlDensity);
                            float on1 = step(dlThresh, hash(id1 * 1.17 + 0.31));
                            float p1 = smoothstep(0.04, 0.0, abs(s1 - 0.5)) * on1;
                            pix += p1;
                            totalWeight += p1;

                            // Second download layer
                            float t1b = vUv.x + uTime * dlSpeed * 1.3;
                            float s1b = fract(t1b * dlDensity * 0.7);
                            float id1b = floor(t1b * dlDensity * 0.7);
                            float on1b = step(dlThresh + 0.05, hash(id1b * 2.31 + 7.7));
                            float p1b = smoothstep(0.03, 0.0, abs(s1b - 0.5)) * on1b;
                            pix += p1b;
                            totalWeight += p1b;

                            // Upload pixels (purple) — traveling from server to WAN
                            float ulDensity = 5.0 + uUpload * 55.0;
                            float ulSpeed = 0.5;
                            float ulThresh = 0.92 - uUpload * 0.7;

                            float t2 = vUv.x - uTime * ulSpeed;
                            float s2 = fract(t2 * ulDensity);
                            float id2 = floor(t2 * ulDensity);
                            float on2 = step(ulThresh, hash(id2 * 2.71 + 5.13));
                            float p2 = smoothstep(0.04, 0.0, abs(s2 - 0.5)) * on2;
                            pix += p2;
                            purpleWeight += p2;
                            totalWeight += p2;

                            // Second upload layer
                            float t2b = vUv.x - uTime * ulSpeed * 0.8;
                            float s2b = fract(t2b * ulDensity * 0.6);
                            float id2b = floor(t2b * ulDensity * 0.6);
                            float on2b = step(ulThresh + 0.05, hash(id2b * 4.13 + 2.9));
                            float p2b = smoothstep(0.03, 0.0, abs(s2b - 0.5)) * on2b;
                            pix += p2b;
                            purpleWeight += p2b;
                            totalWeight += p2b;

                            // Color mix based on which direction dominates
                            float ratio = totalWeight > 0.0 ? purpleWeight / totalWeight : 0.5;
                            vec3 pixColor = mix(uColorA, uColorB, ratio);
                            vec3 col = bg + pixColor * pix;

                            float alpha = pix;
                            gl_FragColor = vec4(col, alpha);
                        }
                    `,
                    transparent: true,
                    depthWrite: false
                });

                const tube = new THREE.Mesh(tubeGeo, beamMat);
                tube.name = `eth_${conn.from}_${conn.to}`;
                // Store the direction vector for scaling perpendicular to the beam
                const dir = new THREE.Vector3().subVectors(to, from).normalize();
                tube.userData.beamDir = dir;
                state.scene.add(tube);
                beamMat.userData = {
                    rx: conn.rx || null,
                    tx: conn.tx || null,
                    maxSpeed: conn.max_speed || 500,
                    tube: tube
                };
                state.ethernetBeams.push(beamMat);
                state.ethernetTubes.push(tube);

            });

            // Build device-to-entity mapping: each 'to' device gets the rx/tx of its incoming connection
            connections.forEach(conn => {
                if (conn.to && conn.rx && conn.tx) {
                    state.ethernetDeviceMap[conn.to] = {
                        rx: conn.rx,
                        tx: conn.tx,
                        maxSpeed: conn.max_speed || 500
                    };
                }
            });
        }

        const lightCount = state.iotMeshes?.filter(item => item.data.type === 'lamp').length || 0;
        const blindsCount = state.iotMeshes?.filter(item => item.data.type === 'venetian_blinds').length || 0;
        const solarCount = state.iotMeshes?.filter(item => item.data.type === 'solar_panel').length || 0;
        console.log(`✅ Assets geladen: ${lightCount} lampen, ${blindsCount} blinds, ${solarCount} zonnepanelen (${state.scene.children.length} objecten)`);

        // Hide loading overlay
        clearInterval(_loadingInterval);
        if (loadingScreen) loadingScreen.style.display = 'none';

        // 8. Definieer de sensorLijst
        const sensorLijst = state.iotData?.assets || state.iotData?.sensors || state.iotData;

        // 9. MQTT Initialisatie + callback
        if (sensorLijst) {
            console.log("MQTT Service opstarten...");

            state.mqtt = new MqttService(config.MQTT_HOST, config.MQTT_PORT, config.MQTT_USER, config.MQTT_PASS);
            state.mqtt.setSensorData(sensorLijst);

            state.mqtt.onMessageCallback = (entityId, value, attribute) => {
                // Store all values in dataStore — DOM updates happen in updateLabels()
                state.dataStore[`${entityId}:${attribute}`] = value;

                // --- 3D mesh updates (immediate, no DOM) ---

                // Blinds animation
                const blindObject = state.scene.getObjectByName('cover.' + entityId) ||
                        state.scene.getObjectByName(entityId);

                if (blindObject && blindObject.animateBlinds) {
                    try {
                        if (!state.blindStates[entityId]) {
                            state.blindStates[entityId] = { openAmount: 0, tiltRad: 0 };
                        }

                        if (attribute === 'state') {
                            const openAmount = (value === 'open' || value === 'opening') ? 0.95 : 0;
                            state.blindStates[entityId].openAmount = openAmount;
                            blindObject.animateBlinds(state.blindStates[entityId].tiltRad, openAmount);
                            return;
                        }

                        if (attribute === 'current_position') {
                            const position = parseFloat(value);
                            const openAmount = position / 100;
                            state.blindStates[entityId].openAmount = openAmount;
                            blindObject.animateBlinds(state.blindStates[entityId].tiltRad, openAmount);
                            return;
                        }

                        if (attribute === 'current_tilt_position') {
                            const tiltDeg = parseFloat(value);
                            const tiltRad = (tiltDeg / 100) * (Math.PI / 2);
                            state.blindStates[entityId].tiltRad = tiltRad;
                            blindObject.animateBlinds(tiltRad, state.blindStates[entityId].openAmount);
                            return;
                        }
                    } catch (error) {
                        // Blind animation error
                    }
                }

                // Position beacon updates (multi-person)
                if (entityId === 'Position' || entityId.startsWith('Position/')) {
                    try {
                        const data = typeof value === 'string' ? JSON.parse(value) : value;

                        // Support both formats:
                        // Full: { presence, persons: [{x,y,z,...}, ...], updatedAt }
                        // Simple: { x, y, z }
                        const persons = data.persons
                            ? data.persons
                            : (data.x !== undefined ? [data] : []);


                        // Update or create a beacon for each person
                        persons.forEach((person, i) => {
                            if (!state.positionBeacons[i]) {
                                const beacon = createRadarBeacon();
                                state.scene.add(beacon);
                                state.positionBeacons[i] = beacon;
                            }
                            const beacon = state.positionBeacons[i];
                            beacon.visible = true;

                            gsap.to(beacon.position, {
                                x: parseFloat(person.x),
                                y: parseFloat(person.y),
                                z: parseFloat(person.z),
                                duration: 0.3,
                                ease: "power1.out"
                            });
                        });

                        // Hide beacons for persons no longer tracked
                        Object.keys(state.positionBeacons).forEach(key => {
                            if (parseInt(key) >= persons.length) {
                                state.positionBeacons[key].visible = false;
                            }
                        });

                        // If presence is explicitly false, hide all beacons
                        if (data.presence === false) {
                            Object.values(state.positionBeacons).forEach(b => b.visible = false);
                        }
                    } catch (e) {
                        console.error('Position beacon error:', e);
                    }
                    return;
                }

                // Light mesh appearance
                const nameWithPrefix = 'light.' + entityId;
                const lightMesh = state.scene.getObjectByName(nameWithPrefix) || state.scene.getObjectByName(entityId);

                if (lightMesh && (attribute === 'state' || attribute === 'rgb_color' || attribute === 'brightness')) {
                    updateSpotAppearance(lightMesh, value);
                    return;
                }

                // Ethernet beam shader uniforms + tube scaling
                if (attribute === 'state' && state.ethernetBeams) {
                    state.ethernetBeams.forEach(mat => {
                        const val = parseFloat(value);
                        if (isNaN(val)) return;
                        const maxSpd = mat.userData.maxSpeed || 500;
                        const norm = Math.min(val, maxSpd) / maxSpd;
                        if (entityId === mat.userData.rx) mat.uniforms.uDownload.value = norm;
                        if (entityId === mat.userData.tx) mat.uniforms.uUpload.value = norm;

                        const tube = mat.userData.tube;
                        if (tube) {
                            const combined = Math.max(mat.uniforms.uDownload.value, mat.uniforms.uUpload.value);
                            const scale = 1.0 + combined;
                            const dir = tube.userData.beamDir;
                            if (dir) {
                                tube.scale.set(
                                    1.0 + combined * Math.abs(1 - Math.abs(dir.x)),
                                    1.0 + combined * Math.abs(1 - Math.abs(dir.y)),
                                    1.0 + combined * Math.abs(1 - Math.abs(dir.z))
                                );
                            } else {
                                tube.scale.setScalar(scale);
                            }
                        }
                    });
                }

                // Media player musical notes (3D particle effect)
                if (attribute === 'state' && state.mediaPlayerNotes?.[entityId]) {
                    state.mediaPlayerNotes[entityId].material.uniforms.uActive.value =
                        (value === 'playing') ? 1.0 : 0.0;
                }

                // All DOM updates (metrics, WAN speeds, per-device speeds, temps, motion)
                // are now handled by updateLabels() in the animate loop via state.dataStore
            };
        }

        // 10. IoT Labels plaatsen (single pass over sensorLijst)
        if (sensorLijst && Array.isArray(sensorLijst)) {
            sensorLijst.forEach(sensor => {
                const sId = sensor.id || sensor.entity_id;
                const x = parseFloat(sensor.x !== undefined ? sensor.x : sensor.position?.x) || 0;
                const y = parseFloat(sensor.y !== undefined ? sensor.y : sensor.position?.y) || 0;
                const z = parseFloat(sensor.z !== undefined ? sensor.z : sensor.position?.z) || 0;

                if (sensor.type === 'lamp') {
                    const labelText = sensor.ha_entity || sensor.id;
                    const div = document.createElement('div');
                    div.id = `light-label-${sensor.id}`;
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
                } else if (sensor.type === 'venetian_blinds') {
                    const labelText = sensor.friendly_name || sensor.ha_entity || sensor.id;
                    const div = document.createElement('div');
                    div.id = `blind-label-${sensor.id}`;
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
                } else if (sensor.type === 'presence') {
                    const labelText = sensor.friendly_name || sensor.id;
                    const div = document.createElement('div');
                    div.id = `module-label-${sensor.id}`;
                    div.className = 'module-label';
                    div.innerHTML = `
                        <div>${labelText}</div>
                        <div class="coord-display" style="font-size: 6px; font-family: monospace; opacity: 0.5;">
                            [${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}]
                        </div>
                    `;
                    const labelObj = new CSS2DObject(div);
                    labelObj.position.set(x, y, z);
                    state.scene.add(labelObj);
                    if (!state.sensorLabels.modules) state.sensorLabels.modules = [];
                    state.sensorLabels.modules.push(labelObj);
                } else if (sensor.type === 'device') {
                    const labelText = sensor.friendly_name || sensor.name || sensor.id;
                    const div = document.createElement('div');
                    div.id = `device-label-${sensor.id}`;
                    div.className = 'device-label';
                    div.innerHTML = `
                        <div>${labelText}</div>
                        <div class="coord-display" style="font-size: 6px; font-family: monospace; opacity: 0.5;">
                            [${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}]
                        </div>
                    `;
                    const labelObj = new CSS2DObject(div);
                    labelObj.position.set(x, y, z);
                    state.scene.add(labelObj);
                    if (!state.sensorLabels.devices) state.sensorLabels.devices = [];
                    state.sensorLabels.devices.push(labelObj);
                } else if (sensor.type === 'Ethernet') {
                    const labelText = sensor.friendly_name || sensor.id;
                    const deviceMapping = state.ethernetDeviceMap?.[sensor.id];
                    const div = document.createElement('div');
                    div.id = `ethernet-label-${sensor.id}`;
                    div.className = 'ethernet-label';
                    div.innerHTML = `
                        <div>${labelText}</div>
                        ${deviceMapping ? `
                        <div style="display: flex; gap: 8px; font-size: 9px; font-weight: 600; margin-top: 2px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">
                            <span style="color: #00aaff;">↓ <span class="eth-dl-${sensor.id}">0 Kbps</span></span>
                            <span style="color: #a277ff;">↑ <span class="eth-ul-${sensor.id}">0 Kbps</span></span>
                        </div>
                        ` : ''}
                        <div class="coord-display" style="font-size: 6px; font-family: monospace; opacity: 0.5;">
                            [${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}]
                        </div>
                    `;
                    const labelObj = new CSS2DObject(div);
                    labelObj.position.set(x, y, z);
                    state.scene.add(labelObj);
                    state.sensorLabels.ethernet.push(labelObj);
                    // Cache ethernet speed span refs at creation time
                    if (deviceMapping) {
                        const dlSpan = div.querySelector(`.eth-dl-${sensor.id}`);
                        const ulSpan = div.querySelector(`.eth-ul-${sensor.id}`);
                        if (dlSpan) _labelDomRefs.set(`ethspeed:eth-dl-${sensor.id}`, { element: dlSpan, labelObj });
                        if (ulSpan) _labelDomRefs.set(`ethspeed:eth-ul-${sensor.id}`, { element: ulSpan, labelObj });
                    }
                } else if (sensor.type === 'radar_beacon') {
                    // No label needed for radar beacons
                } else {
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
                    // Cache temp value ref at creation time
                    const tempValue = div.querySelector('.temp-value');
                    if (tempValue) _labelDomRefs.set(`temp:${sId}`, { element: div, tempValue, labelObj });
                }

                // Koppel detectie-dots aan kamerlabels
                if (sensor.binary_id && sensor.friendly_name) {
                    const match = state.labelSprites.find(sprite => {
                        const roomName = sprite.element.getAttribute('data-room-name');
                        return roomName === sensor.friendly_name || sensor.friendly_name.startsWith(roomName);
                    });
                    if (match) {
                        const existing = match.element.getAttribute('data-binary-ids') || '';
                        const ids = existing ? existing.split(' ') : [];
                        ids.push(sensor.binary_id);
                        match.element.setAttribute('data-binary-ids', ids.join(' '));
                        // Cache binary sensor ref + status dot at creation time
                        const dotEl = match.element.querySelector('.status-dot');
                        _labelDomRefs.set(`sensor:${sensor.binary_id}`, { element: match.element, dotEl });
                    }
                }
            });
        }

        // 11. Metric labels (electricity, power, etc.)
        if (state.metricsData && Array.isArray(state.metricsData)) {
            state.metricsData.forEach(metric => {
                if (!metric) return;
                // Skip metrics without a position (e.g. port rx/tx entities used only for MQTT)
                if (!metric.position) return;
                if (metric.type === 'radar_beacon') return;

                const x = metric.position?.x || 0;
                const y = metric.position?.y || 0;
                const z = metric.position?.z || 0;

                const div = document.createElement('div');
                div.id = `metric-${metric.id}`;
                div.className = 'metric-label';
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

                // Cache metric DOM refs at creation time
                const metricValue = div.querySelector('.metric-value');
                const metricIcon = div.querySelector('.metric-icon');
                _labelDomRefs.set(`metric:${metric.id}`, { element: div, metricValue, metricIcon, labelObj });

                // Cache WAN speed refs if this is the netto_stroomverbruik metric
                if (metric.id === 'netto_stroomverbruik') {
                    const dlEl = div.querySelector('.download-speed');
                    const ulEl = div.querySelector('.upload-speed');
                    if (dlEl) _labelDomRefs.set('wan:download', { element: dlEl, labelObj });
                    if (ulEl) _labelDomRefs.set('wan:upload', { element: ulEl, labelObj });
                }
            });
        }

        // 12. Defaults: light, blind en module labels uit, coördinaten uit
        state.sensorLabels.lights.forEach(s => s.visible = false);
        state.sensorLabels.blinds.forEach(s => s.visible = false);
        state.sensorLabels.ethernet.forEach(s => s.visible = false);
        if (state.sensorLabels.modules) state.sensorLabels.modules.forEach(s => s.visible = false);
        if (state.sensorLabels.devices) state.sensorLabels.devices.forEach(s => s.visible = false);
        [...state.sensorLabels.temperature, ...state.sensorLabels.lights, ...state.sensorLabels.blinds, ...(state.sensorLabels.modules || []), ...(state.sensorLabels.devices || [])].forEach(s => {
            const coord = s.element.querySelector('.coord-display');
            if (coord) coord.style.display = 'none';
        });

        // 13. Media player musical notes
        state.mediaPlayerNotes = {};
        try {
            if (sensorLijst && Array.isArray(sensorLijst)) {
                const noteTexture = createNoteAtlas();
                sensorLijst.forEach(sensor => {
                    if (sensor.ha_entity && sensor.ha_entity.startsWith('media_player.')) {
                        const mqttId = sensor.ha_entity.replace('media_player.', '');
                        const pos = sensor.position || { x: parseFloat(sensor.x) || 0, y: parseFloat(sensor.y) || 0, z: parseFloat(sensor.z) || 0 };
                        const notes = createMusicNotes(pos, noteTexture);
                        state.scene.add(notes);
                        state.mediaPlayerNotes[mqttId] = notes;
                    }
                });
            }
        } catch (noteErr) {
            console.error("Music notes init failed (non-fatal):", noteErr);
        }

        // 14. Connect MQTT nu alle assets en labels bestaan
        if (state.mqtt) {
            console.log("🔌 Connecting to MQTT...");
            state.mqtt.connect();
        }

        console.log("Digital Twin succesvol geïnitialiseerd.");

    } catch (err) {
        console.error("Initialization error:", err);
    }
}
  
    // Functie voor Temperatuur/motion sensoren — stores to dataStore only, DOM updated in updateLabels()
export function updateTemperatureDisplay(sensorId, value, type = 'temperature') {
    if (type === 'temperature') {
        state.dataStore[`${sensorId}:temperature`] = value;
    } else {
        state.dataStore[`${sensorId}:motion`] = value;
    }
}

export function updateLightDisplay(entityId, lightState) {
    if (!state.iotMeshes) {
        return;
    }

    // Zoek de lamp mesh met dit entityId
    const lightMesh = state.iotMeshes.find(item =>
        item.mesh && item.mesh.userData && item.mesh.userData.entityId === entityId
    );

    if (!lightMesh) {
        return;
    }

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
    if (!state.sunLight || !state.sunSphere) return;
    const hourAngle = (hour - 12) * 15 * Math.PI / 180;
    const latRad = state.userLoc.lat * Math.PI / 180;
    const altitude = Math.asin(Math.sin(latRad) * Math.sin(-0.2) + Math.cos(latRad) * Math.cos(-0.2) * Math.cos(hourAngle));
    const azimuth = Math.acos((Math.sin(-0.2) - Math.sin(altitude) * Math.sin(latRad)) / (Math.cos(altitude) * Math.cos(latRad))) * (hour > 12 ? 1 : -1);
    const finalAzimuth = azimuth + (state.sunOffset || 0);
    
    const r = 50;
    const x = r * Math.cos(altitude) * Math.sin(finalAzimuth);
    const y = r * Math.sin(altitude);
    const z = r * Math.cos(altitude) * Math.cos(finalAzimuth);

    state.sunLight.position.set(x, y, z);
    state.sunSphere.position.set(x, y, z);

    // Verminder zonlicht intensiteit voor meer contrast met lampen
    state.sunLight.intensity = y > 0 ? 0.3 : 0;

    // Hide sun sphere when well below horizon (fade over ~15° range)
    const altDeg = altitude * 180 / Math.PI;
    if (altDeg < -15) {
        state.sunSphere.visible = false;
    } else if (altDeg < 0) {
        state.sunSphere.visible = true;
        state.sunSphere.material.opacity = 1 - Math.abs(altDeg) / 15;
        state.sunSphere.material.transparent = true;
    } else {
        state.sunSphere.visible = true;
        state.sunSphere.material.opacity = 1;
        state.sunSphere.material.transparent = false;
    }

    // Update sky dome and stars
    if (state.skySystem) {
        state.skySystem.update(hour, altitude);
    }
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

    toggleModules: (visible) => {
        if (state.sensorLabels.modules) {
            state.sensorLabels.modules.forEach(s => s.visible = visible);
        }
    },

    toggleEthernet: (visible) => {
        if (state.ethernetTubes) {
            state.ethernetTubes.forEach(tube => tube.visible = visible);
        }
    },

    toggleEthernetLabels: (visible) => {
        if (state.sensorLabels.ethernet) {
            state.sensorLabels.ethernet.forEach(s => s.visible = visible);
        }
    },

    toggleDevices: (visible) => {
        if (state.sensorLabels.devices) {
            state.sensorLabels.devices.forEach(s => s.visible = visible);
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

// --- MUSICAL NOTES PARTICLE SYSTEM ---
function createNoteAtlas() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 256, 64);
    const notes = ['\u266A', '\u266B', '\u266C', '\u2669']; // ♪ ♫ ♬ ♩
    ctx.font = 'bold 48px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    notes.forEach((note, i) => {
        ctx.fillText(note, i * 64 + 32, 32);
    });
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
}

function createMusicNotes(position, noteTexture) {
    const count = 20;
    const geo = new THREE.BufferGeometry();
    const offsets = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const sizes = new Float32Array(count);
    const noteTypes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
        offsets[i * 3]     = (Math.random() - 0.5) * 0.4;
        offsets[i * 3 + 1] = Math.random();
        offsets[i * 3 + 2] = (Math.random() - 0.5) * 0.4;
        phases[i] = Math.random() * Math.PI * 2;
        sizes[i] = 1.5 + Math.random() * 2;
        noteTypes[i] = Math.floor(Math.random() * 4);
    }

    geo.setAttribute('position', new THREE.BufferAttribute(offsets, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geo.setAttribute('aNoteType', new THREE.BufferAttribute(noteTypes, 1));

    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uOrigin: { value: new THREE.Vector3(position.x, position.y, position.z) },
            uActive: { value: 0.0 },
            uTexture: { value: noteTexture },
        },
        vertexShader: `
            attribute float aPhase;
            attribute float aSize;
            attribute float aNoteType;
            uniform float uTime;
            uniform vec3 uOrigin;
            uniform float uActive;
            varying float vAlpha;
            varying float vNoteType;

            void main() {
                float cycle = fract(uTime * 0.3 + aPhase / 6.2832);
                float y = cycle * 1.5;
                float sway = sin(uTime * 1.5 + aPhase) * 0.15;

                vec3 pos = uOrigin + vec3(
                    position.x + sway,
                    position.y * 0.2 + y,
                    position.z + cos(uTime * 1.2 + aPhase * 1.7) * 0.08
                );

                vAlpha = uActive * (1.0 - cycle) * smoothstep(0.0, 0.1, cycle);
                vNoteType = aNoteType;

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                gl_PointSize = aSize * uActive * (200.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform sampler2D uTexture;
            varying float vAlpha;
            varying float vNoteType;

            void main() {
                vec2 uv = gl_PointCoord;
                uv.x = (uv.x + vNoteType) * 0.25;
                vec4 tex = texture2D(uTexture, uv);
                if (tex.a < 0.1) discard;
                gl_FragColor = vec4(0.7, 0.4, 1.0, tex.a * vAlpha);
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });

    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return points;
}

// --- THROTTLED LABEL UPDATES (max 10fps, frustum-culled) ---
let _lastLabelUpdate = 0;
const _frustum = new THREE.Frustum();
const _projScreenMatrix = new THREE.Matrix4();

function updateLabels(camera) {
    const now = performance.now();
    if (now - _lastLabelUpdate < 100) return; // 10fps max
    _lastLabelUpdate = now;

    // Build frustum from camera
    _projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_projScreenMatrix);

    for (const [key, refs] of _labelDomRefs) {
        // Frustum check: skip if CSS2DObject is not visible or outside camera view
        if (refs.labelObj && (!refs.labelObj.visible || !_frustum.containsPoint(refs.labelObj.position))) continue;

        if (key.startsWith('metric:')) {
            const entityId = key.slice(7); // e.g. "netto_stroomverbruik"
            const val = state.dataStore[`${entityId}:state`];
            if (val !== undefined && refs.metricValue) {
                const num = parseFloat(val);
                if (!isNaN(num)) {
                    refs.metricValue.textContent = `${num.toFixed(2)} kW`;
                    const color = num > 0 ? '#ec3c3c' : '#1dbe1d';
                    refs.metricValue.style.color = color;
                    if (refs.metricIcon) refs.metricIcon.style.color = color;
                } else {
                    refs.metricValue.textContent = val;
                    refs.metricValue.style.color = '#ffffff';
                }
            }
        } else if (key.startsWith('wan:')) {
            const isDownload = key === 'wan:download';
            const entityId = isDownload
                ? 'dream_machine_special_edition_port_9_rx'
                : 'dream_machine_special_edition_port_9_tx';
            const val = state.dataStore[`${entityId}:state`];
            if (val !== undefined && refs.element) {
                const num = parseFloat(val);
                if (!isNaN(num)) {
                    refs.element.textContent = num < 1
                        ? `${(num * 1000).toFixed(0)} Kbps`
                        : `${num.toFixed(1)} Mbps`;
                } else {
                    refs.element.textContent = '--';
                }
            }
        } else if (key.startsWith('ethspeed:')) {
            // key = "ethspeed:eth-dl-{deviceId}" or "ethspeed:eth-ul-{deviceId}"
            const cls = key.slice(9); // e.g. "eth-dl-server_rack"
            const isRx = cls.startsWith('eth-dl-');
            const deviceId = cls.slice(7); // strip "eth-dl-" or "eth-ul-"
            const mapping = state.ethernetDeviceMap?.[deviceId];
            if (mapping) {
                const entityId = isRx ? mapping.rx : mapping.tx;
                const val = state.dataStore[`${entityId}:state`];
                if (val !== undefined && refs.element) {
                    const num = parseFloat(val);
                    if (!isNaN(num)) {
                        refs.element.textContent = num < 1
                            ? `${(num * 1000).toFixed(0)} Kbps`
                            : `${num.toFixed(1)} Mbps`;
                    }
                }
            }
        }
        else if (key.startsWith('temp:')) {
            const sensorId = key.slice(5);
            // Temperature update
            const tempVal = state.dataStore[`${sensorId}:temperature`] ?? state.dataStore[`${sensorId}:state`];
            if (tempVal !== undefined && refs.tempValue) {
                const temp = parseFloat(tempVal);
                if (!isNaN(temp)) {
                    refs.tempValue.textContent = `${temp.toFixed(1)}°C`;
                    // Color from cool blue to warm red
                    const t = Math.max(0, Math.min(1, (temp - 15) / (30 - 15)));
                    const r = Math.floor(173 + (255 - 173) * t);
                    const g = Math.floor(216 + (0 - 216) * t);
                    const b = Math.floor(230 + (0 - 230) * t);
                    refs.element.style.color = `rgb(${r}, ${g}, ${b})`;
                    refs.element.classList.remove('sensor-failed');
                }
            }
        } else if (key.startsWith('sensor:')) {
            const sensorId = key.slice(7);
            // Motion/binary sensor update — toggle status-dot green/red
            const motionVal = state.dataStore[`${sensorId}:motion`] ?? state.dataStore[`${sensorId}:state`];
            if (motionVal !== undefined && refs.dotEl) {
                const isOn = motionVal === 'on' || motionVal === 'occupied' || motionVal === 'true';
                refs.dotEl.className = `status-dot ${isOn ? 'status-detected' : 'status-clear'}`;
            }
        }
    }
}

// --- ANIMATIE LOOP ---
function animate(renderer, labelRenderer, scene, camera, controls) {
    requestAnimationFrame(() => animate(renderer, labelRenderer, scene, camera, controls));

    controls.update();

    // Animate ethernet beams + musical notes
    const t = performance.now() * 0.001;
    if (state.ethernetBeams) {
        state.ethernetBeams.forEach(mat => { mat.uniforms.uTime.value = t; });
    }
    if (state.mediaPlayerNotes) {
        for (const notes of Object.values(state.mediaPlayerNotes)) {
            notes.material.uniforms.uTime.value = t;
        }
    }

    // Throttled DOM label updates (10fps, frustum-culled)
    updateLabels(camera);

    // Render
    renderer.render(scene, camera);
    if (labelRenderer) labelRenderer.render(scene, camera);
}
// Slider koppelen voor zon-tijd
const timeSlider = document.getElementById('timeSlider');
const timeDisplayEl = document.getElementById('time-display');
const timeLiveBtn = document.getElementById('time-live-btn');
let _liveMode = true;
let _liveInterval = null;

function _tickLive() {
    const now = new Date();
    const localHour = now.getHours() + now.getMinutes() / 60;
    if (timeSlider) timeSlider.value = localHour;
    if (timeDisplayEl) timeDisplayEl.innerText = now.getHours() + ":" + now.getMinutes().toString().padStart(2, '0');
    updateSun(localHour);
}

function _startLiveMode() {
    _liveMode = true;
    if (timeLiveBtn) timeLiveBtn.style.display = 'none';
    _tickLive();
    if (_liveInterval) clearInterval(_liveInterval);
    _liveInterval = setInterval(_tickLive, 30000); // update every 30s
}

function _stopLiveMode() {
    _liveMode = false;
    if (_liveInterval) { clearInterval(_liveInterval); _liveInterval = null; }
    if (timeLiveBtn) timeLiveBtn.style.display = 'inline-block';
}

if (timeSlider) {
    _startLiveMode();

    timeSlider.addEventListener('input', (e) => {
        if (_liveMode) _stopLiveMode();
        const val = parseFloat(e.target.value);
        if (timeDisplayEl) {
            timeDisplayEl.innerText = Math.floor(val) + ":" + Math.floor((val % 1) * 60).toString().padStart(2, '0');
        }
        updateSun(val);
    });
}

window.engine.resetTimeToLive = _startLiveMode;



// Start de applicatie
init();