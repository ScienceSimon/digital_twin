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

// DOM element cache for O(1) lookups in MQTT hot path
const _domCache = new Map();
let _netwerkContainer = null;

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

        // 6. Radar beacon
        const mijnRadar = createRadarBeacon();
        state.scene.add(mijnRadar);
        state.iotMeshes.push({ mesh: mijnRadar, data: { id: 'radar_office_position' } });

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

                // --- Radar / Locatie Logica ---
                if (entityId === 'Radar_Location/Office') {
                    try {
                        const coords = typeof value === 'string' ? JSON.parse(value) : value;
                        const beaconEntry = state.iotMeshes.find(item => item.data.id === 'radar_office_position');

                        if (beaconEntry && coords.x && coords.z) {
                            gsap.to(beaconEntry.mesh.position, {
                                x: parseFloat(coords.x),
                                y: parseFloat(coords.y),
                                z: parseFloat(coords.z),
                                duration: 0.2,
                                ease: "power1.out"
                            });
                        }
                    } catch (e) {
                        // XYZ parse error
                    }
                }

                // Zoek de lamp
                const nameWithPrefix = 'light.' + entityId;
                const lightMesh = state.scene.getObjectByName(nameWithPrefix) || state.scene.getObjectByName(entityId);

                if (lightMesh && (attribute === 'state' || attribute === 'rgb_color' || attribute === 'brightness')) {
                    updateSpotAppearance(lightMesh, value);
                    return;
                }

                // Metric labels (power, electricity, etc.)
                let metricElement = _domCache.get(`metric:${entityId}`);
                if (!metricElement) {
                    metricElement = document.querySelector(`[data-metric-id="${entityId}"]`);
                    if (metricElement) _domCache.set(`metric:${entityId}`, metricElement);
                }

                if (metricElement && attribute === 'state') {
                    const valueEl = metricElement.querySelector('.metric-value');
                    const iconEl = metricElement.querySelector('.metric-icon');

                    if (valueEl) {
                        const numValue = parseFloat(value);

                        valueEl.style.filter = 'none';
                        valueEl.style.webkitFilter = 'none';
                        valueEl.style.textShadow = 'none';
                        valueEl.style.transform = 'translateZ(0)';
                        valueEl.style.backfaceVisibility = 'hidden';

                        if (!isNaN(numValue)) {
                            valueEl.textContent = `${numValue.toFixed(2)} kW`;
                            const statusColor = (numValue > 0) ? '#ec3c3c' : '#1dbe1d';
                            valueEl.style.color = statusColor;
                            if (iconEl) iconEl.style.color = statusColor;
                        } else {
                            valueEl.textContent = value;
                            valueEl.style.color = '#ffffff';
                        }
                    }
                    return;
                }

                // --- Netwerk Logica ---
                if (!_netwerkContainer) {
                    _netwerkContainer = document.querySelector('[data-metric-id="netto_stroomverbruik"]');
                }
                if (_netwerkContainer && attribute === 'state') {
                    const isDownload = entityId === 'dream_machine_special_edition_port_9_rx';
                    const isUpload = entityId === 'dream_machine_special_edition_port_9_tx';

                    if (isDownload || isUpload) {
                        const targetClass = isDownload ? '.download-speed' : '.upload-speed';
                        const el = _netwerkContainer.querySelector(targetClass);

                        if (el) {
                            const val = parseFloat(value);
                            if (!isNaN(val)) {
                                el.textContent = val < 1
                                    ? `${(val * 1000).toFixed(0)} Kbps`
                                    : `${val.toFixed(1)} Mbps`;
                            } else {
                                el.textContent = '--';
                            }
                        }
                    }

                }

                // Update ethernet beams that match this entity's rx/tx
                if (attribute === 'state' && state.ethernetBeams) {
                    state.ethernetBeams.forEach(mat => {
                        const val = parseFloat(value);
                        if (isNaN(val)) return;
                        const maxSpd = mat.userData.maxSpeed || 500;
                        const norm = Math.min(val, maxSpd) / maxSpd;
                        if (entityId === mat.userData.rx) mat.uniforms.uDownload.value = norm;
                        if (entityId === mat.userData.tx) mat.uniforms.uUpload.value = norm;

                        // Scale tube diameter based on combined traffic (1x to 2x)
                        const tube = mat.userData.tube;
                        if (tube) {
                            const combined = Math.max(mat.uniforms.uDownload.value, mat.uniforms.uUpload.value);
                            const scale = 1.0 + combined; // 1x at idle, 2x at max
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

                // Update per-device ethernet speed labels
                if (attribute === 'state' && state.ethernetDeviceMap) {
                    for (const [deviceId, mapping] of Object.entries(state.ethernetDeviceMap)) {
                        if (entityId === mapping.rx || entityId === mapping.tx) {
                            const isRx = entityId === mapping.rx;
                            const cls = isRx ? `eth-dl-${deviceId}` : `eth-ul-${deviceId}`;
                            let el = _domCache.get(`ethspeed:${cls}`);
                            if (!el) {
                                el = document.querySelector(`.${cls}`);
                                if (el) _domCache.set(`ethspeed:${cls}`, el);
                            }
                            if (el) {
                                const val = parseFloat(value);
                                if (!isNaN(val)) {
                                    el.textContent = val < 1
                                        ? `${(val * 1000).toFixed(0)} Kbps`
                                        : `${val.toFixed(1)} Mbps`;
                                }
                            }
                        }
                    }
                }

                // Sensor element lookup (lazy cache)
                let element = _domCache.get(`sensor:${entityId}`);
                if (!element) {
                    element = document.getElementById(`temp-pill-${entityId}`) ||
                              document.querySelector(`[data-binary-ids~="${entityId}"]`);
                    if (element) _domCache.set(`sensor:${entityId}`, element);
                }
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
            });
        }

        // 12. Defaults: light, blind en module labels uit, coördinaten uit
        state.sensorLabels.lights.forEach(s => s.visible = false);
        state.sensorLabels.blinds.forEach(s => s.visible = false);
        state.sensorLabels.ethernet.forEach(s => s.visible = false);
        if (state.sensorLabels.modules) state.sensorLabels.modules.forEach(s => s.visible = false);
        [...state.sensorLabels.temperature, ...state.sensorLabels.lights, ...state.sensorLabels.blinds, ...(state.sensorLabels.modules || [])].forEach(s => {
            const coord = s.element.querySelector('.coord-display');
            if (coord) coord.style.display = 'none';
        });

        // 13. Connect MQTT nu alle assets en labels bestaan
        if (state.mqtt) {
            console.log("🔌 Connecting to MQTT...");
            state.mqtt.connect();
        }

        console.log("Digital Twin succesvol geïnitialiseerd.");

    } catch (err) {
        // Initialization error
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

    // Animate ethernet beams
    if (state.ethernetBeams) {
        const t = performance.now() * 0.001;
        state.ethernetBeams.forEach(mat => { mat.uniforms.uTime.value = t; });
    }

    // Render de 3D objecten
    renderer.render(scene, camera);
    
    // RENDER HIER DE LABELS:
    if (labelRenderer) {
        labelRenderer.render(scene, camera);
    }
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