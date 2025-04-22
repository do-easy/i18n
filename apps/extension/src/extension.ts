// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { DeepLConfig, DEFAULT_CONFIG_FILE_NAME, settingsWithDeepLSchema } from '@do-easy-i18n/config';
import { translateText } from '@do-easy-i18n/translation-utils';

interface DeepLTranslation {
	detected_source_language: string;
	text: string;
}

interface DeepLResponse {
	translations: DeepLTranslation[];
}

interface Config {
	defaultLanguage: string;
	deepL: DeepLConfig;
}

let configPath: string | null = null;
let decorationType: vscode.TextEditorDecorationType;
let debounceTimer: NodeJS.Timeout | null = null;
let statusBarItem: vscode.StatusBarItem;
let currentLanguage: string = 'en';
let availableLanguages: string[] = [];
let config: Config | null = null;
let configWatcher: vscode.FileSystemWatcher | null = null;

interface TranslationStatus {
	hasCurrentTranslation: boolean;
	missingLanguages: string[];
}

interface TranslationInfo {
	[language: string]: string | null;
}

// Add a translation in progress tracker
let translationsInProgress = new Set<string>();

// Add this after the interfaces
class TranslationActionProvider implements vscode.CodeActionProvider {
	public static readonly providedCodeActionKinds = [
		vscode.CodeActionKind.RefactorExtract
	];

	public provideCodeActions(
		document: vscode.TextDocument,
		range: vscode.Range | vscode.Selection
	): vscode.CodeAction[] {
		if (range.isEmpty || !configPath || !config) {
			return [];
		}

		const selectedText = document.getText(range).trim();
		if (!selectedText) {
			return [];
		}

		const action = new vscode.CodeAction(
			'Extract to translation key',
			vscode.CodeActionKind.RefactorExtract
		);
		
		action.command = {
			command: 'do-easy-i18n.extractTranslation',
			title: 'Extract to translation key',
			arguments: [document, range, selectedText]
		};

		return [action];
	}
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
	console.log('do-easy-i18n extension is now active!');

	// Create decoration type for translations
	decorationType = vscode.window.createTextEditorDecorationType({
		after: {
			margin: '0 0 0 0.5em',
			color: new vscode.ThemeColor('editorCodeLens.foreground'),
		}
	});

	// Create status bar item
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.command = 'do-easy-i18n.selectLanguage';
	context.subscriptions.push(statusBarItem);

	// Register commands
	context.subscriptions.push(
		vscode.commands.registerCommand('do-easy-i18n.selectLanguage', handleLanguageSelection),
		vscode.commands.registerCommand('do-easy-i18n.editTranslation', handleTranslationEdit),
		vscode.commands.registerCommand('do-easy-i18n.addMissingTranslation', handleAddMissingTranslation),
		vscode.commands.registerCommand('do-easy-i18n.deleteTranslation', handleDeleteTranslation),
		vscode.languages.registerCodeActionsProvider(
			['javascript', 'typescript', 'javascriptreact', 'typescriptreact'],
			new TranslationActionProvider(),
			{
				providedCodeActionKinds: TranslationActionProvider.providedCodeActionKinds
			}
		),
		vscode.commands.registerCommand(
			'do-easy-i18n.extractTranslation',
			handleExtractTranslation
		)
	);

	// Find config file when extension activates
	await findConfigFile();

	// Create file watcher for config file
	if (configPath) {
		configWatcher = vscode.workspace.createFileSystemWatcher(configPath);
		
		// Watch for config file changes
		configWatcher.onDidChange(() => {
			console.log('Config file changed, reloading settings...');
			loadConfig();
			const editor = vscode.window.activeTextEditor;
			if (editor) {
				updateDecorations(editor);
			}
		});

		// Watch for config file deletion
		configWatcher.onDidDelete(() => {
			console.log('Config file deleted');
			config = null;
			configPath = null;
			vscode.window.showWarningMessage('do-easy-i18n configuration file not found.');
		});

		context.subscriptions.push(configWatcher);
	}

	// Register event listener for file opens
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor(editor => {
			if (editor) {
				updateDecorations(editor);
			}
		}),
		// Add listener for document changes
		vscode.workspace.onDidChangeTextDocument(event => {
			const editor = vscode.window.activeTextEditor;
			if (editor && event.document === editor.document) {
				// Debounce the updates to avoid performance issues
				if (debounceTimer) {
					clearTimeout(debounceTimer);
				}
				debounceTimer = setTimeout(() => {
					updateDecorations(editor);
				}, 300); // Wait 300ms after last change before updating
			}
		})
	);

	// Update decorations in the active editor
	if (vscode.window.activeTextEditor) {
		updateDecorations(vscode.window.activeTextEditor);
	}
}

async function handleLanguageSelection() {
	const language = await vscode.window.showQuickPick(availableLanguages, {
		placeHolder: 'Select language for translations'
	});
	if (language) {
		currentLanguage = language;
		updateStatusBarItem();
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			updateDecorations(editor);
		}
	}
}

async function handleTranslationEdit(key: string, language: string) {
	if (!configPath) {return;}

	const messagesDir = getMessagesDir();
	const langPath = path.join(messagesDir, `${language}.json`);

	if (!fs.existsSync(langPath)) {
		// Create new language file if it doesn't exist
		fs.writeFileSync(langPath, '{}', 'utf8');
	}

	const messages = JSON.parse(fs.readFileSync(langPath, 'utf8'));
	const currentTranslation = messages[key] || '';

	const newTranslation = await vscode.window.showInputBox({
		prompt: `Edit translation for '${key}' in ${language}`,
		value: currentTranslation
	});

	if (newTranslation !== undefined) {
		messages[key] = newTranslation;
		fs.writeFileSync(langPath, JSON.stringify(messages, null, 2));
		
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			updateDecorations(editor);
		}
	}
}

async function handleDeleteTranslation(key: string, language: string) {
	if (!configPath) {return;}

	const messagesDir = getMessagesDir();
	const langPath = path.join(messagesDir, `${language}.json`);

	if (!fs.existsSync(langPath)) {
		vscode.window.showErrorMessage(`Translation file not found for language: ${language}`);
		return;
	}

	const messages = JSON.parse(fs.readFileSync(langPath, 'utf8'));
	
	const confirm = await vscode.window.showWarningMessage(
		`Are you sure you want to delete the translation for '${key}' in ${language}?`,
		'Yes', 'No'
	);

	if (confirm === 'Yes') {
		delete messages[key];
		fs.writeFileSync(langPath, JSON.stringify(messages, null, 2));
		
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			updateDecorations(editor);
		}
		vscode.window.showInformationMessage(`Translation for '${key}' in ${language} has been deleted.`);
	}
}

async function translateWithDeepL(text: string, targetLang: string, sourceLang?: string): Promise<string> {
	const { success } = settingsWithDeepLSchema.safeParse(config); 

	if (!success) {
		throw new Error(`Error parsing config file`);
	}

	if (!config) {
		throw new Error(`Configuration not found. Please check your ${DEFAULT_CONFIG_FILE_NAME} file.`);
	}

	if (!config.deepL) {
		throw new Error(`DeepL configuration not found. Please add "deepL" section to your ${DEFAULT_CONFIG_FILE_NAME}`);
	}

	if (!config.deepL.apiKey) {
		throw new Error(`DeepL API key not configured. Please add "deepL.apiKey" to your ${DEFAULT_CONFIG_FILE_NAME}`);
	}

	// Use the shared utility
	try {
		return await translateText(text, targetLang, config.deepL, sourceLang);
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Translation failed: ${error.message}`);
		} else {
			throw new Error('Translation failed with unknown error');
		}
	}
}

async function handleAddMissingTranslation(key: string, language: string) {
	// Create a unique identifier for this translation request
	const translationId = `${key}:${language}`;
	
	// Check if translation is already in progress
	if (translationsInProgress.has(translationId)) {
		vscode.window.showInformationMessage('Translation already in progress, please wait...');
		return;
	}

	if (!configPath || !config) {
		vscode.window.showErrorMessage('Configuration file not found or invalid.');
		return;
	}

	const messagesDir = getMessagesDir();
	let sourceText: string | null = null;
	let sourceLang: string | undefined = undefined;

	// Try default language first
	const defaultLangPath = path.join(messagesDir, `${config.defaultLanguage}.json`);
	if (fs.existsSync(defaultLangPath)) {
		const messages = JSON.parse(fs.readFileSync(defaultLangPath, 'utf8'));
		if (messages[key]) {
			sourceText = messages[key];
			sourceLang = config.defaultLanguage;
		}
	}

	// If not found in default language, try any other language
	if (!sourceText) {
		for (const lang of availableLanguages) {
			if (lang === language) {continue;} // Skip target language
			const langPath = path.join(messagesDir, `${lang}.json`);
			if (fs.existsSync(langPath)) {
				const messages = JSON.parse(fs.readFileSync(langPath, 'utf8'));
				if (messages[key]) {
					sourceText = messages[key];
					sourceLang = lang;
					break;
				}
			}
		}
	}

	if (!sourceText) {
		vscode.window.showErrorMessage('No source translation found to translate from.');
		return;
	}

	// Add to in-progress set and show loading message
	translationsInProgress.add(translationId);
	const loadingMessage = await vscode.window.withProgress({
		location: vscode.ProgressLocation.Notification,
		title: `Translating "${key}" to ${language}...`,
		cancellable: false
	}, async () => {
		try {
			const translation = await translateWithDeepL(sourceText!, language, sourceLang);
			
			// Save the translation
			const targetLangPath = path.join(messagesDir, `${language}.json`);
			const targetMessages = fs.existsSync(targetLangPath) 
				? JSON.parse(fs.readFileSync(targetLangPath, 'utf8'))
				: {};

			targetMessages[key] = translation;
			fs.writeFileSync(targetLangPath, JSON.stringify(targetMessages, null, 2));

			// If this is a new language file, add it to available languages
			if (!availableLanguages.includes(language)) {
				availableLanguages.push(language);
			}

			const editor = vscode.window.activeTextEditor;
			if (editor) {
				updateDecorations(editor);
			}

			return `Translation added for '${key}' in ${language}`;
		} catch (error) {
			if (error instanceof Error) {
				vscode.window.showErrorMessage(`Translation failed: ${error.message}`);
				throw new Error(`Translation failed: ${error.message}`);
			} else {
				vscode.window.showErrorMessage('Translation failed with unknown error');
				throw new Error('Translation failed with unknown error');
			}
		} finally {
			// Always remove from in-progress set
			translationsInProgress.delete(translationId);
		}
	});

	// Show success message
	vscode.window.showInformationMessage(loadingMessage);
}

function getMessagesDir(): string {
	if (!configPath) {
		throw new Error('Config path not found');
	}
	return path.join(path.dirname(configPath), 'messages');
}

async function findConfigFile() {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders) {
		vscode.window.showErrorMessage('No workspace folder is open');
		return;
	}

	try {
		// Define common directories to exclude
		const excludePatterns = [
			'**/node_modules/**',
			'**/dist/**',
			'**/build/**',
			'**/.git/**',
			'**/coverage/**'
		];

		// Create glob pattern to find config files
		const configFilePattern = `**/${DEFAULT_CONFIG_FILE_NAME}`;
		
		// Find all matching files in the workspace
		const files = await vscode.workspace.findFiles(
			configFilePattern,
			`{${excludePatterns.join(',')}}`
		);

		if (files.length === 0) {
			vscode.window.showWarningMessage(`No ${DEFAULT_CONFIG_FILE_NAME} found in the workspace`);
			return;
		}

		if (files.length > 1) {
			// If multiple config files found, let the user choose
			const fileItems = files.map(file => ({
				label: vscode.workspace.asRelativePath(file),
				file
			}));
			
			const selected = await vscode.window.showQuickPick(fileItems, {
				placeHolder: 'Multiple config files found. Select one to use:'
			});
			
			if (!selected) {
				return;
			}
			
			configPath = selected.file.fsPath;
		} else {
			// Only one config file found
			configPath = files[0].fsPath;
		}
		
		console.log('Found config file at:', configPath);
		loadConfig();
	} catch (error) {
		if (error instanceof Error) {
			vscode.window.showErrorMessage(`Error finding config file: ${error.message}`);
		}
	}
}

function loadConfig() {
	if (!configPath) {
		return;
	}

	try {
		const configContent = fs.readFileSync(configPath, 'utf8');
		config = JSON.parse(configContent) as Config;
		
		// Validate required fields
		if (!config.defaultLanguage) {
			throw new Error('Missing required field in config: defaultLanguage is required');
		}

		const messagesDir = getMessagesDir();
		
		if (fs.existsSync(messagesDir)) {
			availableLanguages = fs.readdirSync(messagesDir)
				.filter(file => file.endsWith('.json'))
				.map(file => path.basename(file, '.json'));
			
			currentLanguage = config.defaultLanguage || availableLanguages[0] || 'en';
			updateStatusBarItem();
		} else {
			// Create messages directory if it doesn't exist
			fs.mkdirSync(messagesDir, { recursive: true });
			availableLanguages = [];
			currentLanguage = config.defaultLanguage;
			updateStatusBarItem();
		}
	} catch (error) {
		if (error instanceof Error) {
			vscode.window.showErrorMessage(`Error reading config file: ${error.message}`);
		}
		config = null;
	}
}

function updateStatusBarItem() {
	statusBarItem.text = `$(globe) ${currentLanguage.toUpperCase()}`;
	statusBarItem.tooltip = 'Change translation language to show in line decorations';
	statusBarItem.show();
}

function getAllTranslations(key: string, messagesDir: string): TranslationInfo {
	const translations: TranslationInfo = {};

	for (const lang of availableLanguages) {
		const langPath = path.join(messagesDir, `${lang}.json`);
		if (fs.existsSync(langPath)) {
			const messages = JSON.parse(fs.readFileSync(langPath, 'utf8'));
			translations[lang] = messages[key] || null;
		} else {
			translations[lang] = null;
		}
	}

	return translations;
}

function createHoverMessage(key: string, translations: TranslationInfo): vscode.MarkdownString {
	const markdown = new vscode.MarkdownString('', true);
	markdown.isTrusted = true;
	markdown.supportHtml = true;

	for (const lang of availableLanguages) {
		const translation = translations[lang];
		if (translation !== null) {
			markdown.appendMarkdown(
				`*${lang}*: ${translation} ` +
				`[$(edit)](command:do-easy-i18n.editTranslation?${encodeURIComponent(JSON.stringify([key, lang]))}) ` +
				`[$(trash)](command:do-easy-i18n.deleteTranslation?${encodeURIComponent(JSON.stringify([key, lang]))})\n\n`
			);
		} else {
			markdown.appendMarkdown(
				`*${lang}*: <missing translation> ` +
				`[$(edit)](command:do-easy-i18n.editTranslation?${encodeURIComponent(JSON.stringify([key, lang]))}) ` +
				`[$(sparkle)](command:do-easy-i18n.addMissingTranslation?${encodeURIComponent(JSON.stringify([key, lang]))})\n\n`
			);
		}
	}

	return markdown;
}

function checkTranslationStatus(key: string, messagesDir: string): TranslationStatus {
	const status: TranslationStatus = {
		hasCurrentTranslation: false,
		missingLanguages: []
	};

	// Check current language first
	const currentLangPath = path.join(messagesDir, `${currentLanguage}.json`);
	if (fs.existsSync(currentLangPath)) {
		const currentMessages = JSON.parse(fs.readFileSync(currentLangPath, 'utf8'));
		status.hasCurrentTranslation = key in currentMessages;
	}

	// Check all other languages
	for (const lang of availableLanguages) {
		if (lang === currentLanguage) {continue;}

		const langPath = path.join(messagesDir, `${lang}.json`);
		if (fs.existsSync(langPath)) {
			const messages = JSON.parse(fs.readFileSync(langPath, 'utf8'));
			if (!(key in messages)) {
				status.missingLanguages.push(lang);
			}
		}
	}

	return status;
}

async function updateDecorations(editor: vscode.TextEditor) {
	if (!configPath) {
		return;
	}

	const document = editor.document;
	const text = document.getText();

	// Find imports matching the pattern 'import * as m from'
	const importRegex = /import\s*\*\s*as\s*(\w+)\s*from/g;
	let match;
	const moduleAliases: string[] = [];

	while ((match = importRegex.exec(text)) !== null) {
		moduleAliases.push(match[1]);
	}

	if (moduleAliases.length === 0) {
		return;
	}

	const messagesDir = getMessagesDir();
	const messagesPath = path.join(messagesDir, `${currentLanguage}.json`);

	if (!fs.existsSync(messagesPath)) {
		vscode.window.showWarningMessage(`Translation file not found for language: ${currentLanguage}`);
		return;
	}

	const messages = JSON.parse(fs.readFileSync(messagesPath, 'utf8'));
	const decorations: vscode.DecorationOptions[] = [];

	// Find all module method calls and add decorations
	for (const alias of moduleAliases) {
		const methodCallRegex = new RegExp(`${alias}\\.(\\w+)\\((?:\\s*\\{[^}]*\\}\\s*)?\\)`, 'g');
		let methodMatch;

		while ((methodMatch = methodCallRegex.exec(text)) !== null) {
			const key = methodMatch[1];
			const translation = messages[key];
			const status = checkTranslationStatus(key, messagesDir);
			const allTranslations = getAllTranslations(key, messagesDir);
			const hoverMessage = createHoverMessage(key, allTranslations);

			const startPos = document.positionAt(methodMatch.index);
			const endPos = document.positionAt(methodMatch.index + methodMatch[0].length);
			const range = new vscode.Range(startPos, endPos);

			if (!status.hasCurrentTranslation) {
				// No translation in current language - show red X with missing languages
				decorations.push({
					range,
					renderOptions: {
						after: {
							contentText: `❌ missing translation on language: ${[currentLanguage, ...status.missingLanguages].join(', ')}`,
							color: new vscode.ThemeColor('errorForeground')
						}
					},
					hoverMessage
				});
			} else if (status.missingLanguages.length > 0) {
				// Has translation in current language but missing in others - yellow
				decorations.push({
					range,
					renderOptions: {
						after: {
							contentText: `→ ${translation}`,
							color: new vscode.ThemeColor('editorWarning.foreground')
						}
					},
					hoverMessage
				});
			} else {
				// Has translation in all languages - green
				decorations.push({
					range,
					renderOptions: {
						after: {
							contentText: `→ ${translation}`,
							color: new vscode.ThemeColor('testing.runAction')
						}
					},
					hoverMessage
				});
			}
		}
	}

	editor.setDecorations(decorationType, decorations);
}

// Add this after the existing interfaces and before activate
async function handleExtractTranslation(
	document: vscode.TextDocument,
	range: vscode.Range,
	selectedText: string
) {
	if (!configPath || !config) {
		vscode.window.showErrorMessage('Configuration file not found or invalid.');
		return;
	}

	// Clean up selected text - remove surrounding quotes if they exist
	let cleanText = selectedText.trim();
	if ((cleanText.startsWith('"') && cleanText.endsWith('"')) || 
		(cleanText.startsWith("'") && cleanText.endsWith("'"))) {
		cleanText = cleanText.slice(1, -1);
	}

	// Get the import statement and module alias
	const text = document.getText();
	const importRegex = /import\s*\*\s*as\s*(\w+)\s*from\s*['"]([^'"]+)['"]/g;
	let moduleAlias = '';
	let importPath = '';
	let match;

	while ((match = importRegex.exec(text)) !== null) {
		moduleAlias = match[1];
		importPath = match[2];
	}

	// If no import found, add one at the top of the file
	if (!moduleAlias) {
		moduleAlias = 'm';
		importPath = './messages';
		const importStatement = `import * as ${moduleAlias} from '${importPath}';\n`;
		const edit = new vscode.WorkspaceEdit();
		edit.insert(document.uri, new vscode.Position(0, 0), importStatement);
		await vscode.workspace.applyEdit(edit);
	}

	// Ask for the translation key
	const key = await vscode.window.showInputBox({
		prompt: 'Enter a translation key',
		placeHolder: 'e.g., welcomeMessage, errorText, etc.',
		validateInput: (value) => {
			if (!value) {
				return 'Translation key cannot be empty';
			}
			if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(value)) {
				return 'Translation key must start with a letter and contain only letters, numbers, and underscores';
			}
			return null;
		}
	});

	if (!key) {
		return;
	}

	// Ask for paste format
	const pasteFormat = await vscode.window.showQuickPick([
		`${moduleAlias}.${key}()`,
		`{${moduleAlias}.${key}()}`
	], {
		placeHolder: 'Select the paste format'
	});

	if (!pasteFormat) {
		return;
	}

	// Save the translation
	const messagesDir = getMessagesDir();
	const langPath = path.join(messagesDir, `${currentLanguage}.json`);
	
	try {
		// Create messages directory if it doesn't exist
		if (!fs.existsSync(messagesDir)) {
			fs.mkdirSync(messagesDir, { recursive: true });
		}

		// Create or update language file
		const messages = fs.existsSync(langPath)
			? JSON.parse(fs.readFileSync(langPath, 'utf8'))
			: {};

		if (messages[key]) {
			const overwrite = await vscode.window.showWarningMessage(
				`Translation key '${key}' already exists. Do you want to overwrite it?`,
				'Yes', 'No'
			);
			if (overwrite !== 'Yes') {
				return;
			}
		}

		messages[key] = cleanText;
		fs.writeFileSync(langPath, JSON.stringify(messages, null, 2));

		// Replace selected text with translation key call
		const edit = new vscode.WorkspaceEdit();
		edit.replace(
			document.uri,
			range,
			pasteFormat
		);
		await vscode.workspace.applyEdit(edit);

		// Update decorations
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			updateDecorations(editor);
		}

		vscode.window.showInformationMessage(`Successfully extracted text to translation key '${key}'`);
	} catch (error) {
		if (error instanceof Error) {
			vscode.window.showErrorMessage(`Failed to extract translation: ${error.message}`);
		}
	}
}

// This method is called when your extension is deactivated
export function deactivate() {
	if (debounceTimer) {
		clearTimeout(debounceTimer);
	}
	if (configWatcher) {
		configWatcher.dispose();
	}
	decorationType.dispose();
	statusBarItem.dispose();
}
