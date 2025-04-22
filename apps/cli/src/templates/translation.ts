interface TranslationProps {
    languages: Map<string, Map<string, string>>
}

interface TranslationFn {
  language: string;
  fnName: string;
  fnParams: string;
  fnParamsTypes: string;
  fnBody: string;
}

export const translationFile = ({ languages }: TranslationProps): Map<string, string> => {
  const baseTranslationFile = `import { getCurrentLanguage } from '../core';

`;

  const translationFiles = new Map<string, string>();
  const translationsFns = new Map<string, TranslationFn[]>();

  const outputFiles = new Map<string, string>();

  for (const [language, translations] of languages.entries()) {
    for (const [key, translation] of translations.entries()) {
      const translationInputs = translation.matchAll(/(\{\{\s*[^}]*\s*\}\})/g);
      let fnParams = '';
      let fnParamsTypes = '';

      for (const input of translationInputs) {
        fnParams += `${input[1].replace(/\{\{|\}\}/g, '').trim()}, `;
        fnParamsTypes += `${input[1].replace(/\{\{|\}\}/g, '').trim()}: string, `;
      }

      if (fnParams.endsWith(', ')) {
        fnParams = fnParams.slice(0, -2);
        fnParamsTypes = fnParamsTypes.slice(0, -2);
      }

      const translationFn: TranslationFn = {
        language,
        fnName: `${language.replace(/-/g, '_')}_${key}`,
        fnParams,
        fnParamsTypes,
        fnBody: `\`${translation.replace(/\{\{/g, '${').replace(/\}\}/g, '}').replace(/"/g, '\\"')}\``
      };

      const currentTranslationFns = translationsFns.get(key) ?? [];

      translationsFns.set(key, [...currentTranslationFns, translationFn]);

      let fileContent = translationFiles.get(key) ?? '';

      fileContent += ` * @${language} ${translation}
`;
     
      translationFiles.set(key, fileContent);
    }
  }

  for (const [key, fileContent] of translationFiles.entries()) {
    const translationFns = translationsFns.get(key) ?? [];

    const translationTypes = translationFns.reduce((acc, i) => {
      if (!i.fnParams) {
        return acc;
      }

      const params = i.fnParams.split(',');

      for (const param of params) {
        acc.add(param.trim());
      }

      return acc;
    }, new Set<string>());

    const translationTypesAsArray = Array.from(translationTypes);

    const translationFnsContent = translationFns.map(fn => `const ${fn.fnName} = (${fn.fnParams ? `{ ${fn.fnParams} } : { ${fn.fnParamsTypes} }` : ''}) => ${fn.fnBody}`).join('\n\n');

    let translationContent = `${baseTranslationFile}${translationFnsContent}\n\n`;

    if (!translationContent) {
      throw new Error(`Translation content for key ${key} is undefined`);
    }

    translationContent += `export const ${key} = (inputs: ${translationTypesAsArray.length > 0 ? `{ ${translationTypesAsArray.map(type => `${type}: string }`).join(', ')}` : '{} = {}'}, locale?: string) => {
  const _locale = locale ?? getCurrentLanguage();

  ${translationFns.map(fn => `if (_locale === '${fn.language}') return ${fn.fnName}(${fn.fnParams ? 'inputs' : ''});`).join('\n  ')}
  
  return '${key}';
};`;

    outputFiles.set(key, translationContent);
  }

  return outputFiles;
};