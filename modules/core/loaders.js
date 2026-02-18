const cacheBuster = `?t=${Date.now()}`;

async function loadYaml(path) {
    const response = await fetch(path + cacheBuster);
    if (!response.ok) throw new Error(`Bestand niet gevonden: ${path}`);
    const yamlText = await response.text();
    const data = jsyaml.load(yamlText) || {};
    return data?.house || data?.assets || data || {};
}

/**
 * Loads house.yaml first and returns it immediately.
 * Returns { house, rest } where rest is a Promise that resolves with { iot, static, metrics }.
 */
export async function loadAllData() {
    // Load house first — it's needed for the first render
    const house = await loadYaml('data/house.yaml');

    // Start loading the rest in parallel, don't await yet
    const rest = Promise.all([
        loadYaml('data/assets_iot.yaml').catch(() => ({})),
        loadYaml('data/assets_static.yaml').catch(() => ({})),
        loadYaml('data/statestream.yaml').catch(() => ({}))
    ]).then(([iot, staticData, metrics]) => ({ iot, static: staticData, metrics }));

    return { house, rest };
}
