import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { compileFiles } from './compiler';
import fs from 'fs';
import path from 'path';
import { processLanguage } from '../../utils/process-language';
import { translationFile } from '../../templates/translation';
import { mainFile } from '../../templates/main';
import type { ConfigResult } from '../config/config-loader';

// Mock dependencies
vi.mock('fs');
vi.mock('path');
vi.mock('../../utils/process-language');
vi.mock('../../templates/translation');
vi.mock('../../templates/main');

describe('compiler', () => {
  // Mock data
  const mockOutputPath = '/output/path';
  const mockMessagesOutputPath = '/output/path/messages';
  const mockDefaultLanguage = 'en';
  const mockLanguages = ['es', 'fr'];
  const mockMessagesPath = '/path/to/messages';
  
  const mockValidConfig: ConfigResult = {
    defaultLanguage: mockDefaultLanguage,
    languages: mockLanguages,
    messagesPath: mockMessagesPath,
    configFilePath: '/path/to/config.json',
    isValid: true
  };
  
  const mockInvalidConfig: ConfigResult = {
    defaultLanguage: '',
    languages: [],
    messagesPath: '',
    configFilePath: '',
    isValid: false,
    errors: ['Config is invalid']
  };

  beforeEach(() => {
    vi.resetAllMocks();
    
    // Setup path.join mock
    vi.mocked(path.join).mockImplementation((...args) => {
      if (args.includes('messages')) {
        return mockMessagesOutputPath;
      }
      return args.join('/');
    });
    
    // Setup default mock implementations
    vi.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    vi.mocked(fs.writeFileSync).mockImplementation(() => undefined);
    
    // Mock the Maps returned by processLanguage
    const mockEnMap = new Map<string, string>();
    mockEnMap.set('hello', 'Hello');
    mockEnMap.set('goodbye', 'Goodbye');
    
    const mockEsMap = new Map<string, string>();
    mockEsMap.set('hello', 'Hola');
    // 'goodbye' is missing in ES
    
    const mockFrMap = new Map<string, string>();
    mockFrMap.set('hello', 'Bonjour');
    mockFrMap.set('goodbye', 'Au revoir');
    mockFrMap.set('thank_you', 'Merci'); // Extra key in FR
    
    vi.mocked(processLanguage).mockImplementation((lang) => {
      if (lang === 'en') return mockEnMap;
      if (lang === 'es') return mockEsMap;
      if (lang === 'fr') return mockFrMap;
      return new Map();
    });
    
    // Mock translationFile output
    const mockTranslationsFiles = new Map<string, string>();
    mockTranslationsFiles.set('en', 'English content');
    mockTranslationsFiles.set('es', 'Spanish content');
    mockTranslationsFiles.set('fr', 'French content');
    vi.mocked(translationFile).mockReturnValue(mockTranslationsFiles);
    
    // Mock mainFile output
    vi.mocked(mainFile).mockReturnValue('Main file content');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should return error result when config is invalid', () => {
    // Execute
    const result = compileFiles(mockInvalidConfig, mockOutputPath);

    // Verify
    expect(result.success).toBe(false);
    expect(result.message).toBe('Config file is invalid');
    expect(result.timestamp).toBeDefined();
    
    // Verify no file operations occurred
    expect(fs.mkdirSync).not.toHaveBeenCalled();
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it('should process all languages and compile files when config is valid', () => {
    // Execute
    const result = compileFiles(mockValidConfig, mockOutputPath);

    // Verify
    expect(result.success).toBe(true);
    expect(result.message).toBe('Compilation completed successfully');
    expect(result.timestamp).toBeDefined();
    
    // Verify directories created
    expect(fs.mkdirSync).toHaveBeenCalledWith(mockOutputPath, { recursive: true });
    expect(fs.mkdirSync).toHaveBeenCalledWith(mockMessagesOutputPath, { recursive: true });
    
    // Verify processLanguage was called for each language
    expect(processLanguage).toHaveBeenCalledWith(mockDefaultLanguage, mockMessagesPath);
    mockLanguages.forEach(lang => {
      expect(processLanguage).toHaveBeenCalledWith(lang, mockMessagesPath);
    });
    
    // Verify translationFile was called with the correct data
    expect(translationFile).toHaveBeenCalled();
    
    // Verify mainFile was called with the correct data
    expect(mainFile).toHaveBeenCalledWith(mockDefaultLanguage, [mockDefaultLanguage, ...mockLanguages]);
    
    // Use `toHaveBeenCalledTimes` to verify the number of calls without checking the exact parameters
    expect(fs.writeFileSync).toHaveBeenCalledTimes(5);
    
    // Check that the correct types of files were written without being too specific about paths
    const writeFileCalls = vi.mocked(fs.writeFileSync).mock.calls;
    
    // There should be one call for core.ts
    expect(writeFileCalls.some(call => 
      call[0].toString().includes('core.ts') && call[1] === 'Main file content'
    )).toBe(true);
    
    // There should be one call for index.ts
    expect(writeFileCalls.some(call => 
      call[0].toString().includes('index.ts') && typeof call[1] === 'string'
    )).toBe(true);
    
    // There should be one call for each language
    expect(writeFileCalls.filter(call => 
      call[1] === 'English content' || 
      call[1] === 'Spanish content' || 
      call[1] === 'French content'
    ).length).toBe(3);
  });

  it('should handle missing translations in languages', () => {
    // Execute
    const result = compileFiles(mockValidConfig, mockOutputPath);

    // Verify
    expect(result.success).toBe(true);
    
    // Get the arg passed to translationFile
    const translationFileArg = vi.mocked(translationFile).mock.calls[0][0];
    const languagesMap = translationFileArg.languages;
    
    // Check that missing translations were filled in
    const esTranslations = languagesMap.get('es');
    expect(esTranslations?.get('goodbye')).toBe('<missing es translation>');
    
    // Check that extra translations in languages were added to main language
    const enTranslations = languagesMap.get('en');
    expect(enTranslations?.get('thank_you')).toBe('<missing en translation>');
  });

  it('should handle and return errors during compilation', () => {
    // Setup
    const mockError = new Error('Failed to create directory');
    vi.mocked(fs.mkdirSync).mockImplementation(() => {
      throw mockError;
    });
    
    // Execute
    const result = compileFiles(mockValidConfig, mockOutputPath);

    // Verify
    expect(result.success).toBe(false);
    expect(result.message).toBe('Failed to create directory');
    expect(result.timestamp).toBeDefined();
  });
}); 