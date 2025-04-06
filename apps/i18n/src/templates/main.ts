export const mainFile = (defaultLanguage: string, languages: string[]) => `export let baseLocale = '${defaultLanguage}';

const listeners = new Map<string, (language: string) => void>();

/**
 * The languages that are supported by the application.
 * 
 * @example
 * \`\`\`ts
 * import { languages } from 'do-easy-i18n';
 * 
 * console.log(languages);
 * \`\`\`
 */
export const languages = [${languages.map(language => `'${language}'`).join(', ')}] as const;

/**
 * Checks if a language exists.
 * 
 * @example
 * \`\`\`ts
 * import { languageExists } from 'do-easy-i18n';
 * 
 * console.log(languageExists('en'));
 * \`\`\`
 */
export const languageExists = (language: string): boolean => {
  return languages.includes(language as typeof languages[number]);
};

export const isLocale = languageExists

/**
 * The current language of the application.
 * 
 * @example
 * \`\`\`ts
 * import { getCurrentLanguage } from 'do-easy-i18n';
 *
 * console.log(getCurrentLanguage());
 * \`\`\`
 */
export const getCurrentLanguage = (): string => {
  return baseLocale;
};

export const getLocale = getCurrentLanguage;

/**
 * Adds a listener to the language change event.
 * 
 * @example
 * \`\`\`ts
 * import { onChangeLanguage } from 'do-easy-i18n';
 * 
 * const unsubscribe = onChangeLanguage('listenerName', (language) => {
 *   console.log(language);
 * });
 * 
 * unsubscribe();
 * \`\`\`
 */
export const onChangeLanguage = (listenerName: string, listener: (language: string) => void): (() => void) => {
  listeners.set(listenerName, listener);

  return () => {
    listeners.delete(listenerName);
  };
};

/**
 * Sets the current language of the application.
 * 
 * @example
 * \`\`\`ts
 * import { setLanguage } from 'do-easy-i18n';
 * 
 * setLanguage('en'); // will throw an error if the language does not exist
 * \`\`\`
 */
export const setLanguage = (language: string) => {
  if (!languageExists(language)) {
    throw new Error(\`Language \${language} does not exist\`);
  }

  baseLocale = language;

  for (const listener of listeners.values()) {
    listener(language);
  }
};

export const setLocale = setLanguage`;
