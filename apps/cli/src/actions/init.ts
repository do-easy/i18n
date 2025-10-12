import { DEFAULT_CONFIG_FILE_NAME } from '@do-easy-i18n/config';
import type { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import pc from 'picocolors';

export const execute = () => {
  const currentPath = process.cwd();

  if (fs.existsSync(path.join(currentPath, DEFAULT_CONFIG_FILE_NAME))) {
    console.log(pc.red(`${DEFAULT_CONFIG_FILE_NAME} already exists`));
    
    return;
  }

  const messagePath = path.join(currentPath, 'messages');
  const messagesFolderExists = fs.existsSync(messagePath);

  if (messagesFolderExists) {
    console.log(pc.red('messages folder already exists'));
    
    return;
  }

  const initialConfig = {
    languages: ['en'],
    defaultLanguage: 'en',
    deepL: {
      host: 'https://api-free.deepl.com',
    }
  };
  
  const configPath = path.join(currentPath, DEFAULT_CONFIG_FILE_NAME);
  
  fs.writeFileSync(configPath, JSON.stringify(initialConfig, null, 2));

  fs.mkdirSync(messagePath);

  fs.writeFileSync(path.join(messagePath, 'en.json'), '{}');
};

export const initCommand = (commandInstance: Command) => {
  commandInstance
    .command('init')
    .description('Initialize a new do-easy-i18n project.')
    .action(() => {
      execute();
    });
};
