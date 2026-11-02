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
    const [shadow, skyboxMaterial, terrainMaterial, playerMaterial, lootMaterial, stoneMaterial, treeMaterial, tabletMaterial, ps1] = await Promise.all([
        Material.fromFiles('./shaders/shadow.vert.glsl', './shaders/shadow.frag.glsl'),
        Skybox.fromFiles('./shaders/sky.vert.glsl', './shaders/sky.frag.glsl'),
        litMaterial(BiomeMaterial, 'terrain'),
        litMaterial(WandererMaterial, 'wanderer'),
        litMaterial(MaterialWithShadow, 'loot'),
        litMaterial(MaterialWithShadow, 'stone'),
        litMaterial(MaterialWithShadow, 'tree'),
        litMaterial(MaterialWithShadow, 'tablet'),
        PostProcessMaterial.fromFiles('./shaders/postprocess.vert.glsl', './shaders/ps1.frag.glsl')
    ]);
    simpleMaterial = shadow;
    const wandererShadow = await WandererMaterial.fromFiles(
        './shaders/wanderer.vert.glsl', './shaders/shadow.frag.glsl', []);
    const wandererMesh = WandererMesh.build();
    const avatarMaterial = playerMaterial.clone();
    avatarMaterial.postprocess = () => avatarMaterial.isMeshDirty = false;
    const avatarShadowMaterial = wandererShadow.clone();
    avatarShadowMaterial.postprocess = () => avatarShadowMaterial.isMeshDirty = false;
    const avatar = new Actor('avatar', [
        new Transform(),
        new Renderable(wandererMesh, avatarMaterial),
        new Renderable(wandererMesh, avatarShadowMaterial, 'shadowcasters'),
        new WandererAnimation()
    ]);
    const playerTransform = new Transform();
    const player = new Actor('player', [
        playerTransform,
        new CameraController('camera'),
        new ServerMovement('avatar'),
        new PlayerDust('avatar'),
        new RemotePlayers(playerMaterial, wandererMesh, wandererShadow),
        new ScoreState(),
        new Inventory(),
        new ServerInventory(),
        new LootDrops(lootMaterial),
        new StoneInscriptions(tabletMaterial, lootMaterial)
    ]);
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
        new DayNightCycle(),
        sunRenderer
    ]);
    const terrain = new Actor('terrain', [
        new Transform(),
        new Terrain({ material: terrainMaterial.clone(), stoneMaterial, treeMaterial })
    ]);
    const ui = new Actor('UI', [GameInterface.Instance]);

    const wind = new Actor('wind', [
        new Transform(),
        new ParticleSystem('./particles/wind.json', { daylightOnly: true })
    ]);
    const departure = new DepartureCutscene(lootMaterial);
    Scene.Instance.actors = [ui, player, avatar, sun, camera, terrain, skybox, wind, departure];
})();
