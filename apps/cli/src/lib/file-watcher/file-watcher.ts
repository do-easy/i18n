import pc from 'picocolors';
import chokidar, { type FSWatcher } from 'chokidar'

export interface FileWatcherOptions {
  onFileChange: () => void;
}

/**
 * Watches for changes in the specified files and directories
 * @param configFilePath Path to the configuration file to watch
 * @param messagesPath Path to the messages directory to watch
 * @param options Options for the watcher, including the change handler
 * @returns A function to stop watching
 */
export function watchFiles(
  configFilePath: string, 
  messagesPath: string, 
  options: FileWatcherOptions
): () => void {
  console.log(pc.blue('👀 Watching for changes...'));
  
  // Watchers array to keep track of all watchers for cleanup
  const watchers: FSWatcher[] = [];

  // Watch config file
  try {
    const configWatcher = chokidar.watch(configFilePath).on('change', (path) => {
      console.log(pc.blue(`🔄 Config file changed in ${path}`));
      options.onFileChange();
    });
    
    watchers.push(configWatcher);
  } catch (_error) {
    console.error(pc.red(`Error watching config file: ${configFilePath}`));
  }

  // Watch messages directory
  try {
    const messagesWatcher = chokidar.watch(messagesPath).on('change', (path ) => {
      console.log(pc.blue(`🔄 Messages file changed in ${path}`));
      options.onFileChange();
    });
    watchers.push(messagesWatcher);
  } catch (_error) {
    console.error(pc.red(`Error watching messages directory: ${messagesPath}`));
  }

  // Return a cleanup function
  return () => {
    console.log(pc.blue('\n👋 Stopping file watchers...'));
    watchers.forEach(watcher => {
      watcher.close();
    });
  };
} 