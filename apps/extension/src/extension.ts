// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  DeepLConfig,
  DEFAULT_CONFIG_FILE_NAME,
  settingsWithDeepLSchema,
} from "@do-easy-i18n/config";
import { translateText } from "@do-easy-i18n/translation-utils";
import { humanId } from "human-id";
import * as ts from "typescript";

interface Config {
  defaultLanguage: string
  deepL: DeepLConfig
}

let configPath: string | null = null;
let decorationType: vscode.TextEditorDecorationType;
let debounceTimer: NodeJS.Timeout | null = null;
let statusBarItem: vscode.StatusBarItem;
let currentLanguage: string = "en";
let availableLanguages: string[] = [];
let config: Config | null = null;
let configWatcher: vscode.FileSystemWatcher | null = null;
let lastI18nImport: string | undefined;

interface I18nStatement {
  i18nKey: string
  range: vscode.Range
}

interface TranslationStatus {
  hasCurrentTranslation: boolean
  missingLanguages: string[]
}

interface TranslationInfo {
  [language: string]: string | null
}

// Add a translation in progress tracker
let translationsInProgress = new Set<string>();

// Add this after the interfaces
class TranslationActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.RefactorExtract,
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
      "Extract to translation key",
      vscode.CodeActionKind.RefactorExtract
    );

    action.command = {
      command: "do-easy-i18n.extractTranslation",
      title: "Extract to translation key",
      arguments: [document, range, selectedText],
    };

    return [action];
  }
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {
  console.log("do-easy-i18n extension is now active!");

  // Create decoration type for translations
  decorationType = vscode.window.createTextEditorDecorationType({
    after: {
      margin: "0 0 0 0.5em",
      color: new vscode.ThemeColor("editorCodeLens.foreground"),
    },
  });

  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "do-easy-i18n.selectLanguage";
  context.subscriptions.push(statusBarItem);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "do-easy-i18n.selectLanguage",
      handleLanguageSelection
    ),
    vscode.commands.registerCommand(
      "do-easy-i18n.editTranslation",
      handleTranslationEdit
    ),
    vscode.commands.registerCommand(
      "do-easy-i18n.addMissingTranslation",
      handleAddMissingTranslation
    ),
    vscode.commands.registerCommand(
      "do-easy-i18n.deleteTranslation",
      handleDeleteTranslation
    ),
    vscode.languages.registerCodeActionsProvider(
      ["javascript", "typescript", "javascriptreact", "typescriptreact"],
      new TranslationActionProvider(),
      {
        providedCodeActionKinds:
          TranslationActionProvider.providedCodeActionKinds,
      }
    ),
    vscode.commands.registerCommand(
      "do-easy-i18n.extractTranslation",
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
      console.log("Config file changed, reloading settings...");
      loadConfig();
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        updateDecorations(editor);
      }
    });

    // Watch for config file deletion
    configWatcher.onDidDelete(() => {
      console.log("Config file deleted");
      config = null;
      configPath = null;
      vscode.window.showWarningMessage(
        "do-easy-i18n configuration file not found."
      );
    });

    context.subscriptions.push(configWatcher);
  }

  // Register event listener for file opens
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        updateDecorations(editor);
      }
    }),
    // Add listener for document changes
    vscode.workspace.onDidChangeTextDocument((event) => {
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
  setTimeout(() => {
    if (vscode.window.activeTextEditor) {
      updateDecorations(vscode.window.activeTextEditor);
    }
  }, 1000);
}

async function handleLanguageSelection() {
  const language = await vscode.window.showQuickPick(availableLanguages, {
    placeHolder: "Select language for translations",
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
  if (!configPath) {
    return;
  }

  const messagesDir = getMessagesDir();
  const langPath = path.join(messagesDir, `${language}.json`);

  if (!fs.existsSync(langPath)) {
    // Create new language file if it doesn't exist
    fs.writeFileSync(langPath, "{}", "utf8");
  }

  const messages = JSON.parse(fs.readFileSync(langPath, "utf8"));
  const currentTranslation = messages[key] || "";

  const newTranslation = await vscode.window.showInputBox({
    prompt: `Edit translation for '${key}' in ${language}`,
    value: currentTranslation,
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
  if (!configPath) {
    return;
  }

  const messagesDir = getMessagesDir();
  const langPath = path.join(messagesDir, `${language}.json`);

  if (!fs.existsSync(langPath)) {
    vscode.window.showErrorMessage(
      `Translation file not found for language: ${language}`
    );
    return;
  }

  const messages = JSON.parse(fs.readFileSync(langPath, "utf8"));

  const confirm = await vscode.window.showWarningMessage(
    `Are you sure you want to delete the translation for '${key}' in ${language}?`,
    "Yes",
    "No"
  );

  if (confirm === "Yes") {
    delete messages[key];
    fs.writeFileSync(langPath, JSON.stringify(messages, null, 2));

    const editor = vscode.window.activeTextEditor;
    if (editor) {
      updateDecorations(editor);
    }
    vscode.window.showInformationMessage(
      `Translation for '${key}' in ${language} has been deleted.`
    );
  }
}

async function translateWithDeepL(
  text: string,
  targetLang: string,
  sourceLang?: string
): Promise<string> {
  const { success } = settingsWithDeepLSchema.safeParse(config);

  if (!success) {
    throw new Error(`Error parsing config file`);
  }

  if (!config) {
    throw new Error(
      `Configuration not found. Please check your ${DEFAULT_CONFIG_FILE_NAME} file.`
    );
  }

  if (!config.deepL) {
    throw new Error(
      `DeepL configuration not found. Please add "deepL" section to your ${DEFAULT_CONFIG_FILE_NAME}`
    );
  }

  if (!config.deepL.apiKey) {
    throw new Error(
      `DeepL API key not configured. Please add "deepL.apiKey" to your ${DEFAULT_CONFIG_FILE_NAME}`
    );
  }

  // Use the shared utility
  try {
    return await translateText(text, targetLang, config.deepL, sourceLang);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Translation failed: ${error.message}`);
    } else {
      throw new Error("Translation failed with unknown error");
    }
  }
}

async function handleAddMissingTranslation(key: string, language: string) {
  // Create a unique identifier for this translation request
  const translationId = `${key}:${language}`;

  // Check if translation is already in progress
  if (translationsInProgress.has(translationId)) {
    vscode.window.showInformationMessage(
      "Translation already in progress, please wait..."
    );
    return;
  }

  if (!configPath || !config) {
    vscode.window.showErrorMessage("Configuration file not found or invalid.");
    return;
  }

  const messagesDir = getMessagesDir();
  let sourceText: string | null = null;
  let sourceLang: string | undefined = undefined;

  // Try default language first
  const defaultLangPath = path.join(
    messagesDir,
    `${config.defaultLanguage}.json`
  );
  if (fs.existsSync(defaultLangPath)) {
    const messages = JSON.parse(fs.readFileSync(defaultLangPath, "utf8"));
    if (messages[key]) {
      sourceText = messages[key];
      sourceLang = config.defaultLanguage;
    }
  }

  // If not found in default language, try any other language
  if (!sourceText) {
    for (const lang of availableLanguages) {
      if (lang === language) {
        continue;
      } // Skip target language
      const langPath = path.join(messagesDir, `${lang}.json`);
      if (fs.existsSync(langPath)) {
        const messages = JSON.parse(fs.readFileSync(langPath, "utf8"));
        if (messages[key]) {
          sourceText = messages[key];
          sourceLang = lang;
          break;
        }
      }
    }
  }

  if (!sourceText) {
    vscode.window.showErrorMessage(
      "No source translation found to translate from."
    );
    return;
  }

  // Add to in-progress set and show loading message
  translationsInProgress.add(translationId);
  const loadingMessage = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Translating "${key}" to ${language}...`,
      cancellable: false,
    },
    async () => {
      try {
        const translation = await translateWithDeepL(
          sourceText!,
          language,
          sourceLang
        );

        // Save the translation
        const targetLangPath = path.join(messagesDir, `${language}.json`);
        const targetMessages = fs.existsSync(targetLangPath)
          ? JSON.parse(fs.readFileSync(targetLangPath, "utf8"))
          : {};

        targetMessages[key] = translation;
        fs.writeFileSync(
          targetLangPath,
          JSON.stringify(targetMessages, null, 2)
        );

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
          vscode.window.showErrorMessage(
            "Translation failed with unknown error"
          );
          throw new Error("Translation failed with unknown error");
        }
      } finally {
        // Always remove from in-progress set
        translationsInProgress.delete(translationId);
      }
    }
  );

  // Show success message
  vscode.window.showInformationMessage(loadingMessage);
}

function getMessagesDir(): string {
  if (!configPath) {
    throw new Error("Config path not found");
  }
  return path.join(path.dirname(configPath), "messages");
}

async function findConfigFile() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    vscode.window.showErrorMessage("No workspace folder is open");
    return;
  }

  try {
    // Define common directories to exclude
    const excludePatterns = [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.git/**",
      "**/coverage/**",
    ];

    // Create glob pattern to find config files
    const configFilePattern = `**/${DEFAULT_CONFIG_FILE_NAME}`;

    // Find all matching files in the workspace
    const files = await vscode.workspace.findFiles(
      configFilePattern,
      `{${excludePatterns.join(",")}}`
    );

    if (files.length === 0) {
      vscode.window.showWarningMessage(
        `No ${DEFAULT_CONFIG_FILE_NAME} found in the workspace`
      );
      return;
    }

    if (files.length > 1) {
      // If multiple config files found, let the user choose
      const fileItems = files.map((file) => ({
        label: vscode.workspace.asRelativePath(file),
        file,
      }));

      const selected = await vscode.window.showQuickPick(fileItems, {
        placeHolder: "Multiple config files found. Select one to use:",
      });

      if (!selected) {
        return;
      }

      configPath = selected.file.fsPath;
    } else {
      // Only one config file found
      configPath = files[0].fsPath;
    }

    console.log("Found config file at:", configPath);
    loadConfig();
  } catch (error) {
    if (error instanceof Error) {
      vscode.window.showErrorMessage(
        `Error finding config file: ${error.message}`
      );
    }
  }
}

function loadConfig() {
  if (!configPath) {
    return;
  }

  try {
    const configContent = fs.readFileSync(configPath, "utf8");
    config = JSON.parse(configContent) as Config;

    // Validate required fields
    if (!config.defaultLanguage) {
      throw new Error(
        "Missing required field in config: defaultLanguage is required"
      );
    }

    const messagesDir = getMessagesDir();

    if (fs.existsSync(messagesDir)) {
      availableLanguages = fs
        .readdirSync(messagesDir)
        .filter((file) => file.endsWith(".json"))
        .map((file) => path.basename(file, ".json"));

      currentLanguage = config.defaultLanguage || availableLanguages[0] || "en";
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
      vscode.window.showErrorMessage(
        `Error reading config file: ${error.message}`
      );
    }
    config = null;
  }
}

function updateStatusBarItem() {
  statusBarItem.text = `$(globe) ${currentLanguage.toUpperCase()}`;
  statusBarItem.tooltip =
    "Change translation language to show in line decorations";
  statusBarItem.show();
}

function getAllTranslations(key: string, messagesDir: string): TranslationInfo {
  const translations: TranslationInfo = {};

  for (const lang of availableLanguages) {
    const langPath = path.join(messagesDir, `${lang}.json`);
    if (fs.existsSync(langPath)) {
      const messages = JSON.parse(fs.readFileSync(langPath, "utf8"));
      translations[lang] = messages[key] || null;
    } else {
      translations[lang] = null;
    }
  }

  return translations;
}

function getToolTipMessage(
  key: string,
  lang: string,
  translation: string | null
): string {
  return (
    `*${lang}*: ${translation || "<missing translation>"}    ` +
    `<a title="Edit translation" href="command:do-easy-i18n.editTranslation?${encodeURIComponent(JSON.stringify([key, lang]))}">$(edit)</a>   ` +
    `<a title="Add translation using DeepL" href="command:do-easy-i18n.addMissingTranslation?${encodeURIComponent(JSON.stringify([key, lang]))}">$(sparkle)</a>   ` +
    `<a title="Delete translation" href="command:do-easy-i18n.deleteTranslation?${encodeURIComponent(JSON.stringify([key, lang]))}">$(trash)</a>\n\n`
  );
}

function createHoverMessage(
  key: string,
  translations: TranslationInfo
): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString("", true);
  markdown.isTrusted = true;
  markdown.supportHtml = true;

  for (const lang of availableLanguages) {
    const translation = translations[lang];
    if (translation !== null) {
      markdown.appendMarkdown(getToolTipMessage(key, lang, translation));
    } else {
      markdown.appendMarkdown(getToolTipMessage(key, lang, translation));
    }
  }

  return markdown;
}

function checkTranslationStatus(
  key: string,
  messagesDir: string
): TranslationStatus {
  const status: TranslationStatus = {
    hasCurrentTranslation: false,
    missingLanguages: [],
  };

  // Check current language first
  const currentLangPath = path.join(messagesDir, `${currentLanguage}.json`);
  if (fs.existsSync(currentLangPath)) {
    const currentMessages = JSON.parse(fs.readFileSync(currentLangPath, "utf8"));
    status.hasCurrentTranslation = key in currentMessages;
  }

  // Check all other languages
  for (const lang of availableLanguages) {
    if (lang === currentLanguage) {
      continue;
    }

    const langPath = path.join(messagesDir, `${lang}.json`);
    if (fs.existsSync(langPath)) {
      const messages = JSON.parse(fs.readFileSync(langPath, "utf8"));
      if (!(key in messages)) {
        status.missingLanguages.push(lang);
      }
    }
  }

  return status;
}

function getI18nStatement(
  expression: ts.Declaration,
  sourceFile: ts.SourceFile
): I18nStatement | null {
  const i18nKey = expression.getText();

  if (!i18nKey) {
    return null;
  }

  const startOffset = expression.getStart();
  const endOffset = expression.getEnd();

  const startPos = sourceFile.getLineAndCharacterOfPosition(startOffset);
  const endPos = sourceFile.getLineAndCharacterOfPosition(endOffset);

  const vscodeRange = new vscode.Range(
    new vscode.Position(startPos.line, startPos.character),
    new vscode.Position(endPos.line, endPos.character)
  );

  return {
    i18nKey,
    range: vscodeRange,
  };
}

async function updateDecorations(editor: vscode.TextEditor) {
  if (!configPath) {
    return;
  }

  const document = editor.document;

  const scriptKind =
    document.languageId === "typescriptreact"
      ? ts.ScriptKind.TSX
      : ts.ScriptKind.TS;

  const sourceFile = ts.createSourceFile(
    "virtual.ts",
    document.getText(),
    ts.ScriptTarget.Latest,
    true,
    scriptKind
  );

  /**
   * i18n imports identifiers
   * Example:
   * import * as i18n from "do-easy-i18n";
   * import { annual_summary } from "do-easy-i18n";
   *
   * `i18n` and `annual_summary` are the identifiers
   */
  const i18nImportsIdentifiers = new Set<string>();

  for (const statement of sourceFile.statements) {
    if (statement.kind === ts.SyntaxKind.ImportDeclaration) {
      const importDecl = statement as ts.ImportDeclaration;

      if (ts.isStringLiteral(importDecl.moduleSpecifier)) {
        const moduleSpecifierNode = importDecl.moduleSpecifier;
        const position = document.positionAt(moduleSpecifierNode.getStart() + 1);

        const definition = await vscode.commands.executeCommand<
          vscode.LocationLink[]
        >("vscode.executeDefinitionProvider", document.uri, position);

        if (definition && definition.length > 0) {
          const definitionFileUri = definition[0].targetUri;

          // Ensure it's a file URI and we can access fsPath
          if (definitionFileUri.scheme === "file") {
            const importSourceFileContent =
              await vscode.workspace.fs.readFile(definitionFileUri);
            const isDoEasyI18nImport = importSourceFileContent
              .toString()
              .startsWith("// do-easy-i18n");

            if (isDoEasyI18nImport) {
              lastI18nImport = importDecl.moduleSpecifier.text;

              const namedBindings = importDecl.importClause
                ?.namedBindings as ts.NamespaceImport;
              const namedImports = importDecl.importClause
                ?.namedBindings as ts.NamedImports;
              const isNamedImport =
                namedBindings?.name === undefined &&
                namedImports?.elements.length > 0;

              if (isNamedImport) {
                namedImports.elements.forEach((e) => {
                  i18nImportsIdentifiers.add(e.name.getText());
                });
              } else {
                i18nImportsIdentifiers.add(namedBindings.name.getText());
              }
            }
          }
        }
      }
    }
  }

  if (i18nImportsIdentifiers.size === 0) {
    return;
  }

  const i18nStatements: I18nStatement[] = [];

  const program = ts.createProgram({
    rootNames: ["virtual.ts"],
    options: {},
    host: ts.createCompilerHost({}, true),
  })

  ;(program as any).getSourceFile = () => [sourceFile];

  // Recursive function to find usages
  function findUsages(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const expression = node.expression;

      if (ts.isIdentifier(expression)) {
        const name = expression.text;

        if (i18nImportsIdentifiers.has(name)) {
          const i18nStatement = getI18nStatement(expression, sourceFile);

          if (i18nStatement) {
            i18nStatements.push(i18nStatement);
          }
        }
      } else if (ts.isPropertyAccessExpression(expression)) {
        const namespace = expression.expression;
        const property = expression.name;

        if (
          ts.isIdentifier(namespace) &&
          i18nImportsIdentifiers.has(namespace.text)
        ) {
          const i18nStatement = getI18nStatement(
            property as ts.Declaration,
            sourceFile
          );

          if (i18nStatement) {
            i18nStatements.push(i18nStatement);
          }
        }
      }
    }

    ts.forEachChild(node, findUsages);
  }

  // Start traversing from the root node
  findUsages(sourceFile);

  const messagesDir = getMessagesDir();
  const messagesPath = path.join(messagesDir, `${currentLanguage}.json`);

  if (!fs.existsSync(messagesPath)) {
    vscode.window.showWarningMessage(
      `Translation file not found for language: ${currentLanguage}`
    );
    return;
  }

  const messages = JSON.parse(fs.readFileSync(messagesPath, "utf8"));
  const decorations: vscode.DecorationOptions[] = [];

  for (const { i18nKey, range } of i18nStatements) {
    const translation = messages[i18nKey];
    const status = checkTranslationStatus(i18nKey, messagesDir);
    const allTranslations = getAllTranslations(i18nKey, messagesDir);
    const hoverMessage = createHoverMessage(i18nKey, allTranslations);

    if (!status.hasCurrentTranslation) {
      // No translation in current language - show red X with missing languages
      decorations.push({
        range,
        renderOptions: {
          after: {
            contentText: `❌ missing translation on language: ${[currentLanguage, ...status.missingLanguages].join(", ")}`,
            color: new vscode.ThemeColor("errorForeground"),
          },
        },
        hoverMessage,
      });
    } else if (status.missingLanguages.length > 0) {
      // Has translation in current language but missing in others - yellow
      decorations.push({
        range,
        renderOptions: {
          after: {
            contentText: `→ ${translation}`,
            color: new vscode.ThemeColor("editorWarning.foreground"),
          },
        },
        hoverMessage,
      });
    } else {
      // Has translation in all languages - green
      decorations.push({
        range,
        renderOptions: {
          after: {
            contentText: `→ ${translation}`,
            color: new vscode.ThemeColor("testing.runAction"),
          },
        },
        hoverMessage,
      });
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
    vscode.window.showErrorMessage("Configuration file not found or invalid.");

    return;
  }

  // Clean up selected text - remove surrounding quotes if they exist
  let cleanText = selectedText.trim();
  if (
    (cleanText.startsWith('"') && cleanText.endsWith('"')) ||
    (cleanText.startsWith("'") && cleanText.endsWith("'"))
  ) {
    cleanText = cleanText.slice(1, -1);
  }

  let defaultValue = humanId({
    capitalize: false,
    separator: "_",
  });

  // check if it already exists
  while (
    getAllTranslations(defaultValue, getMessagesDir())[currentLanguage] !== null
  ) {
    defaultValue = humanId({
      capitalize: false,
      separator: "_",
    });
  }

  // Ask for the translation key
  const key = await vscode.window.showInputBox({
    prompt: "Enter a translation key",
    placeHolder: "e.g., welcomeMessage, errorText, etc.",
    value: defaultValue,
    validateInput: (value) => {
      if (!value) {
        return "Translation key cannot be empty";
      }

      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(value)) {
        return "Translation key must start with a letter and contain only letters, numbers, and underscores";
      }

      const messageExists =
        getAllTranslations(value, getMessagesDir())[currentLanguage] !== null;

      if (messageExists) {
        return "Translation key already exists";
      }

      return null;
    },
  });

  if (!key) {
    return;
  }

  let moduleAlias: string | undefined;
  let importPath: string | undefined;
  let hasAddedImport: boolean = false;

  // Verify if the import already exists in the file, if exists use it, otherwise put the import at the top of the file
  if (lastI18nImport && document.getText().includes(lastI18nImport)) {
    const importRegex = new RegExp(
      `import\\s*\\*\\s*as\\s*(\\w+)\\s*from\\s*['"]${lastI18nImport}['"]`,
      "g"
    );
    const importMatch = importRegex.exec(document.getText());

    if (importMatch) {
      moduleAlias = importMatch[1];
    }
  }

  if (!moduleAlias) {
    // Ask for the module alias
    moduleAlias = await vscode.window.showInputBox({
      prompt: "Enter the module alias",
      placeHolder: "e.g., i18n, t, etc.",
      value: "i18n",
      validateInput: (value) => {
        if (!value) {
          return "Module alias cannot be empty";
        }

        if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(value)) {
          return "Module alias must start with a letter and contain only letters, numbers, and underscores";
        }

        return null;
      },
    });

    if (!moduleAlias) {
      vscode.window.showErrorMessage("Module alias is required");

      return;
    }

    if (!lastI18nImport) {
      // Ask for the import path
      importPath = await vscode.window.showInputBox({
        prompt: "Enter the import path",
        placeHolder: "e.g., do-easy-i18n, @do-easy-i18n/core, etc.",
        value: "do-easy-i18n",
        validateInput: (value) => {
          if (!value) {
            return "Import path cannot be empty";
          }
        },
      });

      if (!importPath) {
        vscode.window.showErrorMessage("Import path is required");

        return;
      }
    }

    hasAddedImport = true;
  }

  // Ask for paste format
  const pasteFormat = await vscode.window.showQuickPick(
    [`${moduleAlias}.${key}()`, `{${moduleAlias}.${key}()}`],
    {
      placeHolder: "Select the paste format",
    }
  );

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
      ? JSON.parse(fs.readFileSync(langPath, "utf8"))
      : {};

    if (messages[key]) {
      const overwrite = await vscode.window.showWarningMessage(
        `Translation key '${key}' already exists. Do you want to overwrite it?`,
        "Yes",
        "No"
      );
      if (overwrite !== "Yes") {
        return;
      }
    }

    messages[key] = cleanText;
    fs.writeFileSync(langPath, JSON.stringify(messages, null, 2));


    // Add the import to the file
    if (hasAddedImport) {
      const importEdit = new vscode.WorkspaceEdit();
      importEdit.insert(
        document.uri,
        new vscode.Position(0, 0),
        `import * as ${moduleAlias} from "${lastI18nImport}";\n`
      );
      await vscode.workspace.applyEdit(importEdit);
    }

    // Replace selected text with translation key call
    const translationKeyEdit = new vscode.WorkspaceEdit();
    let updatedRange = hasAddedImport ? new vscode.Range(range.start.line + 1, range.start.character, range.end.line + 1, range.end.character) : range;
    // Get past location content to search for quotes before and after the text. If it has, then we need to remove the quotes.
    const textBefore = document.getText(new vscode.Range(updatedRange.start.line, updatedRange.start.character - 1, updatedRange.start.line, updatedRange.start.character));
    const textAfter = document.getText(new vscode.Range(updatedRange.end.line, updatedRange.end.character, updatedRange.end.line, updatedRange.end.character + 1));

    // Remove quotes if they exist
    if (textBefore.includes('"') && textAfter.includes('"') || textBefore.includes("'") && textAfter.includes("'")) {
      updatedRange = new vscode.Range(updatedRange.start.line, updatedRange.start.character - 1, updatedRange.end.line, updatedRange.end.character + 1);
    }

    translationKeyEdit.replace(document.uri, updatedRange, pasteFormat);
    await vscode.workspace.applyEdit(translationKeyEdit);

    // Update decorations
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      updateDecorations(editor);
    }

    vscode.window.showInformationMessage(
      `Successfully extracted text to translation key '${key}'`
    );
  } catch (error) {
    if (error instanceof Error) {
      vscode.window.showErrorMessage(
        `Failed to extract translation: ${error.message}`
      );
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
