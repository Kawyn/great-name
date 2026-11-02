# Authoritative server

Run `npm start` in `server`. `HOST` defaults to `127.0.0.1`, `PORT` to `3001`.
`DATA_FILE` selects the persistent JSON file; the default is `server/data/world.json`,
independent of the launch directory. A relative override resolves against the launch
directory. `server/data/` is ignored by Git. Keep this directory on durable storage.
Run only **one server process per data file**; transactions are serialized synchronously
on that process's event loop, not coordinated between processes.

The initial terrain seed is 12, preserving the existing deterministic world. Seed and
spawn are committed when creating the file, then retained across restarts. The same
seed drives spawn heights, movement/grounding, worker-generated terrain/biomes, and
stone placement/geometry seeds. Absolute positions and the world seed are never sent
to clients. Tests can use `createSocketServer()` without `dataFile` for in-memory storage.
Malformed JSON, invalid storage schemas, or storage read failures abort startup;
they never silently create an empty replacement world.

## Gatherable resin

`world/resin-sites.js` deterministically selects a sparse subset of generated dead trees.
Amber lumps lie at their roots, with no map or glow marker. Nearby sites are streamed
through `state.drops` with `kind: 'resin'` and opaque stable IDs. Existing `pickup`
validates server position (six-meter range), existence, depletion and inventory capacity.
The item grant and `harvestedResin` ID are committed in the same atomic transaction.
Depletion is shared and persists across restart; older saves default this list to empty.
Resin is not a starter item. Server-only transformations support fresh or hardened resin
becoming binder, feeding the existing permanent-tablet preparation loop.

## Speed draughts

Speed draughts and essences are ordinary persistent, transferable inventory items,
but their effects belong only to the current connection's alchemist. `drink` accepts
only `itemId` and `requestId`; ownership, type and one-time essence eligibility are
server-validated. The item is atomically consumed before applying the effect and
acknowledging. A draught gives +25% for 300 seconds, refreshing rather than stacking;
one essence adds +10 percentage points until disconnect (+35% combined).
Expired draughts stop affecting authoritative movement immediately, without changing
jump physics. No effects or player identity carry across disconnect/restart.

## World day clock

Every `state` includes `dayCycle:{phase,duration}`. The full cycle is exactly **30 minutes**,
defined in `src/world/day-cycle.js`; phase is in `[0,1)` with dawn at 0, noon at 0.25,
dusk at 0.5 and midnight at 0.75. All recipients of one simulation tick receive the same
sample. The server anchors a monotonic running clock to Unix time at startup, so clients'
wall clocks do not matter and restarting does not reset the day. Time advances while the
server is offline as well; no per-tick persistence is required. A fixed dawn epoch in
`day-cycle.js` places the time of this change at early night without resetting on restart.

Clients extrapolate between authoritative samples with a monotonic clock, then resynchronize.
Lighting, shadow direction, sky and fog share this phase. A fixed world-oriented star field
is rendered only at night, with varied sizes, brightness and subtle colors. Players discover their
own constellations rather than seeing predefined geometric navigation symbols. Star positions
are not randomized per client or rotated by the clock. The smallest-star layer is sparse;
one brighter non-twinkling star guides players toward server (0, 0), reaching the zenith
at the origin. Each state includes its unit direction as `originStar`, computed from
`[-player.x, 5000, -player.z]`, independent of terrain height. Other stars twinkle subtly;
occasional short meteors are client-side night-only visual effects.

## Inventory and journals

Each WebSocket's first `register` creates a new UUID alchemist, with their own
journal, one Sal Smaragdinum and one Bitumen. Repeating registration on the same socket does not create another inventory.
Reconnecting creates a different alchemist; there is no player-account restoration.
No demo ingredient drops are created.

Registration retains `{command:"registered",playerId}` and immediately follows it with:

```json
{"command":"inventory","items":[{"id":"UUID","type":"journal","ownerId":"UUID","author":"Alchemist <first eight UUID characters>","entries":[],"isNew":false,"burnable":true},{"id":"UUID","type":"salSmaragdinum","isNew":false,"burnable":false},{"id":"UUID","type":"bitumen","isNew":false,"burnable":false}]}
```

Item types are `journal`, `emeraldTablets`, `citrineArsenicum`, `argentumVivum`,
`ash`, `water` (Aqua), `lye` (Lixivium), `salSmaragdinum` (Sal Smaragdinum),
`bitumen` and `preparedTablet`.
Journal ownership, authors, entries, item identities, and acquisition flags are server
metadata. There is no client-granted inventory, author override, or coordinate input.
Starter items are not new acquisitions and do not trigger acquisition popups.
Snapshots advertise `burnable`, derived from the server item type, not persisted
client metadata. Currently all journals are burnable, including found journals;
Emerald Tablets, both minerals and ash are not.

Commands:

- `{command:"pickup",dropId}` takes an entire loot bundle only within **6 meters
  in three dimensions**, measured from the authoritative player position.
- `{command:"inventorySeen",itemId}` clears that held item's `isNew` flag.
- `{command:"inventoryDrop",itemId,requestId}` removes one held item into a persistent
  single-item loot bundle at the authoritative player position.
- `{command:"craft",itemIds,element,requestId}` combines exactly two distinct held
  item IDs with `element:null`, or one held item ID with `element:"fire"|"water"|"air"|"earth"`.
  The former `inventoryBurn` command is no longer accepted.
- `{command:"journalAppend",itemId,text,requestId}` appends a journal entry.
- `{command:"journalStrike",itemId,entryIndex,start,end,requestId}` strikes a range.
- `{command:"placeInscription",itemId,stoneId,requestId}` permanently mounts one held
  prepared tablet on the specified nearby giant stone.
- `{command:"readInscription",stoneId,requestId}` reads a nearby mounted tablet.
  Returns the item as `operationResult.result`, without an inventory snapshot or transfer.

Successful mutations commit the JSON transaction before sending an `inventory`
snapshot. Journal, drop and craft mutations then send `{command:"operationResult",requestId,ok:true}`.
Craft results additionally include `result:{outcome,consumedIds,producedItems}`.
`producedItems` contains the newly committed items, not client-granted inventory.
Failures send the standard `{command:"error",code,message}`; these operations also
send `{command:"operationResult",requestId,ok:false,message}` when the supplied
`requestId` is a valid nonempty string of at most 128 characters without controls.
Requests must contain exactly the documented fields. Request IDs correlate responses;
they are not an idempotency key for repeated journal appends.

Recipes live only in `src/crafting.js`; no recipe list is sent to clients.
Sal Smaragdinum + a held journal, in either order, consumes both and produces
one `emeraldTablets` (`outcome:"emeraldTablets"`). It copies the journal's
`ownerId`, `author` and `entries` including strike ranges exactly, with a fresh
item ID. Inscribed tablets persist and transfer like other items, cannot be
edited through journal commands and remain unchanged by fire (`burnable:false`).
Legacy tablets without inscription metadata retain their localized fixed text.
Sal Smaragdinum has no production recipe or world source yet.
Each new alchemist starts with one alongside their journal and Bitumen, all `isNew:false`.
Emerald Tablets + Bitumen (either order) consume both to produce one `preparedTablet`
(`outcome:"preparedTablet"`), preserving authorship and entries exactly. Bitumen has
no production recipe. Prepared tablets remain readable, transferable and fireproof.
Journal + fire consumes the journal and produces one ash (`outcome:"ashes"`).
Journal + water preserves its identity/entries (`"dried"`); earth/air leave it
unchanged. Ash + air consumes ash without replacement (`"scattered"`).
Physical water + ash (either order) consumes both and produces lye (`"lye"`).
Ash + elemental water also consumes the ash and produces one lye.
Elemental water is not a physical water item. Aqua currently has no world source
and is not starter loot. All other combinations return `"unchanged"` without
consuming anything. Removal and rewards are one atomic transaction before the
snapshot and result; failures or repeated use of consumed IDs cannot grant rewards.
Produced items have fresh server UUIDs, `isNew:true`, and normal pickup/drop/seen
behavior. Journals belonging to other players can also be used as ingredients.
Recipe outcomes are localized by the client only after the server responds.

An inventory holds at most 32 separate items, without stacking. Pickup transfers
as many items from the start of the bundle as fit in the remaining slots, atomically.
The remainder retains the same bundle ID and ground position; an empty bundle
is removed. A completely full inventory rejects pickup with `INVENTORY_FULL`.
Resource gathering and crafting enforce the same limit. Legacy oversized bundles
remain intact until collected, preserving every item UUID and journal entry.
Existing wire/storage item types are unchanged;
client `item.*` data-container IDs are mapped through catalog `serverType`.

Only the original owner **currently holding** the journal can append/strike.
Other holders receive the full journal and can read it, but cannot modify it.
Entry text is literal, never HTML/SQL/code: nonempty, at most 4000 UTF-16 code units,
without C0/C1 controls other than newline/tab. Each journal holds at most 200 entries.
Strike indices use UTF-16 offsets, zero-based `entryIndex`, and `[start,end)` ranges.
Overlapping/adjacent strikes merge rather than multiplying duplicate ranges.
Clients must render text without HTML interpretation.

All nonmovement commands share a token bucket of 30 initial operations, replenished
at 10 operations/second per socket. Incoming WebSocket messages are capped at 32 KiB;
oversized messages close with code 1009. Movement retains its existing bounded intent
validation and authoritative simulation.

## Alchemist departure

Crafting emerald tablets from the current alchemist's own journal permanently
sets their `emeraldStage` to 1; binding with bitumen no longer changes appearance.
Legacy stage 2 renders identically to stage 1. Burning the own journal sets
`charred:true`, rendering scorched brown fabric and darkened trim. Foreign journals do not
trigger either transformation. Charring takes precedence over a legacy emerald stage.
Brown remains dominant: emerald mixes 42% into cloth/scarf and 25% into trim;
charring mixes 45% towards charcoal for cloth/scarf and 30% for trim, not full black.
These optional player-save fields are committed in the same transaction as crafting
and does not depend on retaining the item. Foreign writings and ordinary pickup do
not change the crafter's appearance. Simulation snapshots expose the stage for
the recipient and nearby players; absent means the original robe color.
Disconnect still ends that alchemist, so the next identity starts at stage 0.

Simulation snapshots also carry `motion` for self and other players:
`{ airborne, verticalVelocity, landingId, landingSpeed }`.
The landing counter advances only on a real air-to-ground impact and retains its
impact speed for clients; repeated snapshots must not retrigger landing effects.
Slopes do not force sliding or limit directional input. Ordinary walking follows
terrain height; jumps retain the existing authoritative gravity and air controls.
The terrain streaming boundary and forced departure walk remain unchanged.

Mounting a prepared tablet originating from the current alchemist's own journal
arms a departure. Other authors' tablets do not. At 18 horizontal meters from
that stone, while grounded, the server records the departure and emits
`journeyStarted { stoneId, direction, speed }`. Speed is the current authoritative
movement speed, used by the client to place the camera ahead of the walking alchemist.
Movement commands cannot redirect it;
other gameplay commands are rejected with `DEPARTURE_ACTIVE`.
The camera setup lasts 4 seconds while the alchemist keeps walking immediately,
without a pause or speed override. The ordinary movement speed and potion expiry
rules remain in effect. The straight walk lasts 11 seconds, continuing past the
stationary camera; the 7-second caption and 2-second fade finish at 20 seconds, when it commits
the ending and emits `journeyEnded { stoneId }`.

The ending removes the held inventory and persists one loot bundle near the
stone, preserving all UUIDs and writing, plus a noncollectible scarf on the
inscription record. Nearby `stoneSites` expose its player-relative `scarf`
position. The departed player disappears from other players' snapshots but
retains a spectator connection for the final shot; the client closes it after
the scene. Starting another journey always creates a fresh alchemist.

Disconnect, shutdown and crash recovery finalize already-recorded departures
at the same stone. Atomic writes prevent duplicate loot or partially committed
scarves. Older save files without departure/scarf fields remain valid.

## Loot durability and coordinates

### Permanent stone inscriptions

There is one mount point on a nearly vertical wall of each suitable giant stone.
The triangle normal must have `abs(y) <= 0.4`; its center is selected around 2.6 meters
above the ground immediately in front of the wall, with a small outward offset.
Old mounted records have their anchors recalculated and persisted at startup without
changing their stone IDs, item identities, text or authors.
The server derives it from the exact shared procedural geometry, not client coordinates.
Reading and placing require a registered player within 6 meters in three dimensions.
Placement consumes a prepared tablet atomically; an occupied stone rejects subsequent
placements without consuming items. Mounted tablets cannot be removed, edited, picked
up or burned. They survive disconnects, crash recovery and restarts.

Schema version 1 now includes `inscriptions:[]`; existing saves lacking the field migrate
without losing inventories or loot. Each mounted record holds a unique `stoneId`, UUID,
absolute anchor position, unit normal and exactly one `preparedTablet` in `items`.
`state.stoneSites` contains nearby opaque stone IDs, relative anchor positions, normals
and occupancy only. It never broadcasts writing or authorship; those are returned only
to a nearby reader. IDs do not expose world cell coordinates. The client renders occupied
sites as green plaques and offers E to read, or E with confirmation to mount a held prepared
tablet. With several prepared tablets, a filtered inventory picker lets the player choose
which writing to mount; tooltips include the author and an excerpt to distinguish tablets
by the same author. Confirmation shows the chosen name/author. Occupied stones display
subtle emerald mineral veins and a faint glow, synchronized from authoritative occupancy.
The existing chunk batch is retained; only the affected stone's UV marking flag changes.

### Dead trees

Terrain chunks include `trees:[{seed,size,position}]`, with chunk-relative positions
and vertically relative heights just like stones. World-space 192-meter cells choose
sparse 3-8 tree clusters, distributed within 38 meters and filtered for steep slopes.
Trunk sizes are 4-9 meters; bases are buried 0.22 meters. Placement and geometry seeds
depend only on the world seed/cell/index, not recipients' chunk lattices or vertical anchors.
Trees are noninteractive scenery, reconstructed by clients from server descriptors;
they require no additional persistent records.

Disconnecting commits **all** held items as one permanent loot bundle at the current
authoritative position, including original journal metadata and entries. There is no
expiry. Normal `server.close()` commits all connected inventories before terminating
sockets, including SIGINT/SIGTERM shutdown. On startup, inventories left held by a
crash are converted to bundles exactly once at their last persisted position.
Positions are saved during registration, inventory/journal mutations, and disconnect,
not every simulation tick. Abrupt crashes can therefore recover at the last saved
position rather than the most recent frame.

`state` adds `drops:[{id,position:[relativeX,relativeY,relativeZ],count}]` for bundles
within 384 meters. It includes `drops:[]` when none are visible.
If more than 1000 bundles are visible, only the nearest 1000 are included.
Drop contents, world coordinates, and journal metadata are not included in world/state packets; journal
contents are delivered only in inventory snapshots. Concurrent pickups are serialized:
exactly one transaction removes a bundle, and the next receives `DROP_NOT_FOUND`.
Picked-up items become `isNew:true` without changing their identities or owners.

Writes use a same-directory uniquely named pending file, file flush, and atomic rename;
only a completed rename installs the next in-memory state. Failed transactions send
no success. If a disconnect/shutdown write fails, prior held records remain on disk
for recovery on restart and the error is logged. Shutdown storage failure also sets
the process exit code to 1. Back up the JSON file; never repair corruption by deleting
it unless deliberately resetting the world.

## Tests

Run `npm test` in `server`. Inventory/socket regressions cover restart/crash recovery,
lost journals, exact-distance and concurrent pickup, ownership, validation, response
ordering, literal malicious-looking text, write failure, payload/rate limits, relative
drop visibility, and seed consistency. Persistence fixtures use isolated subdirectories
under `server/data/` and are removed after tests.
