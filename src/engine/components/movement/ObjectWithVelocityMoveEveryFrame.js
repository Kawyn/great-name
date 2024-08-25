class ObjectWithVelocityMoveEveryFrame extends Component {

    #objectWithVelocity;
    #transform;

    onPostInitialize() {

        this.#objectWithVelocity = this.actor.GetCompnentByType(ObjectWithVelocity);
        this.#transform = this.actor.GetCompnentByType(Transform);

        Scene.Instance.TimeManager.addObjectToRefresh(this);
    }

    onRefresh(deltaTime) {

        this.#transform.position.value = this.#transform.position.value.map((v, i) => this.#objectWithVelocity.velocity.value[i] * deltaTime + v);
    }
}