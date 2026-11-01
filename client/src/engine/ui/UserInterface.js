/**
 * Hosts the window and displayer managers as a scene Component.
 * Windows can be built before the scene starts (menus must exist while the scene loads);
 * displayers are built once scene actors are resolvable.
 */
class UserInterface extends Component {

    WindowManager = new WindowManager();
    DisplayerManager = new DisplayerManager();

    /**
     * @param {{ windows?: WindowBase[], displayers?: DisplayerBase[] }} kit 
     */
    constructor({ windows = [], displayers = [] } = {}) {

        super();

        for (const window of windows)
            this.WindowManager.push(window);

        for (const displayer of displayers)
            this.DisplayerManager.push(displayer);
    }

    initializeWindows() {

        this.WindowManager.initialize(this);
    }

    onPostInitialize() {

        this.initializeWindows();
        this.DisplayerManager.initialize(this);
    }

    onEnable() {

        this.DisplayerManager.enable();
    }

    onDisable() {

        this.DisplayerManager.disable();
    }

    onDestroy() {

        this.DisplayerManager.clear();
        this.WindowManager.clear();
    }
}