class JournalDisplayer extends InventoryDisplayer {
    static ACTION = 'journal';
    static KEY_CODE = 'KeyJ';
    static KEY_LABEL = 'J';

    _template() {
        return `
            <button type="button" class="brass-button inventory-shortcut journal-shortcut">
                <svg class="inventory-bag-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
                    <path d="M6 4h20v24H6zM10 4v24M14 10h8M14 15h8M14 20h5"/>
                </svg>
                <span data-localization-id="journal.shortcut">Dziennik</span>
                <kbd class="input-icon"></kbd>
            </button>`;
    }

    open(menu) {
        menu.toggleGameJournal();
    }
}
