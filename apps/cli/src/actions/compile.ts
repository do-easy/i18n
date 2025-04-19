import type { Command } from 'commander';
import pc from 'picocolors';
import { loadConfig, DEFAULT_CONFIG_FILE_NAME } from '@do-easy-i18n/config';
import { compileFiles } from '../lib/compiler/compiler';
import { watchFiles } from '../lib/file-watcher/file-watcher';

export const execute = (configPath: string, outputPath: string, watch = false) => {
  // Load configuration
  const configResult = loadConfig(configPath);
  
  if (!configResult.isValid) {
    console.error(pc.red('Config file is invalid:'));
    configResult.errors?.forEach(error => {
      console.log(`- ${error}`);
    });
    return;
  }

  // Initial compilation
  const compileResult = compileFiles(configResult, outputPath);
  
  if (compileResult.success) {
    console.log(pc.green(`✓ ${compileResult.message} at ${compileResult.timestamp}`));
  } else {
    console.error(pc.red(`✗ ${compileResult.message}`));
    return;
  }

  // Watch mode
  if (watch) {
    const stopWatching = watchFiles(
      configResult.configFilePath, 
      configResult.messagesPath, 
      {
        onFileChange: () => {
          // Reload config on change
          const updatedConfig = loadConfig(configPath);
          
          if (!updatedConfig.isValid) {
            console.error(pc.red('Config file is invalid:'));
            updatedConfig.errors?.forEach(error => {
              console.log(`- ${error}`);
            });
            return;
          }
          
          const result = compileFiles(updatedConfig, outputPath);
          
          if (result.success) {
            console.log(pc.green(`✓ ${result.message} at ${result.timestamp}`));
          } else {
            console.error(pc.red(`✗ ${result.message}`));
          }
        }
      }
    );

    // Handle process termination
    process.on('SIGINT', () => {
      stopWatching();
      process.exit(0);
    });
  }
};

export const compileCommand = (commandInstance: Command) => {
  commandInstance
    .command('compile')
    .description('Compile the messages.')
    .option('-c, --config <config>', 'Config path.', `./${DEFAULT_CONFIG_FILE_NAME}`)
    .option('-o, --output <output>', 'Output path.', './dist')
    .option('-w, --watch', 'Watch for changes and recompile automatically', false)
    .action(({ config, output, watch }: { config: string, output: string, watch: boolean }) => {
      execute(config, output, watch);
    });
};