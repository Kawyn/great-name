export const ELEMENTS = new Set(['water', 'fire', 'air', 'earth']);

export function resolveCraft(items, element) {
    if (element === null && items.some(item => item.type === 'resin') && items.some(item => item.type === 'lye'))
        return { outcome: 'speedPotion', consumedIds: items.map(item => item.id), producedItems: [{ type: 'speedPotion' }] };
    if (items.length === 1 && items[0].type === 'speedPotion' && element === 'fire')
        return { outcome: 'speedEssence', consumedIds: [items[0].id], producedItems: [{ type: 'speedEssence' }] };
    if (items.length === 1 && ['resin', 'hardenedResin'].includes(items[0].type) && element === 'fire')
        return { outcome: 'resinBinder', consumedIds: [items[0].id], producedItems: [{ type: 'bitumen' }] };
    if (items.length === 1 && items[0].type === 'resin' && element === 'air')
        return { outcome: 'hardenedResin', consumedIds: [items[0].id], producedItems: [{ type: 'hardenedResin' }] };
    const journal = items.find(item => item.type === 'journal');
    const tablet = items.find(item => item.type === 'emeraldTablets');
    if (element === null && tablet && items.some(item => item.type === 'bitumen')) {
        const { ownerId, author, entries } = tablet;
        return {
            outcome: 'preparedTablet', consumedIds: items.map(item => item.id),
            producedItems: [{
                type: 'preparedTablet',
                ...(entries !== undefined ? { ownerId, author, entries: structuredClone(entries) } : {})
            }]
        };
    }
    if (element === null && journal && items.some(item => item.type === 'salSmaragdinum'))
        return {
            outcome: 'emeraldTablets', consumedIds: items.map(item => item.id),
            producedItems: [{
                type: 'emeraldTablets', ownerId: journal.ownerId, author: journal.author,
                entries: structuredClone(journal.entries)
            }]
        };
    if (element === 'fire' && journal)
        return { outcome: 'ashes', consumedIds: [journal.id], producedItems: [{ type: 'ash' }] };
    if (element === 'water' && journal)
        return { outcome: 'dried', consumedIds: [], producedItems: [] };
    if (element === 'air' && items[0].type === 'ash')
        return { outcome: 'scattered', consumedIds: [items[0].id], producedItems: [] };
    if (element === 'water' && items[0].type === 'ash')
        return { outcome: 'lye', consumedIds: [items[0].id], producedItems: [{ type: 'lye' }] };
    if (element === null && items.some(item => item.type === 'ash') && items.some(item => item.type === 'water'))
        return { outcome: 'lye', consumedIds: items.map(item => item.id), producedItems: [{ type: 'lye' }] };
    return { outcome: 'unchanged', consumedIds: [], producedItems: [] };
}
