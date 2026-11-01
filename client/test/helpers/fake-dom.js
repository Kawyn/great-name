// Minimal DOM for classic-script UI tests: enough HTML parsing and simple selectors for the UI templates.
const VOID_TAGS = new Set(['input', 'hr', 'br', 'img', 'meta', 'link']);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };

const decode = text => text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (match, code) => {
    if (code[0] === '#')
        return String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1)));
    return ENTITIES[code] ?? match;
});

class FakeEventTarget {
    #listeners = new Map();

    addEventListener(name, callback) {
        if (!this.#listeners.has(name))
            this.#listeners.set(name, []);
        this.#listeners.get(name).push(callback);
    }

    removeEventListener(name, callback) {
        const list = this.#listeners.get(name) ?? [];
        const index = list.indexOf(callback);
        if (index !== -1)
            list.splice(index, 1);
    }

    listenerCount(name) {
        return (this.#listeners.get(name) ?? []).length;
    }

    dispatchEvent(event) {
        event.target ??= this;
        for (const callback of [...(this.#listeners.get(event.type) ?? [])])
            callback(event);
        return true;
    }
}

class FakeText {
    nodeType = 3;
    parentNode = null;
    constructor(text) { this.textContent = text; }
}

class FakeElement extends FakeEventTarget {
    nodeType = 1;
    parentNode = null;
    childNodes = [];
    attributes = new Map();
    onclick = null;
    #value = null;

    constructor(tagName, ownerDocument) {
        super();
        this.tagName = tagName.toUpperCase();
        this.ownerDocument = ownerDocument;
        const element = this;
        this.classList = {
            add: (...names) => element.#setClasses([...new Set([...element.#classes(), ...names])]),
            remove: (...names) => element.#setClasses(element.#classes().filter(name => !names.includes(name))),
            contains: name => element.#classes().includes(name)
        };
        if (this.tagName === 'TEMPLATE')
            this.content = new FakeElement('#fragment', ownerDocument);
    }

    #classes() { return (this.getAttribute('class') ?? '').split(/\s+/).filter(Boolean); }
    #setClasses(names) { this.setAttribute('class', names.join(' ')); }

    get children() { return this.childNodes.filter(node => node.nodeType === 1); }
    get firstElementChild() { return this.children[0] ?? null; }
    get className() { return this.getAttribute('class') ?? ''; }

    get id() { return this.getAttribute('id') ?? ''; }
    set id(value) { this.setAttribute('id', value); }

    get hidden() { return this.hasAttribute('hidden'); }
    set hidden(value) { value ? this.setAttribute('hidden', '') : this.removeAttribute('hidden'); }

    get disabled() { return this.hasAttribute('disabled'); }
    set disabled(value) { value ? this.setAttribute('disabled', '') : this.removeAttribute('disabled'); }

    get value() { return this.#value ?? this.getAttribute('value') ?? ''; }
    set value(value) { this.#value = String(value); }

    get type() { return this.getAttribute('type') ?? ''; }

    get textContent() {
        return this.childNodes.map(node => node.textContent).join('');
    }

    set textContent(value) {
        this.childNodes = [];
        if (value !== '')
            this.appendChild(new FakeText(String(value)));
    }

    set innerHTML(markup) {
        const target = this.content ?? this;
        target.childNodes = [];
        parseInto(target, markup, this.ownerDocument);
    }

    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
    hasAttribute(name) { return this.attributes.has(name); }
    removeAttribute(name) { this.attributes.delete(name); }

    appendChild(node) {
        node.parentNode?.childNodes.splice(node.parentNode.childNodes.indexOf(node), 1);
        node.parentNode = this;
        this.childNodes.push(node);
        return node;
    }

    remove() {
        if (this.parentNode) {
            this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this), 1);
            this.parentNode = null;
        }
    }

    contains(node) {
        for (let current = node; current; current = current.parentNode)
            if (current === this)
                return true;
        return false;
    }

    click() {
        if (this.disabled)
            return;
        const event = { type: 'click', target: this, preventDefault() {} };
        this.onclick?.(event);
        this.dispatchEvent(event);
    }

    focus() { this.ownerDocument.activeElement = this; }

    matches(selector) {
        const parts = selector.match(/^([a-z][\w-]*)?((?:[#.][\w-]+|\[[^\]]+\])*)$/i);
        if (!parts)
            throw new Error(`Unsupported selector in fake DOM: ${selector}`);
        if (parts[1] && parts[1].toUpperCase() !== this.tagName)
            return false;
        for (const token of parts[2].match(/[#.][\w-]+|\[[^\]]+\]/g) ?? []) {
            if (token[0] === '#' && this.id !== token.slice(1))
                return false;
            if (token[0] === '.' && !this.classList.contains(token.slice(1)))
                return false;
            if (token[0] === '[') {
                const [, name, value] = token.match(/^\[([\w-]+)(?:="?([^"]*)"?)?\]$/);
                if (!this.hasAttribute(name) || (value !== undefined && this.getAttribute(name) !== value))
                    return false;
            }
        }
        return true;
    }

    querySelectorAll(selector) {
        const found = [];
        const visit = element => {
            for (const child of element.children) {
                if (child.matches(selector))
                    found.push(child);
                visit(child);
            }
        };
        visit(this);
        return found;
    }

    querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}

function parseInto(root, markup, ownerDocument) {
    const stack = [root];
    const pattern = /<!--[\s\S]*?-->|<\/([a-z][\w-]*)\s*>|<([a-z][\w-]*)((?:\s+[^\s=>\/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>|([^<]+)/gi;
    for (const [match, closing, opening, attributes, text] of markup.matchAll(pattern)) {
        const parent = stack.at(-1);
        if (closing) {
            if (stack.length > 1 && parent.tagName === closing.toUpperCase())
                stack.pop();
            else
                throw new Error(`Unexpected </${closing}> in fake DOM markup.`);
        }
        else if (opening) {
            const element = new FakeElement(opening, ownerDocument);
            for (const [, name, quoted, single, bare] of attributes.matchAll(/([^\s=>\/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))
                element.setAttribute(name, decode(quoted ?? single ?? bare ?? ''));
            parent.appendChild(element);
            if (!VOID_TAGS.has(opening.toLowerCase()) && !match.endsWith('/>'))
                stack.push(element);
        }
        else if (text !== undefined && text.trim())
            parent.appendChild(new FakeText(decode(text)));
    }
    if (stack.length !== 1)
        throw new Error(`Unclosed <${stack.at(-1).tagName.toLowerCase()}> in fake DOM markup.`);
}

function createDocument(bodyMarkup = '<div id="interface"></div>') {
    const document = new (class extends FakeEventTarget {})();
    const cookies = new Map();
    document.title = 'Dziennik alchemika';
    document.pointerLockElement = null;
    document.activeElement = null;
    document.createElement = name => new FakeElement(name, document);
    document.body = new FakeElement('body', document);
    document.body.innerHTML = bodyMarkup;
    document.querySelector = selector => document.body.querySelector(selector);
    document.querySelectorAll = selector => document.body.querySelectorAll(selector);
    document.getElementById = id => document.body.querySelector(`#${id}`);
    Object.defineProperty(document, 'cookie', {
        get: () => [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
        set: value => {
            const [pair] = value.split(';');
            const index = pair.indexOf('=');
            cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1));
        }
    });
    return document;
}

module.exports = { createDocument, FakeElement };