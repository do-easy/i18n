import fs from 'fs';
import path from 'path';
import { processLanguage } from '@do-easy-i18n/translation-utils';
import { translationFile } from '../../templates/translation';
import { mainFile } from '../../templates/main';
import type { ConfigResult } from '@do-easy-i18n/config';

export interface CompileResult {
  success: boolean;
  message: string;
  timestamp: string;
}

/**
 * Compiles translation files based on the provided configuration
 * @param config Validated configuration object
 * @param outputPath Where to write the compiled files
 * @returns CompileResult with status and timestamp
 */
export function compileFiles(config: ConfigResult, outputPath: string): CompileResult {
  try {
    if (!config.isValid) {
      return {
        success: false,
        message: 'Config file is invalid',
        timestamp: new Date().toLocaleTimeString()
      };
    }

    const { defaultLanguage, languages, messagesPath } = config;
    
    const languagesData = new Map<string, Map<string, string>>();
    const processedMainLanguage = processLanguage(defaultLanguage, messagesPath);
    languagesData.set(defaultLanguage, processedMainLanguage);

    for (const language of languages) {
      const processedLanguage = processLanguage(language, messagesPath);

      for (const key of processedMainLanguage.keys()) {
        if (!processedLanguage.has(key)) {
          processedLanguage.set(key, `<missing ${language} translation>`);
        }
      }

      for (const key of processedLanguage.keys()) {
        if (!processedMainLanguage.has(key)) {
          processedMainLanguage.set(key, `<missing ${defaultLanguage} translation>`);
        }
      }
      
      languagesData.set(language, processedLanguage);
    }

    const translationsFiles = translationFile({
      languages: languagesData
    });

    const outFolderExists = fs.existsSync(outputPath);

    if (!outFolderExists) {
      fs.mkdirSync(outputPath, { recursive: true });
    }

    const messagesFolderExists = fs.existsSync(path.join(outputPath, 'messages'));

    if (!messagesFolderExists) {
      fs.mkdirSync(path.join(outputPath, 'messages'), { recursive: true });
    }

    const mainFileContent = mainFile(defaultLanguage, [defaultLanguage, ...languages]);
    fs.writeFileSync(path.join(outputPath, 'core.ts'), mainFileContent);

    let indexFileContent = '';

    for (const [key, content] of translationsFiles.entries()) {
      indexFileContent += `export * from './messages/${key}';\n`;
      fs.writeFileSync(path.join(outputPath, 'messages', `${key}.ts`), content);
    }

    fs.writeFileSync(path.join(outputPath, 'index.ts'), indexFileContent);

    const timestamp = new Date().toLocaleTimeString();
    return {
      success: true,
      message: 'Compilation completed successfully',
      timestamp
    };
  } catch (err: unknown) {
    const timestamp = new Date().toLocaleTimeString();
    let errorMessage = 'Unknown error during compilation';
    
    if (err instanceof Error) {
      errorMessage = err.message;
    }
    
    return {
      success: false,
      message: errorMessage,
      timestamp
    };
  }
} 