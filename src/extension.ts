// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { QuickPickOptions } from 'vscode';
import { QuickPickItem } from 'vscode';
import * as path from 'path';

interface Target {
	parentDir: string;
	name: string;
};

interface TargetPickType extends QuickPickItem {
	targetType: string;
};
// import { parse } from './libs/python-parser';
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated

	let channel = vscode.window.createOutputChannel("Blade");

	channel.appendLine('Congratulations, your extension "blade" is now active!');

	let targetPickItems: Array<TargetPickType> = new Array();

	const allTargetType: Array<string> = ["library", "executable", "test", "proto"];
	let allTargets: Map<string, Array<Target>> = new Map();

	// initialize the terminal
	let terminal = vscode.window.createTerminal();
	const folders = vscode.workspace.workspaceFolders;
	if (!folders) {
		vscode.window.showErrorMessage("workspaceFolder is undefined!");
	} else {
		terminal.sendText('cd ' + folders[0].uri.fsPath);
	}
	terminal.sendText("zsh");

	const selecTargetQuickPickOptions: QuickPickOptions = {
		matchOnDescription: true,
		matchOnDetail: true,
		ignoreFocusOut: true
	};

	let currentSelectTarget: TargetPickType;


	function getParentDir(uri: vscode.Uri):string {
		const relativePath = vscode.workspace.asRelativePath(uri);
		let parentDir = path.dirname(relativePath);
		if (parentDir === '.') {
			parentDir = '';
		}
		return parentDir;	
	}

	function getAllTarget() {
		allTargets.clear();
		for (const type of allTargetType) {
			allTargets.set(type, []);
		}
		channel.show();
		vscode.workspace.findFiles("**/BUILD", "**/build64_release/**").then((uris) => {
			for (const uri of uris) {
				vscode.workspace.fs.readFile(uri).then((data) => {
					const content: string = data.toString();
					const rows: string[] = content.split('\n');
					let parentDir = getParentDir(uri);
					let targetType: string = "";
					let targetName: string = "";
					for (const row of rows) {
						if (row.includes("cc_library")) {
							targetType = "library";
						} else if (row.includes("cc_binary")) {
							targetType = "executable";
						} else if (row.includes("cc_test")) {
							targetType = "test";
						} else if (row.includes("proto_library")) {
							targetType = "proto";
						}
						else if (row.includes("name")) { 
							const tmpArr: string[] = row.split("=");
							var tmp: string = tmpArr[tmpArr.length - 1];
							targetName = tmp.split(",")[0].trim();
							let tmpVec = allTargets.get(targetType);
							if (!tmpVec){
								channel.appendLine("unknown target type: " +  targetType +  ", ignore it");
							} else {
								channel.appendLine("find target: "  + parentDir + ":" + targetName);
								tmpVec.push({
									parentDir: parentDir,
									name: targetName 
								});
								targetPickItems.push({
									label: targetName,
									description: parentDir,
									targetType: targetType
								});
							}
						}
					}
				});
			}
		});
	}


	function checkCurrentTarget(): Boolean {
		if (!currentSelectTarget) {
			vscode.window.showErrorMessage("please select target first!");
			return false;
		}
		return true;
	}

	const selectTarget = () => {
		vscode.window.showQuickPick(targetPickItems, selecTargetQuickPickOptions).then(select => {
			if (select) {
				channel.appendLine("select target: " + select.label);
				currentSelectTarget = select;
			} else {
				channel.appendLine("select is undefined");
			}
		});
	};

	const buildTarget = () => {
		if (!checkCurrentTarget()) {
			return;
		}
		let cmdStr: string;
		let targetFullPath: string =  currentSelectTarget.description + ":" + currentSelectTarget.label;
		if (currentSelectTarget.targetType === "test") {
			cmdStr = "blade test -j 12 " + targetFullPath;
		} else {
			 cmdStr = 'blade build --generate-dynamic -j 12 ' + targetFullPath; 
		}
		terminal.sendText(cmdStr);
		terminal.show();
	};

	const runTarget = () => {
		if (!checkCurrentTarget()) {
			return; 
		}
		let tmpp: string;
		if (currentSelectTarget.description === '') {
			tmpp = "/";
		} else {
			tmpp = "/" + currentSelectTarget.description + "/";
		}
		terminal.sendText("build64_release" + tmpp + currentSelectTarget.label);
		terminal.show();
	};

	const cleanAllTarget = () => {
		terminal.sendText("blade clean");
		terminal.show();
	};

	const runAllTest = ()=> {
		let oddSelectTarget = JSON.stringify(currentSelectTarget);
		let	allTestTargets = allTargets.get("test");
		if (!allTestTargets) {
			return;
		}
		currentSelectTarget.targetType = "test";
		for (const target of allTestTargets ) {
			currentSelectTarget.label = target.name;
			currentSelectTarget.description = target.parentDir;
			buildTarget();
		}
		currentSelectTarget = JSON.parse(oddSelectTarget);
	};

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	context.subscriptions.push(
		vscode.commands.registerCommand('blade.configProject', () => {
			vscode.window.showInformationMessage('Run Config Project!');
			getAllTarget();
		}));

	context.subscriptions.push(vscode.commands.registerCommand('blade.selectTarget', () => {
		vscode.window.showInformationMessage('Select Target To Build Or Run');
		selectTarget();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('blade.buildTarget', () => {
		vscode.window.showInformationMessage("Build Target!");
		buildTarget();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('blade.runTarget', () => {
		vscode.window.showInformationMessage("Run Target!");
		runTarget();
	}));

	context.subscriptions.push(vscode.commands.registerCommand("blade.clean", () => {
		vscode.window.showInformationMessage("Clean Project");
		cleanAllTarget();
	}));
	context.subscriptions.push(vscode.commands.registerCommand('blade.runAllTest', () => {
		vscode.window.showInformationMessage("Run All Unit Test!");
		runAllTest();
	}));
}

// This method is called when your extension is deactivated
export function deactivate() { }
