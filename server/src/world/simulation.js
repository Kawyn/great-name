import { getHeight } from './terrain-generator.js';

export const MOVE_SPEED = 13;
export const GRAVITY = 20;
export const JUMP_SPEED = Math.sqrt(2 * GRAVITY * 2);
export const INPUT_TIMEOUT_MS = 500;

export function isMovementCommand(message) {
    return Object.keys(message).length === 4 &&
        ['forward', 'right', 'yaw'].every(key => Number.isFinite(message[key])) &&
        Math.abs(message.forward) <= 1 && Math.abs(message.right) <= 1 &&
        Math.abs(message.yaw) <= 180;
}

export function advancePlayer(player, deltaTime, now) {
    if (!player.anchor)
        return;
    const dt = Math.min(Math.max(deltaTime, 0), 0.1);
    const { forward, right, yaw } = player.input && now - player.inputReceivedAt <= INPUT_TIMEOUT_MS ?
        player.input : { forward: 0, right: 0, yaw: 0 };
    const length = Math.max(1, Math.hypot(forward, right));
    const radians = yaw * Math.PI / 180;
    const distance = MOVE_SPEED * dt / length;
    let x = player.position.x + (Math.sin(radians) * forward + Math.cos(radians) * right) * distance;
    let z = player.position.z + (Math.cos(radians) * forward - Math.sin(radians) * right) * distance;
    // Do not let a client outrun the terrain snapshot while the next one is generated.
    if (Math.max(Math.abs(x - player.anchor.x), Math.abs(z - player.anchor.z)) > 128) {
        x = player.position.x;
        z = player.position.z;
    }
    let velocity = player.verticalVelocity ?? 0;
    let airborne = player.airborne ?? false;
    if (player.jumpRequested && !airborne) {
        velocity = JUMP_SPEED;
        airborne = true;
    }
    player.jumpRequested = false;
    const ground = getHeight(x, z);
    let y = airborne ? player.position.y + velocity * dt - GRAVITY * dt * dt / 2 : ground;
    if (airborne) {
        velocity -= GRAVITY * dt;
        if (y <= ground && velocity <= 0 || y < ground) {
            y = ground;
            velocity = 0;
            airborne = false;
        }
    }
    player.verticalVelocity = velocity;
    player.airborne = airborne;
    player.position = { x, y, z };
}

export function terrainOffset(player) {
    return [
        player.anchor.x - player.position.x,
        player.anchor.y - player.position.y,
        player.anchor.z - player.position.z
    ];
}

export function playerState(player, players) {
    return {
        command: 'state',
        revision: player.revision,
        terrainOffset: terrainOffset(player),
        players: [...players.values()]
            .filter(other => other.id !== player.id && other.anchor &&
                Math.hypot(other.position.x - player.position.x, other.position.z - player.position.z) <= 384)
            .map(other => ({
                id: other.id,
                position: [
                    other.position.x - player.position.x,
                    other.position.y - player.position.y,
                    other.position.z - player.position.z
                ]
            }))
    };
}
