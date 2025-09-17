
import { ClientMessage } from './utils/client-message';

import { EditorManager } from './editor-manager';



function main(){
    const message = new ClientMessage();
    const editor = new EditorManager(message);

    editor.create();



}




main();