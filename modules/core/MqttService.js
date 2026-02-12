import { updateTemperatureDisplay } from '../../main.js';

// core/MqttService.js
export class MqttService {
    constructor(host, port, user, password) {
        this.host = host;
        this.port = port;
        this.user = user;
        this.password = password;

        // We maken een uniek ID voor deze browser-sessie
        const clientId = "twin_client_" + Math.random().toString(16).substr(2, 4);
        this.client = new Paho.MQTT.Client(host, port, clientId);

        // De 'callback' die we later in main.js invullen
        this.onMessageCallback = null;

        // Bewaar lamp attributes (RGB, brightness) per entityId
        this.lightAttributes = {};
    }

    connect() {
        const options = {
            userName: this.user,
            password: this.password,
            useSSL: false,
            onSuccess: () => {
                console.log("MQTT: Verbonden met Home Assistant");
                // Luister naar alle sensoren uit je YAML
                this.client.subscribe("homeassistant/#");
            },
            onFailure: (err) => {
                console.error("MQTT: Verbinding mislukt", err);
            }
        };

        this.client.onMessageArrived = (msg) => this._handleMessage(msg);
        this.client.connect(options);
    }

    setSensorData(sensorLijst) {
        this.sensors = sensorLijst;
    }

    _getFriendlyName(entityId) {
        if (!this.sensors) return entityId;
        const sensor = this.sensors.find(s => s.id === entityId || s.entity_id === entityId || s.binary_id === entityId);
        return sensor ? sensor.friendly_name : entityId;
    }

    _handleMessage(message) {
    const topic = message.destinationName;
    const value = message.payloadString.replace('°C', '').trim();

    const topicParts = topic.split('/');
    const entityId = topicParts[2];
    const attribute = topicParts[3];

    // Check of dit een light entity is
    const isLight = topic.includes('/light/');

    // Verwerk individuele attribute topics (rgb_color, brightness)
    if (isLight) {
        // Initialize attributes storage for this light if needed
        if (!this.lightAttributes[entityId]) {
            this.lightAttributes[entityId] = {};
        }

        // Luister naar rgb_color topic
        if (attribute === 'rgb_color') {
            try {
                const rgb = JSON.parse(message.payloadString);
                this.lightAttributes[entityId].rgb = rgb;
                console.log(`🎨 RGB update for ${entityId}:`, rgb);

                // Direct update als lamp aan staat
                if (this.lightAttributes[entityId].isOn && this.onMessageCallback) {
                    const brightness = this.lightAttributes[entityId].brightness || 255;
                    this.onMessageCallback(entityId, {
                        isOn: true,
                        brightness,
                        rgb
                    }, 'rgb_color');
                }
            } catch (e) {
                console.warn(`Failed to parse rgb_color for ${entityId}:`, e);
            }
            return;
        }

        // Luister naar brightness topic
        if (attribute === 'brightness') {
            const brightness = parseInt(message.payloadString);
            if (!isNaN(brightness)) {
                this.lightAttributes[entityId].brightness = brightness;
                console.log(`💡 Brightness update for ${entityId}:`, brightness);

                // Direct update als lamp aan staat
                if (this.lightAttributes[entityId].isOn && this.onMessageCallback) {
                    const rgb = this.lightAttributes[entityId].rgb || null;
                    this.onMessageCallback(entityId, {
                        isOn: true,
                        brightness,
                        rgb
                    }, 'brightness');
                }
            }
            return;
        }

        // Verwerk ook attributes topic (voor compatibiliteit)
        if (attribute === 'attributes') {
            try {
                const attributes = JSON.parse(message.payloadString);
                if (attributes.rgb_color) {
                    this.lightAttributes[entityId].rgb = attributes.rgb_color;
                }
                if (attributes.brightness !== undefined) {
                    this.lightAttributes[entityId].brightness = attributes.brightness;
                }
                console.log(`💾 Stored attributes for ${entityId}:`, this.lightAttributes[entityId]);
            } catch (e) {
                console.warn(`Failed to parse attributes for ${entityId}:`, e);
            }
            return;
        }
    }

    if (attribute !== 'state') return;

    if (isLight) {
        let isOn = false;
        let brightness = 255;
        let rgb = null;
        const payload = message.payloadString.trim();

        try {
            // 1. Probeer of het JSON is (voor geavanceerde lampen)
            const lightState = JSON.parse(payload);
            isOn = (lightState.state === 'on' || lightState.state === 'ON');
            brightness = lightState.brightness || 255;
            rgb = lightState.rgb_color || lightState.rgb || null;
        } catch (e) {
            // 2. Als JSON faalt, is het platte tekst 'on' of 'off' (jouw HAOS setup)
            isOn = (payload.toLowerCase() === 'on');
        }

        // Bewaar de ON/OFF status
        this.lightAttributes[entityId].isOn = isOn;

        // 3. Gebruik ALTIJD opgeslagen attributes (deze komen via aparte topics)
        if (this.lightAttributes[entityId]?.rgb) {
            rgb = this.lightAttributes[entityId].rgb;
        }
        if (this.lightAttributes[entityId]?.brightness !== undefined) {
            brightness = this.lightAttributes[entityId].brightness;
        }

        // De mooie gekleurde log in je console met RGB visualisatie
        const rgbDisplay = rgb ? `RGB:[${rgb.join(',')}]` : '';
        const rgbColorCode = rgb ? `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})` : (isOn ? '#ffaa00' : '#333');

        console.log(`%c LIGHT %c ${entityId.padEnd(30)} %c ${isOn ? 'ON' : 'OFF'} ${rgbDisplay}`,
            `background: ${rgbColorCode}; color: white; padding: 2px 5px;`,
            "color: #888;",
            `color: ${isOn ? rgbColorCode : '#666'}; font-weight: bold;`);

        // Voeg toe aan Event Log op scherm
        this._appendToScreenLog('LIGHT', entityId, isOn ? 'ON' : 'OFF');

        // Geef het door aan de 3D scene met RGB data
        if (this.onMessageCallback) {
            this.onMessageCallback(entityId, { isOn, brightness, rgb }, attribute);
        }
        return; // Stop hier voor lampen
    }

    const numValue = parseFloat(value);
    const isNumeric = !isNaN(numValue);

    const motionWords = ['on', 'off', 'occupied', 'clear', 'true', 'false'];
    const isMotion = motionWords.includes(value.toLowerCase());

    if (isNumeric) {
        // 1. Console Log
        console.log(`%c TEMP %c ${entityId.padEnd(30)} %c ${value}`, "background: #1a49f5; color: white; padding: 2px 5px;", "color: #888;", "color: #1a49f5; font-weight: bold;");

        // 2. Scherm Log (Nieuw!)
        this._appendToScreenLog('TEMP', entityId, value);

        // 3. 3D Labels update
        updateTemperatureDisplay(entityId, numValue, 'temperature');
    }
    else if (isMotion) {
        const motionColor = (value === 'on' || value === 'occupied' || value === 'true') ? '#4cd964' : '#2d5a27';

        // 1. Console Log
        console.log(`%c MOTION %c ${entityId.padEnd(30)} %c ${value.toUpperCase()}`, `background: ${motionColor}; color: white; padding: 2px 5px;`, "color: #888;", `color: ${motionColor}; font-weight: bold;`);

        // 2. Scherm Log (Nieuw!)
        this._appendToScreenLog('MOTION', entityId, value.toUpperCase());

        // 3. 3D Labels update
        updateTemperatureDisplay(entityId, value, 'motion');
    }

    if (this.onMessageCallback) {
        this.onMessageCallback(entityId, value, attribute);
    }
}

    _appendToScreenLog(type, entityId, value) {
    const container = document.getElementById('event-entries');
    if (!container) return;

    // Filter out netto_stroomverbruik - too frequent
    if (entityId === 'netto_stroomverbruik') return;

    // Check of log gepauzeerd is
    if (window.eventLog && window.eventLog.isPaused()) return;

    // Check of deze entry gefilterd moet worden
    if (window.eventLog && !window.eventLog.shouldShow(type)) return;

    const friendlyName = this._getFriendlyName(entityId);
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    // Bepaal het type entry voor CSS class
    const isTemp = type === 'TEMP';
    const isLight = type === 'LIGHT';
    const isMotion = type === 'MOTION';
    const isActive = (value === 'ON' || value === 'OCCUPIED' || value === 'TRUE');
    
    // Kies de juiste CSS class
    let entryClass = 'log-entry';
    if (isTemp) {
        entryClass += ' info'; // Blauw voor temperatuur
    } else if (isLight) {
        entryClass += isActive ? ' warning' : ' light-off'; // Oranje voor ON, grijs voor OFF
    } else if (isActive) {
        entryClass += ' success'; // Groen voor ON/OCCUPIED
    } else {
        entryClass += ' error'; // Rood voor OFF/CLEAR
    }
    
    const entry = document.createElement('div');
    entry.className = entryClass;
    
    // Voor bewegingssensoren en lights: toon bolletje, voor temperatuur: geen bolletje
    const statusDot = (!isTemp) ? '<span class="status-indicator"></span>' : '';
    
    entry.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
            <span class="timestamp">${time}</span>
            <span style="color: rgba(255, 255, 255, 0.9); font-weight: 600; flex-grow: 1;">${friendlyName}</span>
            <span class="value">${value}${isTemp ? '°C' : ''}${statusDot}</span>
        </div>
    `;

    // Nieuwste bericht bovenaan
    container.prepend(entry);
    
    // Maximaal 250
    if (container.children.length > 250) {
        container.removeChild(container.lastChild);
    }
}
}
