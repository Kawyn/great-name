class MyInterfaceFunctions {

    static PARENT_SELECTOR = '#interface';

    /**
     * @param {string} markup
     * @returns {HTMLElement}
     */
    static create(markup) {

        const template = document.createElement('template');
        template.innerHTML = markup.trim();

        return template.content.firstElementChild;
    }

    /**
     * @param {HTMLElement} element
     * @param {HTMLElement?} parent defaults to the interface root
     */
    static attach(element, parent = document.querySelector(MyInterfaceFunctions.PARENT_SELECTOR)) {

        if (!parent)
            throw new Error(`Interface root '${MyInterfaceFunctions.PARENT_SELECTOR}' does not exist.`);

        parent.appendChild(element);
    }

    /**
     * @param {HTMLElement?} element
     */
    static detach(element) {

        element?.remove();
    }
}