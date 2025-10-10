import type { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import pc from 'picocolors';
import { DEFAULT_CONFIG_FILE_NAME, loadConfigWithDeepL } from '@do-easy-i18n/config';
import { processLanguage, writeLanguageFile, translateText } from '@do-easy-i18n/translation-utils';

export const execute = async (configPath: string) => {
  const currentPath = path.dirname(configPath);
  const configFileName = path.basename(configPath);
  const fullConfigPath = path.join(currentPath, configFileName);

  if (!fs.existsSync(fullConfigPath)) {
    console.error(pc.red(`${configFileName} does not exist`));
    return;
  }

  try {
    // Use shared config loader with DeepL
    const configResult = loadConfigWithDeepL(fullConfigPath);
    
    if (!configResult.isValid || !configResult.deepL) {
      console.error(pc.red('Config file is invalid:'));
      configResult.errors?.forEach(error => {
        console.log(`- ${error}`);
      });
      return;
    }

    const languages = [...configResult.languages, configResult.defaultLanguage];
    const languagePath = configResult.messagesPath;

    // Load all language translations
    const allTranslations = new Map<string, Map<string, string>>();
    for (const language of languages) {
      try {
        allTranslations.set(language, processLanguage(language, languagePath));
      } catch (error) {
        // Create an empty translation file if it doesn't exist yet
        if (!fs.existsSync(path.join(languagePath, `${language}.json`))) {
          writeLanguageFile(language, languagePath, {});
          allTranslations.set(language, new Map<string, string>());
        } else {
          console.error(pc.red(`Error loading ${language} translations: ${error instanceof Error ? error.message : 'Unknown error'}`));
          return;
        }
      }
    }

    // Find all unique keys across all language files
    const allKeys = new Set<string>();
    for (const translations of allTranslations.values()) {
      for (const key of translations.keys()) {
        allKeys.add(key);
      }
    }

    // Process each language
    for (const targetLanguage of languages) {
      const targetTranslations = allTranslations.get(targetLanguage) ?? new Map<string, string>();
      const newTranslations: Record<string, string> = {};
      let hasUpdates = false;

      // First, add all existing translations
      for (const [key, value] of targetTranslations.entries()) {
        newTranslations[key] = value;
      }

      // Then check for missing translations
      for (const key of allKeys) {
        if (!targetTranslations.has(key)) {
          // Find a source language that has this key
          for (const sourceLanguage of languages) {
            if (sourceLanguage === targetLanguage) continue;
            
            const sourceTranslations = allTranslations.get(sourceLanguage);
            const sourceText = sourceTranslations?.get(key);
            
            if (sourceText) {
              try {
                console.log(pc.blue(`Translating key "${key}" from ${sourceLanguage} to ${targetLanguage}...\n`));
                const translatedText = await translateText(sourceText, targetLanguage, configResult.deepL, sourceLanguage);
                // Wait for 1 second to avoid rate limiting
                // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
                await new Promise(resolve => setTimeout(resolve, configResult.deepL?.requestDelay ?? 1000));
                newTranslations[key] = translatedText;
                console.log(pc.green(`✓ Translated: ${key}`));
                hasUpdates = true;
                break; // Found a source, no need to check other languages
              } catch (error) {
                console.error(pc.red(`✗ Failed to translate ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`));
              }
            }
          }
        }
      }

      // Only write the file if there were updates
      if (hasUpdates) {
        writeLanguageFile(targetLanguage, languagePath, newTranslations);
        console.log(pc.green(`\nUpdated translations for ${targetLanguage}\n`));
      } else {
        console.log(pc.yellow(`No new translations needed for ${targetLanguage}`));
      }
    }

    console.log(pc.green('\nTranslation completed!'));
  } catch (err) {
    if (err instanceof Error) {
      console.error(pc.red(err.message));
    }
  }
};

export const translateCommand = (commandInstance: Command) => {
  commandInstance
    .command('translate')
    .description('Translate missing messages using DeepL API.')
    .option('-c, --config <config>', 'Config path.', `./${DEFAULT_CONFIG_FILE_NAME}`)
    .action(async ({ config }: { config: string }) => {
      await execute(config);
    });
}; 