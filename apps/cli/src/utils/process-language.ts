import { z } from 'zod';
import fs from 'fs';
import path from 'path';
import pc from 'picocolors';

// reserved names for javascript runtime, since these keys will be converted to variables
const cursedKeys = [
  'new', 'var', 'let', 'const', 'function', 'class', 'return', 'if', 'else', 'switch', 
  'case', 'default', 'break', 'continue', 'for', 'while', 'do', 'try', 'catch', 'finally', 
  'throw', 'this', 'super', 'import', 'export', 'delete', 'void', 'typeof', 'instanceof',
  'in', 'of', 'await', 'async', 'yield', 'debugger', 'with', 'null', 'undefined', 'true', 'false'
];

export const processLanguage = (language: string, languagePath: string): Map<string, string> => {
  const languageData = fs.readFileSync(path.join(languagePath, `${language}.json`), 'utf8');

  const languageDataSchema = z.string().transform((value) => {
    const parsed = JSON.parse(value) as Record<string, string>;

    const translationMap = new Map(Object.entries(parsed));

    for (const key of translationMap.keys()) {
      if (cursedKeys.includes(key)) {
        throw new Error(`${pc.red('Error:')} Reserved words like ${pc.yellow(key)} are not allowed to be used as keys.`);
      }
    }

    return translationMap;
  });

  return languageDataSchema.parse(languageData);
};