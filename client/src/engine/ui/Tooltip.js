class Tooltip {
    static #element = null;
    static #current = null;

    static attach(target, getFields) {
        if (!target || typeof getFields !== 'function')
            throw new Error('Tooltip requires a target and a data provider.');
        const show = () => {
            Tooltip.hide();
            const fields = getFields();
            if (!Array.isArray(fields) || !fields.length || !fields.every(field => typeof field.text === 'string'))
                throw new Error('Tooltip fields require text.');
            const element = Tooltip.#element ??= document.createElement('div');
            element.id = 'universal-tooltip';
            element.setAttribute('role', 'tooltip');
            element.classList.add('parchment', 'universal-tooltip');
            element.textContent = '';
            for (const field of fields) {
                const row = document.createElement(field.heading ? 'strong' : 'p');
                row.textContent = field.text;
                element.appendChild(row);
            }
            document.body.appendChild(element);
            element.hidden = false;
            Tooltip.#current = target;
            target.setAttribute('aria-describedby', element.id);
            const rect = target.getBoundingClientRect();
            element.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - element.offsetWidth - 8))}px`;
            element.style.top = `${Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - element.offsetHeight - 8))}px`;
        };
        const hide = () => {
            if (Tooltip.#current === target)
                Tooltip.hide();
        };
        target.addEventListener('mouseenter', show);
        target.addEventListener('focus', show);
        target.addEventListener('mouseleave', hide);
        target.addEventListener('blur', hide);
        document.addEventListener('scroll', hide, true);
        window.addEventListener('resize', hide);
        return () => {
            hide();
            target.removeEventListener('mouseenter', show);
            target.removeEventListener('focus', show);
            target.removeEventListener('mouseleave', hide);
            target.removeEventListener('blur', hide);
            document.removeEventListener('scroll', hide, true);
            window.removeEventListener('resize', hide);
        };
    }

    static hide() {
        Tooltip.#current?.removeAttribute('aria-describedby');
        Tooltip.#current = null;
        if (Tooltip.#element)
            Tooltip.#element.hidden = true;
    }
}
