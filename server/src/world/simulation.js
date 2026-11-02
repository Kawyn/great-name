import { getHeight } from './terrain-generator.js';
import { departureInput } from './departure.js';

export const MOVE_SPEED = 13;
export const GRAVITY = 20;
export const JUMP_SPEED = Math.sqrt(2 * GRAVITY * 2);
export const INPUT_TIMEOUT_MS = 500;
export const SPEED_POTION_DURATION_MS = 5 * 60 * 1000;

export function speedMultiplier(player, now) {
    return 1 + (player.speedEssence ? 0.1 : 0) + (player.speedPotionUntil > now ? 0.25 : 0);
}

export function isMovementCommand(message) {
    return Object.keys(message).length === 4 &&
        ['forward', 'right', 'yaw'].every(key => Number.isFinite(message[key])) &&
        Math.abs(message.forward) <= 1 && Math.abs(message.right) <= 1 &&
        Math.abs(message.yaw) <= 180;
}

export function advancePlayer(player, deltaTime, now, heightAt = getHeight) {
    if (!player.anchor)
        return;
    const dt = Math.min(Math.max(deltaTime, 0), 0.1);
    const { forward, right, yaw } = player.departure ? departureInput(player, now) :
        player.input && now - player.inputReceivedAt <= INPUT_TIMEOUT_MS ?
            player.input : { forward: 0, right: 0, yaw: 0 };
    const length = Math.max(1, Math.hypot(forward, right));
    const radians = yaw * Math.PI / 180;
    let velocity = player.verticalVelocity ?? 0;
    let airborne = player.airborne ?? false;
    const speed = MOVE_SPEED * speedMultiplier(player, now);
    const inputX = (Math.sin(radians) * forward + Math.cos(radians) * right) / length;
    const inputZ = (Math.cos(radians) * forward - Math.sin(radians) * right) / length;
    let x = player.position.x + inputX * speed * dt;
    let z = player.position.z + inputZ * speed * dt;
    // Do not let a client outrun the terrain snapshot while the next one is generated.
    if (Math.max(Math.abs(x - player.anchor.x), Math.abs(z - player.anchor.z)) > 128) {
        x = player.position.x;
        z = player.position.z;
    }
    if (player.jumpRequested && !airborne) {
        velocity = JUMP_SPEED;
        airborne = true;
    }
    player.jumpRequested = false;
    const ground = heightAt(x, z);
    let y = airborne ? player.position.y + velocity * dt - GRAVITY * dt * dt / 2 : ground;
    if (airborne) {
        velocity -= GRAVITY * dt;
        if (y <= ground && velocity <= 0 || y < ground) {
            player.landingSpeed = Math.max(0, -velocity);
            player.landingId = (player.landingId ?? 0) + 1;
            y = ground;
            velocity = 0;
            airborne = false;
        }
    }
    player.verticalVelocity = velocity;
    player.airborne = airborne;
    player.position = { x, y, z };
}

function motionState(player) {
    return {
        airborne: player.airborne === true,
        verticalVelocity: player.verticalVelocity ?? 0,
        landingId: player.landingId ?? 0, landingSpeed: player.landingSpeed ?? 0
    };
}

export function terrainOffset(player) {
    return [
        player.anchor.x - player.position.x,
        player.anchor.y - player.position.y,
        player.anchor.z - player.position.z
    ];
}

export function playerState(player, players, drops = []) {
    const starDistance = Math.hypot(player.position.x, 5000, player.position.z);
    return {
        command: 'state',
        originStar: [-player.position.x / starDistance, 5000 / starDistance, -player.position.z / starDistance],
        revision: player.revision,
        motion: motionState(player),
        ...(player.emeraldStage ? { emeraldStage: player.emeraldStage } : {}),
        ...(player.charred ? { charred: true } : {}),
        terrainOffset: terrainOffset(player),
        drops: drops
            .filter(drop => Math.hypot(drop.position.x - player.position.x,
                drop.position.y - player.position.y, drop.position.z - player.position.z) <= 384)
            .sort((a, b) => Math.hypot(a.position.x - player.position.x,
                a.position.y - player.position.y, a.position.z - player.position.z) -
                Math.hypot(b.position.x - player.position.x,
                    b.position.y - player.position.y, b.position.z - player.position.z))
            .slice(0, 1000)
            .map(drop => ({
                id: drop.id,
                ...(drop.kind === 'resin' ? { kind: 'resin' } : {}),
                position: [drop.position.x - player.position.x,
                    drop.position.y - player.position.y, drop.position.z - player.position.z],
                count: drop.count ?? drop.items.length
            })),
        players: [...players.values()]
            .filter(other => other.id !== player.id && other.anchor && !other.departure?.ended &&
                Math.hypot(other.position.x - player.position.x, other.position.z - player.position.z) <= 384)
            .map(other => ({
                id: other.id,
                motion: motionState(other),
                ...(other.emeraldStage ? { emeraldStage: other.emeraldStage } : {}),
                ...(other.charred ? { charred: true } : {}),
                position: [
                    other.position.x - player.position.x,
                    other.position.y - player.position.y,
                    other.position.z - player.position.z
                ]
            }))
    };
}
