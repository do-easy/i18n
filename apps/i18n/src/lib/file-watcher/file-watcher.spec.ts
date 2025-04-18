import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { watchFiles } from './file-watcher';
import fs from 'fs';
import pc from 'picocolors';

// Mock dependencies
vi.mock('fs');
vi.mock('picocolors', () => ({
  default: {
    blue: vi.fn((text) => `BLUE: ${text}`),
    red: vi.fn((text) => `RED: ${text}`)
  }
}));

describe('file-watcher', () => {
  const mockConfigFilePath = '/path/to/config.json';
  const mockMessagesPath = '/path/to/messages';
  
  // Mock event emitter for fs.watch
  const mockWatcher = {
    close: vi.fn()
  };
  
  // Mock callback functions
  const mockOnChangeCallback = vi.fn();
  
  // Mock callbacks that will be used to simulate events
  let configChangeCallback: any;
  let messagesChangeCallback: any;
  
  beforeEach(() => {
    vi.resetAllMocks();
    
    // Setup console.log/error mocks
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Setup fs.watch mock to capture callbacks for different paths
    vi.mocked(fs.watch).mockImplementation((...args: any[]) => {
      // First argument is always the path
      const path = args[0];
      
      if (path === mockConfigFilePath) {
        // For config, options is optional and callback could be second arg
        configChangeCallback = typeof args[1] === 'function' ? args[1] : args[2];
      } else if (path === mockMessagesPath) {
        // For messages dir, third arg is the callback (after options)
        messagesChangeCallback = args[2]; 
      }
      
      return mockWatcher as unknown as fs.FSWatcher;
    });
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should set up watchers for config file and messages directory', () => {
    // Execute
    watchFiles(mockConfigFilePath, mockMessagesPath, { onFileChange: mockOnChangeCallback });
    
    // Verify
    expect(fs.watch).toHaveBeenCalledTimes(2);
    expect(fs.watch).toHaveBeenCalledWith(mockConfigFilePath, expect.any(Function));
    expect(fs.watch).toHaveBeenCalledWith(mockMessagesPath, { recursive: true }, expect.any(Function));
    
    // Verify console logging
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Watching for changes'));
  });

  it('should trigger callback when config file changes', () => {
    // Execute
    watchFiles(mockConfigFilePath, mockMessagesPath, { onFileChange: mockOnChangeCallback });
    
    // Simulate file change event
    configChangeCallback('change');
    
    // Verify
    expect(mockOnChangeCallback).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Config file changed'));
  });

  it('should trigger callback when json file in messages directory changes', () => {
    // Execute
    watchFiles(mockConfigFilePath, mockMessagesPath, { onFileChange: mockOnChangeCallback });
    
    // Simulate file change event
    messagesChangeCallback('change', 'en.json');
    
    // Verify
    expect(mockOnChangeCallback).toHaveBeenCalledTimes(1);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Changes detected in en.json'));
  });

  it('should not trigger callback when non-json file in messages directory changes', () => {
    // Execute
    watchFiles(mockConfigFilePath, mockMessagesPath, { onFileChange: mockOnChangeCallback });
    
    // Simulate file change event for non-json file
    messagesChangeCallback('change', 'readme.md');
    
    // Verify
    expect(mockOnChangeCallback).not.toHaveBeenCalled();
  });

  it('should handle errors when setting up config file watcher', () => {
    // Setup for first call to throw error
    vi.mocked(fs.watch).mockImplementationOnce(() => {
      throw new Error('Failed to watch config file');
    });
    
    // Execute
    watchFiles(mockConfigFilePath, mockMessagesPath, { onFileChange: mockOnChangeCallback });
    
    // Verify
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error watching config file'));
    
    // Should still try to set up messages watcher
    expect(fs.watch).toHaveBeenCalledTimes(2);
  });

  it('should handle errors when setting up messages directory watcher', () => {
    // Setup
    vi.mocked(fs.watch)
      .mockImplementationOnce(() => mockWatcher as unknown as fs.FSWatcher) // First call succeeds
      .mockImplementationOnce(() => {
        throw new Error('Failed to watch messages directory');
      });
    
    // Execute
    watchFiles(mockConfigFilePath, mockMessagesPath, { onFileChange: mockOnChangeCallback });
    
    // Verify
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error watching messages directory'));
  });

  it('should return a function that closes all watchers', () => {
    // Execute
    const stopWatching = watchFiles(mockConfigFilePath, mockMessagesPath, { onFileChange: mockOnChangeCallback });
    
    // Call the returned function
    stopWatching();
    
    // Verify
    expect(mockWatcher.close).toHaveBeenCalledTimes(2);
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Stopping file watchers'));
  });
}); 