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

            results[key] = data?.house || data?.assets || data || {};
        } catch (err) {
            results[key] = {}; 
        }
    }

    return results;
}