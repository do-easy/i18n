import fs from 'fs';
import path from 'path';
import { ZodError } from 'zod';
import { settingsSchema } from '../../schema/settings';
import pc from 'picocolors';

export interface ConfigResult {
  defaultLanguage: string;
  languages: string[];
  messagesPath: string;
  configFilePath: string;
  isValid: boolean;
  errors?: string[];
}

/**
 * Loads and validates the configuration file
 * @param configPath Path to the configuration file
 * @returns ConfigResult with validation status and parsed configuration
 */
export function loadConfig(configPath: string): ConfigResult {
  const currentPath = path.dirname(configPath);
  const configFileName = 'do-easy-i18n.config.json';
  const configFilePath = path.join(currentPath, configFileName);
  const messagesPath = path.join(currentPath, 'messages');

  const result: ConfigResult = {
    defaultLanguage: '',
    languages: [],
    messagesPath,
    configFilePath,
    isValid: false,
    errors: []
  };

  if (!fs.existsSync(configFilePath)) {
    result.errors = ['do-easy-i18n.config.json does not exist'];
    return result;
  }

  try {
    const configContent = fs.readFileSync(configFilePath, 'utf8');
    const config = JSON.parse(configContent) as unknown;
    const parsedConfig = settingsSchema.parse(config);

    result.defaultLanguage = parsedConfig.defaultLanguage;
    result.languages = parsedConfig.languages.filter(language => language !== parsedConfig.defaultLanguage);
    result.isValid = true;
    
    return result;
  } catch (err: unknown) {
    if (err instanceof ZodError) {
      const errors = err.issues;
      result.errors = errors.map(error => `${pc.yellow(error.path.join('.'))}: ${error.message}`);
    } else if (err instanceof Error) {
      result.errors = [err.message];
    } else {
      result.errors = ['Unknown error loading configuration'];
    }
    
    return result;
  }
} 