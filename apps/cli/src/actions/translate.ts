import type { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import pc from 'picocolors';
import { settingsWithDeepLSchema } from '../schema/settings';
import { processLanguage } from '../utils/process-language';

interface DeepLResponse {
  translations: {
    detected_source_language: string;
    text: string;
  }[];
}

async function translateText(text: string, targetLang: string, config: { host: string; apiKey: string }) {
  const response = await fetch(`${config.host}/v2/translate`, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text: [text],
      target_lang: targetLang.toUpperCase(),
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepL API error: ${response.statusText}`);
  }

  const data = await response.json() as DeepLResponse;
  return data.translations[0].text;
}

export const execute = async (configPath: string) => {
  const currentPath = path.dirname(configPath);
  const configFileName = path.basename(configPath);

  if (!fs.existsSync(path.join(currentPath, configFileName))) {
    console.error(pc.red(`${configFileName} does not exist`));

    return;
  }

  const config = JSON.parse(fs.readFileSync(path.join(currentPath, configFileName), 'utf8')) as Record<string, unknown>;

  try {
    const parsedConfig = settingsWithDeepLSchema.parse(config);
    const languages = parsedConfig.languages;
    const languagePath = path.join(currentPath, 'messages');

    // Load all language translations
    const allTranslations = new Map<string, Map<string, string>>();
    for (const language of languages) {
      allTranslations.set(language, processLanguage(language, languagePath));
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
      const translationFile = path.join(languagePath, `${targetLanguage}.json`);
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
                const translatedText = await translateText(sourceText, targetLanguage, parsedConfig.deepL);
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

      // Only write the file if there were updates or it doesn't exist yet
      if (hasUpdates || !fs.existsSync(translationFile)) {
        fs.writeFileSync(translationFile, JSON.stringify(newTranslations, null, 2));
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
    .option('-c, --config <config>', 'Config path.', './do-easy-i18n.config.json')
    .action(async ({ config }: { config: string }) => {
      await execute(config);
    });
}; 