import { z } from 'zod';

const languageCodeRegex = /^[a-z]{2}(-[A-Z]{2})?$/;

export const DEFAULT_CONFIG_FILE_NAME = 'do-easy-i18n.config.json';

export const languageSchema = z.string().regex(languageCodeRegex, {
  message: 'Language code must be in format "xx" or "xx-XX" (e.g., "en" or "en-US")',
});

const baseSettingsSchema = z.object({
  languages: z.array(languageSchema).min(1, {
    message: 'At least one language must be specified',
  }),
  defaultLanguage: languageSchema,
});

export const settingsSchema = baseSettingsSchema.refine((data) => data.languages.includes(data.defaultLanguage), {
  message: 'Default language must be included in the languages array',
  path: ['defaultLanguage'],
});

export const deepLConfigSchema = z.object({
  host: z.string().url({
    message: 'DeepL host must be a valid URL',
  }),
  apiKey: z.string().min(1, {
    message: 'DeepL API key is required',
  }),
});

export const settingsWithDeepLSchema = baseSettingsSchema.extend({
  deepL: deepLConfigSchema,
}).refine((data) => data.languages.includes(data.defaultLanguage), {
  message: 'Default language must be included in the languages array',
  path: ['defaultLanguage'],
});

export type Settings = z.infer<typeof settingsSchema>;
export type SettingsWithDeepL = z.infer<typeof settingsWithDeepLSchema>;
export type DeepLConfig = z.infer<typeof deepLConfigSchema>; 