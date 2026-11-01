class AlchemistJournal extends InventoryItemWithUse {
    static LOCAL_OWNER_ID = 'local-alchemist';
    #ownerId;
    #entries = [];
    get ownerId() { return this.#ownerId; }
    get entries() { return structuredClone(this.#entries); }
    get storageKey() { return `great-name.journal.${encodeURIComponent(this.#ownerId)}`; }

    constructor(ownerId) {
        super('Dziennik alchemika', 'journal.title', {
            category: 'notes', author: 'Ty', authorId: 'journal.author'
        });
        if (typeof ownerId !== 'string' || !ownerId)
            throw new Error('Journal requires an alchemist owner ID.');
        this.#ownerId = ownerId;
        const stored = localStorage.getItem(this.storageKey);
        if (stored !== null) {
            const data = JSON.parse(stored);
            if (!data || data.version !== 1 || data.ownerId !== ownerId || !Array.isArray(data.entries) ||
                !data.entries.every(entry => entry && typeof entry.text === 'string' && entry.text.trim() &&
                    Array.isArray(entry.strikes) && entry.strikes.every((range, index) => Array.isArray(range) &&
                        range.length === 2 && range.every(Number.isInteger) &&
                        range[0] >= 0 && range[0] < range[1] && range[1] <= entry.text.length &&
                        (index === 0 || entry.strikes[index - 1][1] < range[0]))))
                throw new Error('Invalid saved alchemist journal.');
            this.#entries = data.entries;
        }
    }

    append(text, ownerId) {
        this.#assertOwner(ownerId);
        if (typeof text !== 'string' || !text.trim())
            throw new Error('Journal entries must contain text.');
        this.#commit([...this.entries, { text, strikes: [] }]);
    }

    strike(entryIndex, start, end, ownerId) {
        this.#assertOwner(ownerId);
        const entries = this.entries;
        const entry = entries[entryIndex];
        if (!Number.isInteger(entryIndex) || !entry || !Number.isInteger(start) ||
            !Number.isInteger(end) || start < 0 || start >= end || end > entry.text.length)
            throw new Error('Invalid journal text selection.');
        const ranges = [...entry.strikes, [start, end]].sort((a, b) => a[0] - b[0]);
        entry.strikes = [];
        for (const range of ranges) {
            const previous = entry.strikes.at(-1);
            if (previous && range[0] <= previous[1])
                previous[1] = Math.max(previous[1], range[1]);
            else
                entry.strikes.push(range);
        }
        this.#commit(entries);
    }

    #assertOwner(ownerId) {
        if (ownerId !== this.#ownerId)
            throw new Error('Only the journal owner may write or strike text.');
    }

    #commit(entries) {
        localStorage.setItem(this.storageKey, JSON.stringify({ version: 1, ownerId: this.#ownerId, entries }));
        this.#entries = entries;
    }

    onUse({ windows }) {
        const menu = windows?.windowByType(MainMenuWindow);
        if (!menu)
            throw new Error('Journal requires the game window manager.');
        menu.openInventoryPage(JournalWindow, { journal: this });
    }
}
