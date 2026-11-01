let simpleMaterial;

const playableSceneReady = (async () => {
    const renderTexture = new ShadowTexture(2048, 2048);
    const lighting = await Material.loadShader('./shaders/lighting.glsl');
    const litMaterial = async (Kind, name) => {
        const [vertex, fragment] = await Promise.all([
            Material.loadShader(`./shaders/${name}.vert.glsl`),
            Material.loadShader(`./shaders/${name}.frag.glsl`)
        ]);
        const vertex300 = `#version 300 es\n${vertex.replace(/\battribute\b/g, 'in').replace(/\bvarying\b/g, 'out')}`;
        const fragment300 = `#version 300 es\nprecision highp float;\nout vec4 fragmentColor;\n${lighting}\n${fragment}`
            .replace(/\bvarying\b/g, 'in')
            .replace(/\btexture2D\b/g, 'texture')
            .replace(/\bgl_FragColor\b/g, 'fragmentColor');
        return new Kind(vertex300, fragment300, [renderTexture]);
    };
    const [shadow, skyboxMaterial, terrainMaterial, playerMaterial, stoneMaterial, ps1] = await Promise.all([
        Material.fromFiles('./shaders/shadow.vert.glsl', './shaders/shadow.frag.glsl'),
        Skybox.fromFiles('./shaders/sky.vert.glsl', './shaders/sky.frag.glsl'),
        litMaterial(BiomeMaterial, 'terrain'),
        litMaterial(MaterialWithShadow, 'wanderer'),
        litMaterial(MaterialWithShadow, 'stone'),
        PostProcessMaterial.fromFiles('./shaders/postprocess.vert.glsl', './shaders/ps1.frag.glsl')
    ]);
    simpleMaterial = shadow;
    const wandererMesh = WandererMesh.build();
    const avatarMaterial = playerMaterial.clone();
    avatarMaterial.postprocess = () => avatarMaterial.isMeshDirty = false;
    const avatarShadowMaterial = simpleMaterial.clone();
    avatarShadowMaterial.postprocess = () => avatarShadowMaterial.isMeshDirty = false;
    const avatar = new Actor('avatar', [
        new Transform(),
        new Renderable(wandererMesh, avatarMaterial),
        new Renderable(wandererMesh, avatarShadowMaterial, 'shadowcasters')
    ]);
    const playerTransform = new Transform();
    const player = new Actor('player', [
        playerTransform,
        new CameraController('camera'),
        new ServerMovement('avatar'),
        new RemotePlayers(playerMaterial, wandererMesh, simpleMaterial),
        new ScoreState(),
        new Inventory()
    ]);
    const emeraldTablets = new Actor('emerald_tablets', [new EmeraldTablets()]);
    emeraldTablets.parent = player;
    const journal = new Actor('alchemist_journal', [new AlchemistJournal(AlchemistJournal.LOCAL_OWNER_ID)]);
    journal.parent = player;
    const citrineArsenicum = new Actor('citrine_arsenicum', [new InventoryItem('Citrine Arsenicum', '', {
        descriptionId: 'item.citrine.description', icon: 'crystal'
    })]);
    const argentumVivum = new Actor('argentum_vivum', [new InventoryItem('Argentum Vivum', '', {
        descriptionId: 'item.argentum.description', icon: 'vial'
    })]);
    citrineArsenicum.parent = player;
    argentumVivum.parent = player;
    const cameraRenderer = new Renderer(document.querySelector('#xxx'));
    cameraRenderer.c_fov = 65;
    const camera = new Actor('camera', [
        new Transform({ position: [0, 4, 0] }),
        cameraRenderer,
        new CameraPostProcesses({ effects: [ps1] })
    ]);
    const skybox = new Actor('skybox', [
        new Renderable(Mesh.QUAD, skyboxMaterial)
    ]);
    const sunRenderer = new Renderer(document.querySelector('#xxx'), ['shadowcasters'], {
        orthographic: true, target: playerTransform, cacheStatic: true
    });
    sunRenderer.renderTexture = renderTexture;
    const sun = new Actor('sun', [
        new Transform({ position: [300, 500, 240] }),
        sunRenderer
    ]);
    const terrain = new Actor('terrain', [
        new Transform(),
        new Terrain({ material: terrainMaterial.clone(), stoneMaterial })
    ]);
    const ui = new Actor('UI', [GameInterface.Instance]);

    const wind = new Actor('wind', [
        new Transform(),
        new ParticleSystem('./particles/wind.json')
    ]);
    Scene.Instance.actors = [ui, player, emeraldTablets, journal, citrineArsenicum, argentumVivum, avatar, sun, camera, terrain, skybox, wind];
})();
