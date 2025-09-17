import Vditor from 'vditor';
// import 'vditor/dist/index.css';
import { vscode } from './utils/api';
import { ClientMessage } from './utils/client-message';




export class EditorManager {
    private editor: Vditor | null = null;
    constructor(private message: ClientMessage) {}

    create = async () => {
        const state = vscode.getState();
        const vditor = new Vditor("app", {});


    }


};



