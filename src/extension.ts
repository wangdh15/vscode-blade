// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { QuickPickOptions } from 'vscode';
import { QuickPickItem } from 'vscode';
import * as path from 'path';
import { config } from 'process';
import { markAsUntransferable } from 'worker_threads';

interface Target {
	parentDir: string;
	name: string;
};

interface TargetPickType extends QuickPickItem {
	parentDir: string;
};
// import { parse } from './libs/python-parser';
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

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
		ignoreFocusOut: true,
		placeHolder: "Select the default build target"
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
		targetPickItems = [];
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
							targetName = targetName.substring(1, targetName.length - 1);
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
									description: targetType,
									parentDir:  parentDir
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
				selectedTargetBarHandler.text = "[" + select.label + "]";
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
		let targetFullPath: string =  currentSelectTarget.parentDir + ":" + currentSelectTarget.label;
		if (currentSelectTarget.description === "test") {
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
		if (currentSelectTarget.parentDir === '') {
			tmpp = "/";
		} else {
			tmpp = "/" + currentSelectTarget.parentDir + "/";
		}
		terminal.sendText("build64_release" + tmpp + currentSelectTarget.label);
		terminal.show();
	};

	const cleanAllTarget = () => {
		terminal.sendText("blade clean");
		terminal.show();
	};

	const runAllTest = ()=> {
		let oddSelectTarget = currentSelectTarget;
		currentSelectTarget = {
			label: "",
			parentDir: "",
			description: "test"	
		};
		let	allTestTargets = allTargets.get("test");
		if (!allTestTargets) {
			return;
		}
		currentSelectTarget.description = "test";
		for (const target of allTestTargets ) {
			currentSelectTarget.label = target.name;
			currentSelectTarget.parentDir = target.parentDir;
			buildTarget();
		}
		currentSelectTarget = oddSelectTarget;
	};


	const configProjId = 'blade.configProject';
	const selectTargetId = 'blade.selectTarget';
	const buildTargetId = 'blade.buildTarget';
	const runTargetId = 'blade.runTarget';
	const cleanId = 'blade.clean';
	const runAllTestId = 'blade.runAllTest';
	const dumpCompDB = 'blade.dumpComDB';

	context.subscriptions.push(
		vscode.commands.registerCommand(configProjId, () => {
			channel.clear();
			channel.appendLine('Analysis Project!');
			getAllTarget();
			terminal.sendText("blade dump --compdb --to-file  compile_commands.json");
		}));

	context.subscriptions.push(vscode.commands.registerCommand(selectTargetId, () => {
		channel.appendLine('Select Target To Build Or Run');
		selectTarget();
	}));
	context.subscriptions.push(vscode.commands.registerCommand(buildTargetId, () => {
		channel.appendLine("Build Target!");
		buildTarget();
	}));
	context.subscriptions.push(vscode.commands.registerCommand(runTargetId, () => {
		channel.appendLine("Run Target!");
		runTarget();
	}));

	context.subscriptions.push(vscode.commands.registerCommand(cleanId, () => {
		channel.appendLine("Clean Project");
		cleanAllTarget();
	}));
	context.subscriptions.push(vscode.commands.registerCommand(runAllTestId, () => {
		channel.appendLine("Run All Unit Test!");
		runAllTest();
	}));
	context.subscriptions.push(vscode.commands.registerCommand(dumpCompDB, ()=> {
		channel.appendLine("dump compilation database!");
		terminal.sendText("blade dump --compdb --to-file  compile_commands.json");
	}));

	let addStatusBarItem = (command: string, text: string, icon: string) => {
		let myStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
		myStatusBarItem.command = command;
		if (icon === "") {
			myStatusBarItem.text = text;
		} else {
			myStatusBarItem.text = "$(" + icon + ") "  + text;
		}
		myStatusBarItem.show();
		context.subscriptions.push(myStatusBarItem);
		return myStatusBarItem;
	};

	addStatusBarItem(configProjId, "Analysis", "tools");
	let selectedTargetBarHandler = 	addStatusBarItem(selectTargetId, "[NoSelect]", "");
	addStatusBarItem(buildTargetId, "Build", "gear");
	addStatusBarItem(runTargetId, "", "run");
	addStatusBarItem(runAllTestId, "", "run-all");
}

// This method is called when your extension is deactivated
export function deactivate() { }
