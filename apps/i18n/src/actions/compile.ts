import type { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import { settingsSchema } from '../schema/settings';
import { ZodError } from 'zod';
import { processLanguage } from '../utils/process-language';
import pc from 'picocolors';
import { translationFile } from '../templates/translation';
import { mainFile } from '../templates/main';

export const execute = (configPath: string, outputPath: string) => {
  const currentPath = path.dirname(configPath);

  const configFileName = 'do-easy-i18n.config.json';

  if (!fs.existsSync(path.join(currentPath, configFileName))) {
    console.error('do-easy-i18n.config.json does not exist');
    
    return;
  }

  const config = JSON.parse(fs.readFileSync(path.join(currentPath, configFileName), 'utf8')) as unknown;

  try {
    const parsedConfig = settingsSchema.parse(config);

    const defaultLanguage = parsedConfig.defaultLanguage;
    const languages = parsedConfig.languages.filter(language => language !== defaultLanguage);
    const languagePath = path.join(currentPath, 'messages');

    const languagesData = new Map<string, Map<string, string>>();

    const processedMainLanguage = processLanguage(defaultLanguage, languagePath);

    languagesData.set(defaultLanguage, processedMainLanguage);

    for (const language of languages) {
      const processedLanguage = processLanguage(language, languagePath);

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

    const outputPathExists = fs.existsSync(outputPath);

    if (outputPathExists) {
      fs.rmSync(outputPath, { recursive: true, force: true });
    }
    
    fs.mkdirSync(outputPath, { recursive: true });
    fs.mkdirSync(path.join(outputPath, 'messages'), { recursive: true });

    const mainFileContent = mainFile(defaultLanguage, parsedConfig.languages);

    fs.writeFileSync(path.join(outputPath, 'core.ts'), mainFileContent);

    let indexFileContent = `export * from './core';

`;

    for (const [key, content] of translationsFiles.entries()) {
      indexFileContent += `export * from './messages/${key}';\n`;

      fs.writeFileSync(path.join(outputPath, 'messages',`${key}.ts`), content);
    }

    fs.writeFileSync(path.join(outputPath, 'index.ts'), indexFileContent);
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      const errors = err.issues;

      console.log(pc.red('Config file is invalid:'));
      
      for (const error of errors) {
        console.log(`- ${pc.yellow(error.path.join('.'))}: ${pc.red(error.message)}`);
      }
    } 
    
    if (err instanceof Error) {
      console.log(err.message);
    }
  }
};

export const compileCommand = (commandInstance: Command) => {
  commandInstance
    .command('compile')
    .description('Compile the messages.')
    .option('-c, --config <config>', 'Config path.', './do-easy-i18n.config.json')
    .option('-o, --output <output>', 'Output path.', './dist')
    .action(({ config, output }: { config: string, output: string }) => {
      execute(config, output);
    });
};