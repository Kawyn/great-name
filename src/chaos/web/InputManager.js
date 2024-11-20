class InputManager {

    #count = 0;
    keys = {};
    axes = {};
    constructor(timeManager) {

        this.axes['horizontal'] = new Axis('D', 'A');
        this.axes['vertical'] = new Axis('W', 'S');

        this.axes['mouse_x'] = new Axis();
        this.axes['mouse_y'] = new Axis();
        timeManager.addObjectToRefresh(this, 50);
        document.addEventListener('mousemove', data => {

            if (this.#count !== 0)
                return;

            this.axes['mouse_x'].value = data.movementX * 2;
            this.axes['mouse_y'].value = data.movementY * 2;

        });
        document.addEventListener('keydown', data => {
            if (this.#count !== 0)
                return;

            if (this.keys[data.key.toUpperCase()] == 1)
                return;

            this.keys[data.key.toUpperCase()] = 1;

            for (let key in this.axes) {
                if (this.axes[key].positiveKey == data.key.toUpperCase())
                    this.axes[key].value++;

                if (this.axes[key].negaticeKey == data.key.toUpperCase())
                    this.axes[key].value--;
            }
        });

        document.addEventListener('keyup', data => {

            if (this.#count !== 0)
                return;

            this.keys[data.key.toUpperCase()] = 0;

            for (let key in this.axes) {
                if (this.axes[key].positiveKey == data.key.toUpperCase())
                    this.axes[key].value--;

                if (this.axes[key].negaticeKey == data.key.toUpperCase())
                    this.axes[key].value++;
            }
        });
    }

    blockInput() {

        this.#count++;

        if (this.#count === 1) {

            this.axes['mouse_x'].value = 0;
            this.axes['mouse_y'].value = 0;

            for (let key in this.axes)
                this.axes[key].value = 0;
        }
    }

    unblockInput() {
        if (this.#count > 0)
            this.#count--;

        console.log(this.#count);

    }
    GetAxis(name) {
        return this.axes[name];
    }

    onRefresh() {
        this.axes['mouse_x'].value = 0;
        this.axes['mouse_y'].value = 0;
    }
}

class Axis {

    positiveKey;
    negaticeKey;

    value = 0;
    constructor(positiveKey, negaticeKey) {
        this.positiveKey = positiveKey;
        this.negaticeKey = negaticeKey;
    }
}