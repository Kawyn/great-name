class InventoryItemWithUse extends InventoryItem {
    use(context) {
        if (!(context?.inventory instanceof Inventory) || !context.inventory.items.includes(this))
            throw new Error('Only an item belonging to this inventory can be used.');
        return this.onUse(context);
    }

    onUse(context) {
        throw new Error('Usable inventory items must implement onUse(context).');
    }
}
