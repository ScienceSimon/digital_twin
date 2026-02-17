export async function loadAllData() {
    const files = {
        house: 'data/house.yaml',
        iot: 'data/assets_iot.yaml',
        static: 'data/assets_static.yaml',
        metrics: 'data/statestream.yaml'
    };

    const cacheBuster = `?t=${Date.now()}`;
    const entries = Object.entries(files);

    const loaded = await Promise.all(
        entries.map(async ([key, path]) => {
            try {
                const response = await fetch(path + cacheBuster);
                if (!response.ok) throw new Error(`Bestand niet gevonden: ${path}`);
                const yamlText = await response.text();
                const data = jsyaml.load(yamlText) || {};
                return [key, data?.house || data?.assets || data || {}];
            } catch (err) {
                return [key, {}];
            }
        })
    );

    return Object.fromEntries(loaded);
}
