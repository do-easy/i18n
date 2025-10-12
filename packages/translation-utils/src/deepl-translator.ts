import { DeepLConfig } from '@do-easy-i18n/config';

interface DeepLTranslation {
  detected_source_language: string;
  text: string;
}

interface DeepLResponse {
  translations: DeepLTranslation[];
}

/**
 * Translates text using the DeepL API
 * @param text Text to translate
 * @param targetLang Target language code
 * @param config DeepL configuration
 * @param sourceLang Optional source language code
 * @returns Translated text
 */
export async function translateText(
  text: string, 
  targetLang: string, 
  config: DeepLConfig, 
  sourceLang?: string
): Promise<string> {
  // Check if API key is available
  if (!config.apiKey) {
    throw new Error('DeepL API key is required. Please provide it in the configuration file or set the D18N_DEEPL_API_KEY environment variable.');
  }

  const requestBody: Record<string, unknown> = {
    text: [text],
    target_lang: targetLang.toUpperCase(),
  };
  
  if (sourceLang) {
    requestBody.source_lang = sourceLang.toUpperCase().split('-')[0];
  }

  const response = await fetch(`${config.host}/v2/translate`, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`DeepL API error: ${response.statusText}`);
  }

  const data = await response.json() as DeepLResponse;
  return data.translations[0].text;
}

/**
 * Batch translates multiple texts using the DeepL API
 * @param texts Array of texts to translate
 * @param targetLang Target language code
 * @param config DeepL configuration
 * @param sourceLang Optional source language code
 * @returns Array of translated texts
 */
export async function batchTranslate(
  texts: string[], 
  targetLang: string, 
  config: DeepLConfig, 
  sourceLang?: string
): Promise<string[]> {
  if (texts.length === 0) {
    return [];
  }
  
  // Check if API key is available
  if (!config.apiKey) {
    throw new Error('DeepL API key is required. Please provide it in the configuration file or set the D18N_DEEPL_API_KEY environment variable.');
  }
  
  const requestBody: Record<string, unknown> = {
    text: texts,
    target_lang: targetLang.toUpperCase(),
  };
  
  if (sourceLang) {
    requestBody.source_lang = sourceLang.toUpperCase();
  }

  const response = await fetch(`${config.host}/v2/translate`, {
    method: 'POST',
    headers: {
      'Authorization': `DeepL-Auth-Key ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`DeepL API error: ${response.statusText}`);
  }

  const data = await response.json() as DeepLResponse;
  return data.translations.map(translation => translation.text);
} 