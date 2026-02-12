import * as THREE from 'three';

export async function loadAllData() {
    const files = {
        house: 'data/house.yaml',
        iot: 'data/assets_iot.yaml',
        static: 'data/assets_static.yaml',
        metrics: 'data/statestream.yaml'
    };

    const results = {};

    for (const [key, path] of Object.entries(files)) {
        try {
            // Add cache-busting timestamp to prevent browser caching
            const cacheBuster = `?t=${Date.now()}`;
            const response = await fetch(path + cacheBuster);
            if (!response.ok) throw new Error(`Bestand niet gevonden: ${path}`);
            
            const yamlText = await response.text();
            // Veilig laden: als het bestand leeg is, maken we er een leeg object van
            const data = jsyaml.load(yamlText) || {};

            console.log(`📄 Raw YAML data for ${key}:`, data);
            console.log(`📄 data.house:`, data?.house);
            console.log(`📄 data.assets:`, data?.assets);

            // De 'results' vullen we veilig met optional chaining (?.)
            results[key] = data?.house || data?.assets || data || {};

            console.log(`✅ Geladen: ${key}`, results[key]);
        } catch (err) {
            // Dit zorgt ervoor dat de oranje waarschuwing netjes blijft en de app doorgaat
            console.warn(`Kon ${key} niet laden (optioneel):`, err.message);
            results[key] = {}; 
        }
    }

    return results;
}