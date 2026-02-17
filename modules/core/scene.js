import * as THREE from 'three';
import { OrbitControls } from 'orbitcontrols';
import { CSS2DRenderer, CSS2DObject } from 'css2drenderer';

export function initScene() {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a20);
    
    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(15, 15, 15);
    
    // De standaard 3D renderer
    const renderer = new THREE.WebGLRenderer({ antialias: window.devicePixelRatio < 2 });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);
    
    // De nieuwe renderer voor de tekstballonnetjes (pills)
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0px';
    labelRenderer.domElement.style.pointerEvents = 'none'; 
    document.body.appendChild(labelRenderer.domElement);
    
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Verhoogd ambient light zodat vloeren/muren zichtbaar blijven in donkere scene
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.5);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(1024, 1024);
    scene.add(sunLight);
    
    const sunSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.5, 16, 16), 
        new THREE.MeshBasicMaterial({color: 0xffff00})
    );
    scene.add(sunSphere);
    
    // --- ONDERGROND TOEVOEGEN ---
    // We maken een groot vlak (Plane) dat de blauwe lucht aan de onderkant afdekt
    const floorGeo = new THREE.PlaneGeometry(100, 100);
    const floorMat = new THREE.MeshBasicMaterial({ color: 0x050505, side: THREE.DoubleSide });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2; // Plat leggen
    floor.position.y = -0.02; // Iets onder het nulpunt om 'flikkeren' met muren te voorkomen
    scene.add(floor);

    // Het raster (Grid) bovenop de donkere vloer - uitgeschakeld
    // scene.add(new THREE.GridHelper(40, 40, 0x111111, 0x111111));
    // ----------------------------

    window.addEventListener('resize', () => {
        const width = window.innerWidth;
        const height = window.innerHeight;

        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        
        renderer.setSize(width, height);
        labelRenderer.setSize(width, height);
    });

    return { scene, camera, renderer, labelRenderer, controls, sunLight, sunSphere };
}