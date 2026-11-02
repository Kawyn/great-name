const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { runInNewContext } = require('node:vm');

test('renders shared wanderers with shadows, independent heading, and full disconnect cleanup', () => {
    const listeners = new Map();
    const actors = [];
    let released = 0;
    class Transform {
        constructor(options) {
            this.position = { value: options.position };
            this.scale = options.scale;
            this.rotation = { value: [0, 0, 0] };
        }
    }
    class Renderable {
        constructor(mesh, material) {
            this.mesh = mesh;
            this.material = material;
        }
    }
    class WandererAnimation {}
    class Actor {
        constructor(id, components) {
            this.identifier = id;
            this.components = components;
        }
        GetCompnentByType(type) {
            return this.components.find(component => component instanceof type);
        }
        GetCompnentsByType(type) {
            return this.components.filter(component => component instanceof type);
        }
        destroy() {
            actors.splice(actors.indexOf(this), 1);
        }
    }
    const root = path.join(__dirname, '..', 'src');
    const terrain = new Transform({ position: [-0.25, 0, 0] });
    const RemotePlayers = runInNewContext(
        readFileSync(path.join(root, 'engine', 'components', 'base', 'Component.js'), 'utf8') +
        readFileSync(path.join(root, 'network', 'RemotePlayers.js'), 'utf8') + '\nRemotePlayers;',
        {
            Transform, Renderable, Actor,
            WandererAnimation,
            WandererMesh: { build: () => ({}) },
            Mesh: { CUBE: {} },
            Scene: { Instance: {
                PushActor: actor => actors.push(actor),
                GetActorByIdentifier: () => ({ GetCompnentByType: () => terrain }),
                TimeManager: { addObjectToRefresh() {}, removeObjectToRefresh() {} }
            } },
            window: {
                addEventListener: (name, callback) => listeners.set(name, callback),
                removeEventListener: name => listeners.delete(name),
                GameConnection: { state: null, world: { revision: 1 } }
            }
        }
    );
    const material = { clone: () => ({ clear: () => { released++; } }) };
    const remote = new RemotePlayers(material, {}, material);
    remote.onEnable();
    const update = (players, terrainOffset = [0, 0, 0], revision = 1) =>
        listeners.get('networkstate')({ detail: { players, terrainOffset, revision } });
    update([{ id: 'other', position: [8, 0, 12] }]);
    assert.equal(actors.length, 1);
    assert.equal(actors[0].identifier, 'player_other');
    assert.deepEqual(Array.from(actors[0].GetCompnentByType(Transform).scale), [1, 1, 1]);
    assert.equal(actors[0].GetCompnentsByType(Renderable).length, 2);
    assert.ok(actors[0].GetCompnentByType(WandererAnimation));
    const renderables = actors[0].GetCompnentsByType(Renderable);
    assert.equal(renderables[0].mesh, remote.mesh, 'avatars reuse the static mesh');
    assert.equal(renderables[0].mesh, renderables[1].mesh, 'image and shadow use the same static mesh');
    const actor = actors[0];
    update([{ id: 'other', position: [9, 1, 15], emeraldStage: 1 }]);
    assert.equal(renderables[0].material.emeraldStage, 1);
    const motion = { airborne: false, verticalVelocity: 0, landingId: 1, landingSpeed: 14 };
    update([{ id: 'other', position: [9, 1, 15], emeraldStage: 2, charred: true, motion }]);
    assert.equal(renderables[0].material.emeraldStage, 2);
    assert.ok(renderables.every(renderable => renderable.material.charred === true));
    assert.equal(actors[0].GetCompnentByType(WandererAnimation).motion, motion);
    assert.equal(actors[0], actor);
    assert.deepEqual(Array.from(actor.GetCompnentByType(Transform).position.value), [8.75, 1, 15]);
    const transform = actor.GetCompnentByType(Transform);
    const heading = transform.rotation.value[1];
    assert.ok(Math.abs(heading - Math.atan2(1, 3) * 180 / Math.PI) < 1e-6);
    update([{ id: 'other', position: [8, 1, 15] }], [-1, 0, 0]);
    assert.equal(transform.rotation.value[1], heading, 'recipient movement must not rotate stationary remote players');
    assert.deepEqual(Array.from(transform.position.value), [8.75, 1, 15]);
    terrain.position.value = [-0.5, 0, 0];
    remote.onRefresh();
    assert.deepEqual(Array.from(transform.position.value), [8.5, 1, 15], 'remote players share the rendered terrain offset');
    const position = transform.position.value;
    update([{ id: 'other', position: [8, 1, 15] }], [-1, 0, 0]);
    assert.equal(transform.position.value, position, 'stationary states must not invalidate shadow transforms');
    update([{ id: 'other', position: [8, 1, 15] }], [30, 0, 30], 2);
    assert.equal(transform.rotation.value[1], heading, 'new anchors must not be interpreted as movement');
    update([]);
    assert.equal(actors.length, 0);
    assert.equal(released, 2);
    update([{ id: 'new', position: [1, 0, 3] }]);
    listeners.get('worldcleared')();
    assert.equal(actors.length, 0);
    assert.equal(released, 4);
    remote.onDisable();
    assert.equal(listeners.size, 0);
});
