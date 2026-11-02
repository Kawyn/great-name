class WandererMaterial extends MaterialWithShadow {
    isAnimated = true;
    emeraldStage = 0;
    charred = false;
    #playerId = null;

    _compileParams(gl) {
        super._compileParams(gl);
        for (const name of ['u_movementDirection', 'u_windDirection', 'u_time', 'u_airborne', 'u_scarfVerticalMotion', 'u_emeraldStage', 'u_charred', 'u_landingCrouch'])
            this._locations[name] = gl.getUniformLocation(this._program, name);
    }

    _setParmas(gl, renderer, renderable) {
        super._setParmas(gl, renderer, renderable);
        const animation = renderable.actor.GetCompnentByType(WandererAnimation);
        gl.uniform3fv(this._locations.u_movementDirection, animation.movementDirection);
        gl.uniform3fv(this._locations.u_windDirection, animation.windDirection);
        gl.uniform1f(this._locations.u_time, animation.time);
        gl.uniform1f(this._locations.u_airborne, animation.airborne);
        gl.uniform1f(this._locations.u_scarfVerticalMotion, animation.scarfVerticalMotion);
        gl.uniform1f(this._locations.u_landingCrouch, animation.landingCrouch);
        if (renderable.actor.identifier === 'avatar') {
            const connection = window.GameConnection;
            if (this.#playerId !== connection?.playerId) {
                this.#playerId = connection?.playerId;
                this.emeraldStage = 0;
                this.charred = false;
            }
            if (connection?.state) {
                this.emeraldStage = connection.state.emeraldStage ?? 0;
                this.charred = connection.state.charred ?? false;
            }
        }
        gl.uniform1f(this._locations.u_emeraldStage, this.emeraldStage);
        gl.uniform1f(this._locations.u_charred, this.charred ? 1 : 0);
    }

    clone() {
        return new WandererMaterial(this.vertexShaderCode, this.fragmentShaderCode, this.textures);
    }
}
