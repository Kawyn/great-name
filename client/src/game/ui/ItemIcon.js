class ItemIcon {
    static name(item) {
        return item.nameId ? Game.Instance.LocalizationManager.get(item.nameId) : item.name;
    }

    static author(item) {
        return item.authorId ? Game.Instance.LocalizationManager.get(item.authorId) : item.author;
    }

    static draw(element, item) {
        const own = item instanceof AlchemistJournal && item.writable;
        element.classList.add('inventory-item', 'inventory-item-icon');
        if (own)
            element.classList.add('inventory-own-journal');
        element.setAttribute('aria-label', [this.name(item), this.author(item)].filter(Boolean).join(' — '));
        const path = `<path d="${item.icon}"/>${
            own ? `<path class="journal-seal" d="${item.resource.ownIcon}"/>` : ''}`;
        element.innerHTML = `<svg viewBox="0 0 48 48" style="color: ${item.resource.iconColor}" aria-hidden="true">${path}</svg>`;
    }

    static tooltip(element, item) {
        const language = Game.Instance.LocalizationManager.language;
        const updateLabel = () => element.setAttribute('aria-label',
            [this.name(item), this.author(item)].filter(Boolean).join(' — '));
        language.addChangeListener(updateLabel, false);
        const detach = Tooltip.attach(element, () => {
            const fields = [{ heading: true, text: this.name(item) }];
            const author = this.author(item);
            if (author)
                fields.push({ text: Game.Instance.LocalizationManager.get('inventory.author', { author }) });
            if (item instanceof EmeraldTablets && item.prepared) {
                const text = item.entries?.[0]?.text;
                if (text)
                    fields.push({ text: text.length > 160 ? `${text.slice(0, 160)}...` : text });
            }
            const description = item.descriptionId ?
                Game.Instance.LocalizationManager.get(item.descriptionId) : item.description;
            if (description)
                fields.push({ text: description });
            return fields;
        });
        return () => {
            language.removeChangeListener(updateLabel);
            detach();
        };
    }
}
