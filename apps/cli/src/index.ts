import { Command } from 'commander';
import { version } from '../package.json';
import { initCommand } from './actions/init';
import { compileCommand } from './actions/compile';
import { translateCommand } from './actions/translate';

const program = new Command();

program
  .name('do-easy-i18n')
  .description('A CLI tool for managing do-easy-i18n in your project.')
  .version(version);

initCommand(program);
compileCommand(program);
translateCommand(program);

program.parse(process.argv);
