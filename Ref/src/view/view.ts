import { ClientMessage } from './utils/client-message';
import { EditorManager } from './editor-manager';
import { ResourceManager } from './utils/resource-manager';

function main() {
    const message = new ClientMessage();
    const editor = new EditorManager(message);

    editor.create();

    window.addEventListener('message', (event) => {
        const message = event.data;
        switch (message.type) {
            case 'update': {
                const text = message.text;
                editor.update(text);
                return;
            }
            case 'resource-response': {
                ResourceManager.Instance.resolve(message.origin, message.result);
                return;
            }
            case 'insertText': {
                const text = message.text;
                editor.insertText(text);
                return;
            }
            case 'client-get-selection': {
                console.log("Get selection text from milkdown 01", message.id);
                editor.getSelection(message.id);
                return;
            }
        }
    });
}

main();
