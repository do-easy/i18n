import type { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import pc from 'picocolors';

export const execute = () => {
  const currentPath = process.cwd();

  const configFileName = 'do-easy-i18n.config.json';

  if (fs.existsSync(path.join(currentPath, configFileName))) {
    console.log(pc.red('do-easy-i18n.config.json already exists'));
    
    return;
  }

  const initialConfig = {
    languages: ['en'],
    defaultLanguage: 'en',
    deepL: {
      host: 'https://api-free.deepl.com',
      apiKey: '',
    }
  };
  
  const configPath = path.join(currentPath, configFileName);

  fs.writeFileSync(configPath, JSON.stringify(initialConfig, null, 2));

  const messagePath = path.join(currentPath, 'messages');

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
