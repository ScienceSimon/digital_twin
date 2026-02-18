import * as THREE from 'three';

// =============================================
// BRIGHT STAR CATALOG (RA in degrees, Dec in degrees, magnitude)
// Top ~50 brightest stars visible from lat ~52°N
// =============================================
const BRIGHT_STARS = [
    // name, RA(deg), Dec(deg), apparent magnitude
    [0.00, 89.26, 2.0],   // Polaris
    [101.29, -16.72, -1.46], // Sirius
    [213.92, 19.18, -0.05],  // Arcturus
    [279.23, 38.78, 0.03],   // Vega
    [78.63, 45.99, 0.08],    // Capella
    [114.83, 5.22, 0.34],    // Procyon
    [68.98, 16.51, 0.87],    // Aldebaran
    [88.79, 7.41, 0.12],     // Betelgeuse
    [95.99, -52.70, -0.72],  // Canopus (low on horizon)
    [152.09, 11.97, 1.35],   // Regulus
    [344.41, -29.62, 1.16],  // Fomalhaut
    [37.95, 89.26, 2.08],    // Polaris (Kochab neighbor)
    [206.89, 49.31, 1.77],   // Alkaid
    [193.51, 55.96, 1.77],   // Alioth
    [165.93, 61.75, 1.79],   // Dubhe
    [200.98, 54.93, 2.23],   // Mizar
    [187.01, 57.03, 2.37],   // Phad
    [178.46, 53.69, 2.44],   // Merak
    [183.86, 57.03, 3.31],   // Megrez
    [186.65, 28.27, 2.14],   // Denebola
    [263.40, 12.56, 0.96],   // Rasalhague (near)
    [269.15, 51.49, 2.23],   // Eltanin
    [310.36, 45.28, 1.25],   // Deneb
    [326.05, 9.88, 2.49],    // Enif
    [345.94, 28.08, 2.06],   // Scheat
    [2.10, 29.09, 2.06],     // Alpheratz
    [30.97, 42.33, 2.07],    // Mirach
    [24.43, 56.54, 2.23],    // Schedar
    [14.18, 60.72, 2.27],    // Caph
    [28.60, 20.81, 2.00],    // Hamal
    [51.08, 49.86, 1.79],    // Mirfak
    [84.05, -1.20, 1.70],    // Bellatrix
    [81.28, 6.35, 1.64],     // Mintaka
    [83.00, -0.30, 1.69],    // Alnilam
    [85.19, -1.94, 2.09],    // Alnitak
    [81.57, -17.82, 2.58],   // Cursa
    [107.10, -26.39, 1.50],  // Wezen
    [95.67, -17.96, 1.84],   // Mirzam
    [104.66, -28.97, 1.83],  // Adhara
    [116.33, 28.03, 1.93],   // Pollux
    [113.65, 31.89, 1.58],   // Castor
    [138.30, -69.72, 1.67],  // Miaplacidus
    [191.93, -59.69, 0.77],  // Hadar
    [219.90, -60.83, -0.01], // Rigil Kentaurus
    [247.35, -26.43, 0.96],  // Antares
    [262.69, -25.42, 2.05],  // Shaula
    [283.82, -26.30, 2.60],  // Kaus Australis
    [286.35, 13.86, 0.76],   // Altair
    [297.70, 8.87, 2.72],    // Tarazed
];

// =============================================
// SKY GRADIENT SHADER
// =============================================
const skyVertexShader = `
varying vec3 vWorldPosition;
void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const skyFragmentShader = `
uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform vec3 uGroundColor;
uniform float uHaze;
varying vec3 vWorldPosition;

void main() {
    float height = normalize(vWorldPosition).y;

    // Below horizon: ground color
    if (height < 0.0) {
        gl_FragColor = vec4(uGroundColor, 1.0);
        return;
    }

    // Sky gradient with haze near horizon
    float t = smoothstep(0.0, 0.45, height);
    vec3 sky = mix(uHorizonColor, uZenithColor, t);

    // Haze effect (weather-driven)
    vec3 hazeColor = mix(uHorizonColor, vec3(0.7, 0.7, 0.72), 0.3);
    float hazeFactor = (1.0 - smoothstep(0.0, 0.25, height)) * uHaze;
    sky = mix(sky, hazeColor, hazeFactor);

    gl_FragColor = vec4(sky, 1.0);
}`;

// =============================================
// SKY SYSTEM CLASS
// =============================================
export class SkySystem {
    constructor(scene, lat, lon) {
        this.scene = scene;
        this.lat = lat;
        this.lon = lon;
        this.weather = { cloudCover: 0, weatherCode: 0, isDay: true };
        this._pollTimer = null;

        // Sky dome
        const skyGeo = new THREE.SphereGeometry(400, 32, 32);
        this.skyUniforms = {
            uZenithColor: { value: new THREE.Color(0x1a1a2e) },
            uHorizonColor: { value: new THREE.Color(0x1a1a2e) },
            uGroundColor: { value: new THREE.Color(0x000000) },
            uHaze: { value: 0.0 }
        };
        const skyMat = new THREE.ShaderMaterial({
            vertexShader: skyVertexShader,
            fragmentShader: skyFragmentShader,
            uniforms: this.skyUniforms,
            side: THREE.BackSide,
            depthWrite: false
        });
        this.skyDome = new THREE.Mesh(skyGeo, skyMat);
        this.skyDome.renderOrder = -1;
        scene.add(this.skyDome);

        // Stars
        this._createStars();

        // Reusable color objects
        this._zenith = new THREE.Color();
        this._horizon = new THREE.Color();
    }

    _createStars() {
        const count = 800;
        const positions = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        const r = 380;

        // First 50: real bright stars
        for (let i = 0; i < BRIGHT_STARS.length && i < count; i++) {
            const [ra, dec, mag] = BRIGHT_STARS[i];
            const raRad = ra * Math.PI / 180;
            const decRad = dec * Math.PI / 180;
            // Store in equatorial coords — we'll rotate the whole group by LST
            positions[i * 3] = r * Math.cos(decRad) * Math.cos(raRad);
            positions[i * 3 + 1] = r * Math.sin(decRad);
            positions[i * 3 + 2] = r * Math.cos(decRad) * Math.sin(raRad);
            // Brighter stars = larger points (mag scale is inverted)
            sizes[i] = Math.max(1.5, 4.0 - mag * 0.8);
        }

        // Remaining: random background stars
        for (let i = BRIGHT_STARS.length; i < count; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);
            sizes[i] = 0.5 + Math.random() * 1.5;
        }

        const starGeo = new THREE.BufferGeometry();
        starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        starGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const starMat = new THREE.PointsMaterial({
            color: 0xffffff,
            sizeAttenuation: false,
            transparent: true,
            opacity: 0,
            depthWrite: false
        });

        this.stars = new THREE.Points(starGeo, starMat);
        this.scene.add(this.stars);
    }

    /**
     * Calculate Local Sidereal Time in degrees
     */
    _getLocalSiderealTime(hour) {
        const now = new Date();
        // Use slider hour but current date
        const utcHour = hour - (now.getTimezoneOffset() / -60);

        // Days since J2000.0 (2000-01-01 12:00 UTC)
        const y = now.getFullYear();
        const m = now.getMonth() + 1;
        const d = now.getDate();
        const jd = 367 * y - Math.floor(7 * (y + Math.floor((m + 9) / 12)) / 4) + Math.floor(275 * m / 9) + d + 1721013.5 + utcHour / 24;
        const daysSinceJ2000 = jd - 2451545.0;

        // Greenwich Sidereal Time
        let lst = 100.46 + 0.985647 * daysSinceJ2000 + this.lon + 15 * utcHour;
        lst = ((lst % 360) + 360) % 360;
        return lst;
    }

    /**
     * Update sky based on time and weather
     * @param {number} hour - Solar hour (0-24)
     * @param {number} sunAltitude - Sun altitude in radians
     */
    update(hour, sunAltitude) {
        const sunDeg = sunAltitude * 180 / Math.PI;
        const cloud = this.weather.cloudCover / 100; // 0..1

        // === SKY COLORS ===
        if (sunDeg > 10) {
            // Full day
            this._zenith.setRGB(0.15, 0.35, 0.65);
            this._horizon.setRGB(0.55, 0.70, 0.85);
        } else if (sunDeg > 0) {
            // Low sun (near horizon)
            const t = sunDeg / 10;
            this._zenith.setRGB(
                0.10 + t * 0.05,
                0.15 + t * 0.20,
                0.35 + t * 0.30
            );
            this._horizon.setRGB(
                0.75 - t * 0.20,
                0.45 + t * 0.25,
                0.30 + t * 0.55
            );
        } else if (sunDeg > -6) {
            // Civil twilight
            const t = (sunDeg + 6) / 6; // 1 at horizon, 0 at -6°
            this._zenith.setRGB(
                0.05 + t * 0.05,
                0.05 + t * 0.10,
                0.12 + t * 0.23
            );
            this._horizon.setRGB(
                0.15 + t * 0.60,
                0.10 + t * 0.35,
                0.08 + t * 0.22
            );
        } else if (sunDeg > -12) {
            // Nautical twilight
            const t = (sunDeg + 12) / 6;
            this._zenith.setRGB(0.002 + t * 0.048, 0.002 + t * 0.048, 0.008 + t * 0.112);
            this._horizon.setRGB(0.002 + t * 0.148, 0.002 + t * 0.098, 0.008 + t * 0.072);
        } else {
            // Full night — horizon matches zenith for no visible band
            this._zenith.setRGB(0.002, 0.002, 0.008);
            this._horizon.setRGB(0.002, 0.002, 0.008);
        }

        // Cloud cover: blend toward grey
        if (cloud > 0) {
            const wmo = this.weather.weatherCode;
            let cloudColor;
            if (sunDeg > 0) {
                // Day clouds
                if (wmo >= 95) cloudColor = new THREE.Color(0.25, 0.25, 0.28); // thunderstorm
                else if (wmo >= 51) cloudColor = new THREE.Color(0.35, 0.35, 0.38); // rain/drizzle
                else if (wmo >= 45) cloudColor = new THREE.Color(0.50, 0.50, 0.52); // fog
                else cloudColor = new THREE.Color(0.55, 0.58, 0.62); // regular clouds
            } else {
                // Night clouds — nearly invisible
                cloudColor = new THREE.Color(0.005, 0.005, 0.01);
            }

            if (cloudColor) {
                this._zenith.lerp(cloudColor, cloud * 0.7);
                this._horizon.lerp(cloudColor, cloud * 0.5);
            }
        }

        this.skyUniforms.uZenithColor.value.copy(this._zenith);
        this.skyUniforms.uHorizonColor.value.copy(this._horizon);
        // Haze only during day — at night it creates a bright horizon band
        const hazeStrength = sunDeg > 0 ? cloud * 0.8 : sunDeg > -6 ? cloud * 0.3 * ((sunDeg + 6) / 6) : 0;
        this.skyUniforms.uHaze.value = hazeStrength;

        // === STARS ===
        // Stars visible when sun is below -6° (civil twilight ends)
        if (sunDeg < -6) {
            const starOpacity = Math.min(1, (-sunDeg - 6) / 6) * (1 - cloud * 0.9);
            this.stars.material.opacity = starOpacity;
            this.stars.visible = starOpacity > 0.01;

            // Rotate star sphere by local sidereal time
            const lst = this._getLocalSiderealTime(hour);
            const latRad = this.lat * Math.PI / 180;
            // Align celestial pole with geographic north pole, tilted by latitude
            this.stars.rotation.set(0, 0, 0);
            this.stars.rotation.x = -(Math.PI / 2 - latRad);
            this.stars.rotation.y = -lst * Math.PI / 180;
        } else {
            this.stars.visible = false;
        }
    }

    /**
     * Fetch weather from Open-Meteo (free, no key)
     */
    async fetchWeather() {
        try {
            const url = `https://api.open-meteo.com/v1/forecast?latitude=${this.lat}&longitude=${this.lon}&current=cloud_cover,weather_code,is_day`;
            const resp = await fetch(url);
            const data = await resp.json();
            if (data.current) {
                this.weather.cloudCover = data.current.cloud_cover || 0;
                this.weather.weatherCode = data.current.weather_code || 0;
                this.weather.isDay = data.current.is_day === 1;
            }
        } catch (e) {
            // Weather fetch failed, keep defaults
        }
    }

    /**
     * Start polling weather every 10 minutes
     */
    startWeatherPolling() {
        this.fetchWeather(); // initial fetch
        this._pollTimer = setInterval(() => this.fetchWeather(), 10 * 60 * 1000);
    }

    dispose() {
        if (this._pollTimer) clearInterval(this._pollTimer);
    }
}
