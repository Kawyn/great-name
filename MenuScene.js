const MenuScene = new Scene();

MenuScene.actors = [

    new Actor('player', [
        new Transform()
    ]),

    new Actor('camera', [
        new Transform({ position: [0, 1, 0] }),
        new Renderer(document.querySelector('#xxx'))

    ]),

    new Actor('skybox', [
        new Renderable(Mesh.QUAD, skyboxMaterial),
    ])
];