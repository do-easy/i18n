import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadConfig } from './config-loader';
import fs from 'fs';
import path from 'path';
import { ZodError } from 'zod';
import { settingsSchema } from '../../schema/settings';

// Mock dependencies
vi.mock('fs');
vi.mock('path');
vi.mock('../../schema/settings');

describe('config-loader', () => {
  const mockConfigPath = '/path/to/config.json';
  const mockDirname = '/path/to';
  const mockConfigFilePath = '/path/to/do-easy-i18n.config.json';
  const mockMessagesPath = '/path/to/messages';

  beforeEach(() => {
    // Reset mocks
    vi.resetAllMocks();

    // Setup path.dirname mock
    vi.mocked(path.dirname).mockReturnValue(mockDirname);
    // Setup path.join mock to return predictable paths
    vi.mocked(path.join).mockImplementation((...args) => {
      if (args.includes('messages')) {
        return mockMessagesPath;
      }
      return mockConfigFilePath;
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should return error result when config file does not exist', () => {
    // Setup
    vi.mocked(fs.existsSync).mockReturnValue(false);

    // Execute
    const result = loadConfig(mockConfigPath);

    // Verify
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('do-easy-i18n.config.json does not exist');
    expect(result.configFilePath).toBe(mockConfigFilePath);
    expect(result.messagesPath).toBe(mockMessagesPath);
  });

  it('should return valid result when config is valid', () => {
    // Setup
    const mockDefaultLanguage = 'en';
    const mockLanguages = ['en', 'es', 'fr'];
    const mockConfig = {
      defaultLanguage: mockDefaultLanguage,
      languages: mockLanguages
    };
    
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(mockConfig));
    vi.mocked(settingsSchema.parse).mockReturnValue(mockConfig);

    // Execute
    const result = loadConfig(mockConfigPath);

    // Verify
    expect(result.isValid).toBe(true);
    expect(result.defaultLanguage).toBe(mockDefaultLanguage);
    expect(result.languages).toEqual(['es', 'fr']); // defaultLanguage is filtered out
    expect(result.messagesPath).toBe(mockMessagesPath);
    expect(result.configFilePath).toBe(mockConfigFilePath);
  });

  it('should handle ZodError and return invalid result', () => {
    // Setup
    const mockZodError = new ZodError([
      {
        code: 'invalid_type',
        expected: 'string',
        received: 'undefined',
        path: ['defaultLanguage'],
        message: 'Required'
      }
    ]);
    
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('{}');
    vi.mocked(settingsSchema.parse).mockImplementation(() => {
      throw mockZodError;
    });

    // Execute
    const result = loadConfig(mockConfigPath);

    // Verify
    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors?.[0]).toContain('defaultLanguage');
  });

  it('should handle generic errors', () => {
    // Setup
    const mockError = new Error('Failed to read file');
    
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw mockError;
    });

    // Execute
    const result = loadConfig(mockConfigPath);

    // Verify
    expect(result.isValid).toBe(false);
    expect(result.errors).toContain('Failed to read file');
  });
}); 