class InputManager {


    keys = {};
    axes = {};
    constructor() {

        this.axes['horizontal'] = new Axis('d', 'a');
        this.axes['vertical'] = new Axis('w', 's');

        this.axes['mouse_x'] = new Axis();
        this.axes['mouse_y'] = new Axis();
        let timer
        document.addEventListener('mousemove', data => {
            clearTimeout(timer)

            this.axes['mouse_x'].value = data.movementX
            this.axes['mouse_y'].value = data.movementY
            timer = setTimeout(() => {
                this.axes['mouse_x'].value = 0;
                this.axes['mouse_y'].value = 0;
            }
                , 15)
        });
        document.addEventListener('keydown', data => {

            if (this.keys[data.key] == 1)
                return;

            this.keys[data.key] = 1;

            for (let key in this.axes) {
                if (this.axes[key].positiveKey == data.key)
                    this.axes[key].value++;

                if (this.axes[key].negaticeKey == data.key)
                    this.axes[key].value--;
            }
        });

        document.addEventListener('keyup', data => {

            this.keys[data.key] = 0;

            for (let key in this.axes) {
                if (this.axes[key].positiveKey == data.key)
                    this.axes[key].value--;

                if (this.axes[key].negaticeKey == data.key)
                    this.axes[key].value++;
            }
        });
    }

    GetAxis(name) {
        return this.axes[name];
    }

    onRefresh() {

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