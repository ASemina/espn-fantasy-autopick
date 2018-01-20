SLOT_TYPE_POINT_GUARD = "PG";
SLOT_TYPE_SHOOTING_GUARD = "SG";
SLOT_TYPE_SMALL_FORWARD = "SF";
SLOT_TYPE_POWER_FORWARD = "PF";
SLOT_TYPE_CENTER = "C";
SLOT_TYPE_GUARD = "G";
SLOT_TYPE_FORWARD = "F";
SLOT_TYPE_UTIL = "UTIL";

SPECIFIC_SLOT_TYPES = [SLOT_TYPE_POINT_GUARD, SLOT_TYPE_SHOOTING_GUARD, SLOT_TYPE_SMALL_FORWARD, SLOT_TYPE_POWER_FORWARD, SLOT_TYPE_CENTER];
GENERIC_SLOT_TYPES = [SLOT_TYPE_GUARD, SLOT_TYPE_FORWARD, SLOT_TYPE_UTIL];

class ActivePlayerSlot {
    constructor(slotId, slotType) {
        this.slotId = slotId;
        this.slotType = slotType;
    }
}

PLAYER_HEALTH_HEALTHY = "HEALTHY";
PLAYER_HEALTH_DAYTODAY = "DTD";
PLAYER_HEALTH_OUT = "O";
PLAYER_HEALTH_SUSPENDED = "SSPD";

PLAYER_HEALTH_LEVELS = [PLAYER_HEALTH_HEALTHY, PLAYER_HEALTH_DAYTODAY, PLAYER_HEALTH_OUT, PLAYER_HEALTH_SUSPENDED];

class Player {
    constructor(playerId, name, positions, health, opponent) {
        this.playerId = playerId;
        this.name = name;
        this.positions = positions;
        this.health = health;
        this.opponent = opponent;
    }

    get isPlaying() {
        return this.opponent !== null;
    }

    compareHealth(otherPlayer) {
        return PLAYER_HEALTH_LEVELS.indexOf(this.health) >= PLAYER_HEALTH_LEVELS.indexOf(otherPlayer.health);
    }
}

class RosterState {
    constructor(slots, players, mapping) {
        this.slots = slots;
        this.players = players;
        this.mapping = mapping;
    }

    get hasRoomForEveryone() {
        return this.players.filter(p => p.isPlaying).length <= this.slots.length;
    }

    getSlotById(slotId) {
        return this.slots.find(s => s.slotId === slotId) || null;
    }

    getPlayerById(playerId) {
        return this.players.find(p => p.playerId === playerId) || null;
    }

    currentPlayer(slot) {
        return this.mapping.get(slot.slotId);
    }

    currentSlot(player) {
        const slotIds = Array.from(this.mapping.entries())
            .filter(([slotId, p]) => p !== null && player.playerId === p.playerId)
            .map(([slotId, p]) => slotId);
        return this.getSlotById(slotIds[0]);
    }

    assignPlayer(player, slot) {
        this.mapping.set(slot.slotId, player);
    }

    isEquivalentTo(otherRosterState) {
        for (const [key, value] of this.mapping.entries()) {
            if (value !== otherRosterState.mapping.get(key)) {
                return false;
            }
        }
        return true;
    }
}

function positionMatchesSlot(position, slot) {
    const slotType = slot.slotType;
    if (slotType === "UTIL") {
        return true;
    }
    switch (position) {
        case "PG": return slotType === "PG" || slotType === "G";
        case "SG": return slotType === "SG" || slotType === "G";
        case "SF": return slotType === "SF" || slotType === "F";
        case "PF": return slotType === "PF" || slotType === "F";
        case "C": return slotType === "C";
        default: throw new Error("Unknown position type: ", position);
    }
}

function playerMatchesSlot(player, slot) {
    return player.positions.some(position => positionMatchesSlot(position, slot));
}

function getHealthiestPlayers(players) {
    for (const healthLevel of PLAYER_HEALTH_LEVELS) {
        const playersAtLevel = players.filter(p => p.health === healthLevel);
        if (playersAtLevel.length > 0) {
            return playersAtLevel;
        }
    }
    return [];
}

function findBestPlayerForSlot(rosterState, slot, availablePlayers) {
    const possiblePlayers = availablePlayers.filter(p => playerMatchesSlot(p, slot));
    if (possiblePlayers.length === 0) {
        console.debug("No possible player found for slot", slot);
        return null;
    } else if (possiblePlayers.length === 1) {
        const onlyPlayer = possiblePlayers[0];
        console.debug("Single eligible player found for slot", slot, onlyPlayer);
        return onlyPlayer;
    }
    // We can keep an injured player in their current slot if there are enough slots for all players with games.
    // If there aren't enough spots the current player must be moved.
    const healthiestPlayers = getHealthiestPlayers(possiblePlayers);
    const currentPlayer = rosterState.currentPlayer(slot);
    const currentPlayerIsPlaying = currentPlayer !== null && possiblePlayers.map(p => p.playerId).includes(currentPlayer.playerId);
    const currentPlayerIsHealthy = currentPlayer !== null && healthiestPlayers.map(p => p.playerId).includes(currentPlayer.playerId);
    if (currentPlayerIsPlaying && (rosterState.hasRoomForEveryone || currentPlayerIsHealthy)) {
        console.debug("Keeping current player for slot", slot, currentPlayer);
        return currentPlayer;
    }
    // Don't choose a player who's already in a different slot of the same type. The ESPN page doesn't allow you to move a player from a slot
    // to another slot with the same type. In practice this only applies to moving from one UTIL slot to a different one.
    const playersWithCurrentSlots = possiblePlayers.map(p => [p, rosterState.currentSlot(p)]);
    playersWithCurrentSlots.sort(([p1, slot1], [p2, slot2]) => p1.compareHealth(p2));
    while (playersWithCurrentSlots.length > 0) {
        const [player, currentSlot] = playersWithCurrentSlots[0];
        if (currentSlot === null || currentSlot.slotType !== slot.slotType) {
            console.debug("Choosing first available player", slot, player);
            return player;
        }
        playersWithCurrentSlots.splice(0, 1);
    }
    console.debug("All available players are already occupying same slot type", slot);
    return null;
}

function calculateNewRoster(rosterState) {
    const newRosterState = new RosterState(rosterState.slots, rosterState.players, new Map(rosterState.mapping));
    const availablePlayers = rosterState.players.filter(p => p.isPlaying);
    for (const slot of rosterState.slots) {
        let chosenPlayer = findBestPlayerForSlot(rosterState, slot, availablePlayers);
        if (chosenPlayer === null) {
            // No active player can fill the slot. Keep the current inactive player in the slot if possible.
            const currentPlayer = rosterState.currentPlayer(slot);
            if (currentPlayer !== null && availablePlayers.includes(currentPlayer)) {
                chosenPlayer = currentPlayer;
            }
        } else {
            availablePlayers.splice(availablePlayers.indexOf(chosenPlayer), 1);
        }
        newRosterState.assignPlayer(chosenPlayer, slot);
    }
    return newRosterState;
}