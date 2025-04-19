import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import pc from 'picocolors';

// Reserved names for JavaScript runtime, since these keys will be converted to variables
export const reservedJsKeywords = [
  'new', 'var', 'let', 'const', 'function', 'class', 'return', 'if', 'else', 'switch', 
  'case', 'default', 'break', 'continue', 'for', 'while', 'do', 'try', 'catch', 'finally', 
  'throw', 'this', 'super', 'import', 'export', 'delete', 'void', 'typeof', 'instanceof',
  'in', 'of', 'await', 'async', 'yield', 'debugger', 'with', 'null', 'undefined', 'true', 'false'
];

/**
 * Processes a language file and returns a map of key-value pairs
 * @param language The language code
 * @param languagePath Path to the messages directory
 * @returns A map of translation keys to their translated values
 */
export const processLanguage = (language: string, languagePath: string): Map<string, string> => {
  const languageFilePath = path.join(languagePath, `${language}.json`);
  
  if (!fs.existsSync(languageFilePath)) {
    throw new Error(`${pc.red('Error:')} Language file for ${pc.yellow(language)} not found at ${languageFilePath}`);
  }

  const languageData = fs.readFileSync(languageFilePath, 'utf8');

  const languageDataSchema = z.string().transform((value) => {
    const parsed = JSON.parse(value) as Record<string, string>;

    const translationMap = new Map(Object.entries(parsed));

    for (const key of translationMap.keys()) {
      if (reservedJsKeywords.includes(key)) {
        throw new Error(`${pc.red('Error:')} Reserved words like ${pc.yellow(key)} are not allowed to be used as keys.`);
      }
    }

    return translationMap;
  });

  return languageDataSchema.parse(languageData);
};

/**
 * Creates a new language file or updates an existing one
 * @param language The language code
 * @param languagePath Path to the messages directory
 * @param translations Key-value pairs of translations
 */
export const writeLanguageFile = (
  language: string, 
  languagePath: string, 
  translations: Record<string, string>
): void => {
  const languageFilePath = path.join(languagePath, `${language}.json`);
  
  // Make sure directory exists
  if (!fs.existsSync(languagePath)) {
    fs.mkdirSync(languagePath, { recursive: true });
  }

  fs.writeFileSync(languageFilePath, JSON.stringify(translations, null, 2), 'utf8');
}; 