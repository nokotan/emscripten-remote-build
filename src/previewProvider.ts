import * as vscode from 'vscode';
import * as path from 'path';

export function showPreview(workspaceRoot: string, htmlUrl: vscode.Uri) {
    PreviewPalel.createOrShow(workspaceRoot, htmlUrl);
}

class PreviewPalel {
    public static currentPanel: PreviewPalel | undefined;

	public static readonly viewType = 'emccPreview';

	private readonly _panel: vscode.WebviewPanel;
	private readonly _parentUrl: vscode.Uri;
	private readonly _htmlUrl: vscode.Uri;
	private _disposables: vscode.Disposable[] = [];

    public static createOrShow(workspaceRoot: string, htmlUrl: vscode.Uri) {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		// If we already have a panel, show it.
		if (PreviewPalel.currentPanel) {
			PreviewPalel.currentPanel._panel.reveal(column);
			return;
		}

        const parentFolder = path.dirname(vscode.workspace.asRelativePath(htmlUrl));
        const parentFolderUrl = vscode.Uri.file(parentFolder === "." ? workspaceRoot : workspaceRoot + "/" + parentFolder);

		// Otherwise, create a new panel.
		const panel = vscode.window.createWebviewPanel(
			PreviewPalel.viewType,
			'Emcc Preview',
			column || vscode.ViewColumn.One,
			{
                enableScripts: true,
                localResourceRoots: [
                    parentFolderUrl
                ]
            }
		);

		PreviewPalel.currentPanel = new PreviewPalel(panel, parentFolderUrl, htmlUrl);
	}

    private constructor(panel: vscode.WebviewPanel, parent: vscode.Uri, htmlUrl: vscode.Uri) {
		this._panel = panel;
        this._parentUrl = parent;
		this._htmlUrl = htmlUrl;

		// Set the webview's initial html content
		this._update();

		// Listen for when the panel is disposed
		// This happens when the user closes the panel or when the panel is closed programmatically
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Update the content based on view changes
		this._panel.onDidChangeViewState(
			e => {
				if (this._panel.visible) {
					this._update();
				}
			},
			null,
			this._disposables
		);
	}

    private async _update() {
		const webview = this._panel.webview;
        let content = (await vscode.workspace.fs.readFile(this._htmlUrl)).toLocaleString();

        content = content.replace(/\bsrc\s*=\s*['"](.+?)['"]/g, (all: string, path?: string) => {
            const blobUrl = webview.asWebviewUri(vscode.Uri.joinPath(this._parentUrl, path || ""));
            if (!blobUrl) {
              return all;
            }
            return `src="${blobUrl}"`;
          })
        webview.html = content;
    }

    public dispose() {
		PreviewPalel.currentPanel = undefined;

		// Clean up our resources
		this._panel.dispose();

		while (this._disposables.length) {
			const x = this._disposables.pop();
			if (x) {
				x.dispose();
			}
		}
	}
}