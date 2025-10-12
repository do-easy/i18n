import fs from 'fs';
import path from 'path';
import { ZodError } from 'zod';
import { settingsSchema, SettingsWithDeepL, settingsWithDeepLSchema } from './schema';
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
  const configFileName = path.basename(configPath);
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
    result.errors = [`${configFileName} does not exist`];
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

/**
 * Loads and validates the configuration file with DeepL settings
 * @param configPath Path to the configuration file
 * @returns ConfigResult with validation status and parsed configuration including DeepL settings
 */
export function loadConfigWithDeepL(configPath: string): ConfigResult & { deepL?: SettingsWithDeepL['deepL'] } {
  const currentPath = path.dirname(configPath);
  const configFileName = path.basename(configPath);
  const configFilePath = path.join(currentPath, configFileName);
  const messagesPath = path.join(currentPath, 'messages');

  const result: ConfigResult & { deepL?: SettingsWithDeepL['deepL'] } = {
    defaultLanguage: '',
    languages: [],
    messagesPath,
    configFilePath,
    isValid: false,
    errors: []
  };

  if (!fs.existsSync(configFilePath)) {
    result.errors = [`${configFileName} does not exist`];
    return result;
  }

  try {
    const configContent = fs.readFileSync(configFilePath, 'utf8');
    const config = JSON.parse(configContent) as unknown;
    const parsedConfig = settingsWithDeepLSchema.parse(config);

    result.defaultLanguage = parsedConfig.defaultLanguage;
    result.languages = parsedConfig.languages.filter(language => language !== parsedConfig.defaultLanguage);
    
    // Handle DeepL configuration with environment variable fallback
    if (parsedConfig.deepL) {
      result.deepL = {
        ...parsedConfig.deepL,
        // Use environment variable if apiKey is not provided in config
        apiKey: parsedConfig.deepL.apiKey || process.env.D18N_DEEPL_API_KEY || undefined
      };
    }
    
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