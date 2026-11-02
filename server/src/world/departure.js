export const DEPARTURE_DISTANCE = 18;
export const DEPARTURE_CAMERA_SECONDS = 4;
export const DEPARTURE_WALK_SECONDS = 7;
export const DEPARTURE_END_SECONDS = 20;

export function beginDeparture(player, site, now) {
    if (!player.anchor || player.airborne || !site || player.departure)
        return null;
    const dx = player.position.x - site.position.x;
    const dz = player.position.z - site.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < DEPARTURE_DISTANCE)
        return null;
    let direction = [dx / distance, 0, dz / distance];
    const input = player.input;
    if (input && now - player.inputReceivedAt <= 500 && Math.hypot(input.forward, input.right) > 0) {
        const yaw = (input.yaw + Math.atan2(input.right, input.forward) * 180 / Math.PI) * Math.PI / 180;
        const travel = [Math.sin(yaw), 0, Math.cos(yaw)];
        if (travel[0] * direction[0] + travel[2] * direction[2] > 0.25)
            direction = travel;
    }
    player.departure = { stoneId: site.stoneId, direction, startedAt: now, ended: false };
    player.jumpRequested = false;
    player.input = null;
    return { stoneId: site.stoneId, direction };
}

export function departureInput(player, now) {
    const elapsed = (now - player.departure.startedAt) / 1000;
    return {
        forward: !player.departure.ended &&
            elapsed < DEPARTURE_CAMERA_SECONDS + DEPARTURE_WALK_SECONDS ? 1 : 0,
        right: 0,
        yaw: Math.atan2(player.departure.direction[0], player.departure.direction[2]) * 180 / Math.PI
    };
}
