class InventoryItem extends Component {
    #name;
    #nameId;
    #category;
    #author;
    #authorId;
    #description;
    #descriptionId;
    #icon;
    get name() { return this.#name; }
    get nameId() { return this.#nameId; }
    get category() { return this.#category; }
    get author() { return this.#author; }
    get authorId() { return this.#authorId; }
    get description() { return this.#description; }
    get descriptionId() { return this.#descriptionId; }
    get icon() { return this.#icon; }

    constructor(name, nameId = '', { category = 'items', author = '', authorId = '',
        description = '', descriptionId = '', icon = 'crystal' } = {}) {
        super();
        if (typeof name !== 'string' || !name.trim() || typeof nameId !== 'string')
            throw new Error('InventoryItem requires a name and an optional localization ID.');
        if (!['notes', 'items'].includes(category) || typeof author !== 'string' ||
            typeof authorId !== 'string' || (category === 'notes' && !author.trim()))
            throw new Error('InventoryItem requires a valid category and notes require an author.');
        if (typeof description !== 'string' || typeof descriptionId !== 'string' ||
            !['crystal', 'vial'].includes(icon))
            throw new Error('InventoryItem requires valid description and icon data.');
        this.#name = name;
        this.#nameId = nameId;
        this.#category = category;
        this.#author = author;
        this.#authorId = authorId;
        this.#description = description;
        this.#descriptionId = descriptionId;
        this.#icon = icon;
    }
}
