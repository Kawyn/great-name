class LSystemTree {
    constructor(axiom, rules, iterations, angle, length, thickness, radialSegments) {
        this.axiom = axiom;
        this.rules = rules;
        this.iterations = iterations;
        this.angle = angle;
        this.length = length;
        this.thickness = thickness;
        this.radialSegments = radialSegments;

        this.vertices = [];
        this.normals = [];
        this.uv = [];

        this.leafVertices = [];
        this.leafNormals = [];
        this.leafUV = [];

        this.previousEndCap = null;
    }

    generate() {
        let currentString = this.axiom;

        for (let i = 0; i < this.iterations; i++) {
            let newString = "";
            for (let char of currentString) {
                newString += this.rules[char] || char;
            }
            currentString = newString;
        }

        this.generateMeshFromLSystem(currentString);
    }

    generateMeshFromLSystem(lSystemString) {
        let stack = [];
        let position = [0, 0, 0];
        let direction = [0, 1, 0];
        let right = [1, 0, 0];
        let up = [0, 0, 1];
        let currentThickness = this.thickness;

        for (let char of lSystemString) {
            switch (char) {
                case 'F':
                    let nextPosition = [
                        position[0] + direction[0] * this.length,
                        position[1] + direction[1] * this.length,
                        position[2] + direction[2] * this.length,
                    ];
                    this.createCylinder(position, nextPosition, currentThickness);
                    position = nextPosition;
                    currentThickness *= 0.9;
                    break;
                case '+':
                    direction = rotateVector(direction, up, this.angle);
                    right = rotateVector(right, up, this.angle);
                    break;
                case '-':
                    direction = rotateVector(direction, up, -this.angle);
                    right = rotateVector(right, up, -this.angle);
                    break;
                case '&':
                    direction = rotateVector(direction, right, this.angle);
                    up = rotateVector(up, right, this.angle);
                    break;
                case '^':
                    direction = rotateVector(direction, right, -this.angle);
                    up = rotateVector(up, right, -this.angle);
                    break;
                case '[':
                    stack.push({ position, direction, right, up, thickness: currentThickness, previousEndCap: this.previousEndCap });
                    break;
                case ']':
                    ({ position, direction, right, up, thickness: currentThickness, previousEndCap: this.previousEndCap } = stack.pop());
                    break;
                case 'L': // Nowy symbol dla liścia
                    this.createLeaf(position, direction);
                    break;
            }
            direction = normalize(add(direction, [0, 0.2, 0]));
        }
    }

    createCylinder(start, end, thickness) {
        const direction = normalize(subtract(end, start));
        const radialAngleStep = (2 * Math.PI) / this.radialSegments;
        const currentEndCap = [];

        for (let i = 0; i < this.radialSegments; i++) {
            const theta1 = i * radialAngleStep;
            const theta2 = (i + 1) * radialAngleStep;

            const x1 = Math.cos(theta1) * thickness;
            const z1 = Math.sin(theta1) * thickness;
            const x2 = Math.cos(theta2) * thickness;
            const z2 = Math.sin(theta2) * thickness;

            const p1 = add(start, [x1, 0, z1]);
            const p2 = add(start, [x2, 0, z2]);
            const p3 = add(end, [x1, 0, z1]);
            const p4 = add(end, [x2, 0, z2]);

            currentEndCap.push(p3, p4);

            const normal1 = normalize([x1, 0, z1]);
            const normal2 = normalize([x2, 0, z2]);

            if (this.previousEndCap) {
                const prevP3 = this.previousEndCap[i * 2];
                const prevP4 = this.previousEndCap[i * 2 + 1];

                this.vertices.push(...prevP3, ...p3, ...prevP4, ...prevP4, ...p3, ...p4);
                this.normals.push(...normal1, ...normal1, ...normal2, ...normal2, ...normal1, ...normal2);
                this.uv.push(
                    i / this.radialSegments, 1,
                    i / this.radialSegments, 0,
                    (i + 1) / this.radialSegments, 1,
                    (i + 1) / this.radialSegments, 1,
                    i / this.radialSegments, 0,
                    (i + 1) / this.radialSegments, 0
                );
            } else {
                this.vertices.push(...p1, ...p3, ...p2, ...p2, ...p3, ...p4);
                this.normals.push(...normal1, ...normal1, ...normal2, ...normal2, ...normal1, ...normal2);
                this.uv.push(
                    i / this.radialSegments, 0,
                    i / this.radialSegments, 1,
                    (i + 1) / this.radialSegments, 0,
                    (i + 1) / this.radialSegments, 0,
                    i / this.radialSegments, 1,
                    (i + 1) / this.radialSegments, 1
                );
            }
        }

        this.previousEndCap = currentEndCap;
    }

    createLeaf(position, direction) {
        const leafWidth = 0.5;
        const leafHeight = 1.0;

        const p1 = add(position, [-leafWidth / 2, 0, 0]);
        const p2 = add(position, [leafWidth / 2, 0, 0]);
        const p3 = add(position, [0, leafHeight, 0]);

        const normal = [0, 0, 1];

        this.leafVertices.push(...p1, ...p2, ...p3);
        this.leafNormals.push(...normal, ...normal, ...normal);
        this.leafUV.push(0, 0, 1, 0, 0.5, 1);
    }

    getMesh() {
        return {
            trunk: {
                vertices: this.vertices,
                normals: this.normals,
                uv: this.uv,
            },
            leaves: {
                vertices: this.leafVertices,
                normals: this.leafNormals,
                uv: this.leafUV,
            }
        };
    }
}

// Vector math helper functions
function subtract(a, b) {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function add(a, b) {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(v, s) {
    return [v[0] * s, v[1] * s, v[2] * s];
}

function normalize(v) {
    const length = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
    return [v[0] / length, v[1] / length, v[2] / length];
}

function cross(a, b) {
    return [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ];
}

function rotateVector(vector, axis, angle) {
    const rad = (Math.PI / 180) * angle;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dot = vector[0] * axis[0] + vector[1] * axis[1] + vector[2] * axis[2];

    return [
        cos * vector[0] + sin * (axis[1] * vector[2] - axis[2] * vector[1]) + (1 - cos) * dot * axis[0],
        cos * vector[1] + sin * (axis[2] * vector[0] - axis[0] * vector[2]) + (1 - cos) * dot * axis[1],
        cos * vector[2] + sin * (axis[0] * vector[1] - axis[1] * vector[0]) + (1 - cos) * dot * axis[2],
    ];
}
