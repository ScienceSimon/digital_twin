
if (!process.env.MQTT_HOST) {
  throw new Error("FOUT: MQTT_HOST ontbreekt in de omgeving!");
}

const config = {
    MQTT_HOST: process.env.MQTT_HOST,
    MQTT_PORT: parseInt(process.env.MQTT_PORT) || 1883,
    MQTT_USER: process.env.MQTT_USER,
    MQTT_PASS: process.env.MQTT_PASS,
};

export default config;