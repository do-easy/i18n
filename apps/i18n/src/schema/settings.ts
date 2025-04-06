import { z } from 'zod';

const languageCodeRegex = /^[a-z]{2}(-[A-Z]{2})?$/;

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

export const settingsWithDeepLSchema = baseSettingsSchema.extend({
  deepL: z.object({
    host: z.string().url({
      message: 'DeepL host must be a valid URL',
    }),
    apiKey: z.string().min(1, {
      message: 'DeepL API key is required',
    }),
  }),
}).refine((data) => data.languages.includes(data.defaultLanguage), {
  message: 'Default language must be included in the languages array',
  path: ['defaultLanguage'],
});
