/* Copyright 2021, Milkdown by Mirone.*/
import type * as vscode from 'vscode';
import { MilkdownEditorProvider } from './provider';
import { VditorEditorProvider } from './provider_vditor';

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    // console.log('Extension "milkdown" is now active!');

    context.subscriptions.push(MilkdownEditorProvider.register(context));
    context.subscriptions.push(VditorEditorProvider.register(context));
}

// this method is called when your extension is deactivated
export function deactivate() {
    // Nothing to do here
}
