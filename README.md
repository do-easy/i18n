# Do Easy i18n

A lightweight and type-safe internationalization (i18n) library for TypeScript projects.

## Features

- 🎯 Type-safe translations
- 🚀 Simple and intuitive API
- ⚡ Fast compilation
- 🔧 Easy configuration
- 🌐 Multiple language support
- 🤖 DeepL integration
- 🔔 Language change listeners

## Installation

```bash
# Using npm
npm install do-easy-i18n

# Using yarn
yarn add do-easy-i18n

# Using pnpm
pnpm add do-easy-i18n

# Using bun
bun add do-easy-i18n
```

## Quick Start

1. Initialize your project:

```bash
npx do-easy-i18n init
```

This will create:

- `do-easy-i18n.config.json` - Configuration file
- `messages/` directory - For your translation files

2. Configure your languages in `do-easy-i18n.config.json`:

```json
{
  "languages": ["en", "es", "fr"],
  "defaultLanguage": "en",
  "deepL": {
    "host": "https://api-free.deepl.com",
    "apiKey": "your-api-key"
  }
}
```

3. Add translations in `messages/en.json`:

```json
{
  "greeting": "Hello",
  "welcome": "Welcome, {name}!"
}
```

4. Compile your translations:

```bash
npx do-easy-i18n compile
```

5. Use in your code:

```typescript
import * as t from "do-easy-i18n"
import { setLanguage, onChangeLanguage, languageExists } from "do-easy-i18n"

// Set language (defaults to defaultLanguage from config)
setLanguage("es")

// Use translations
console.log(t.greeting()) // "Hola"
console.log(t.welcome({ name: "John" })) // "¡Bienvenido, John!"
console.log(t.dashboard.title()) // "Panel de control"
console.log(t.dashboard.welcome({ name: "John" })) // "¡Bienvenido de nuevo, John!"

// Check if a language exists
console.log(languageExists("fr")) // true
console.log(languageExists("xx")) // false

// Listen for language changes
const unsubscribe = onChangeLanguage("myListener", (language) => {
  console.log(`Language changed to: ${language}`)
})

// Clean up listener when no longer needed
unsubscribe()
```

## Configuration

The `do-easy-i18n.config.json` file supports the following options:

| Option          | Type     | Description                        |
| --------------- | -------- | ---------------------------------- |
| languages       | string[] | List of supported language codes   |
| defaultLanguage | string   | Fallback language code             |
| deepL           | object   | DeepL API configuration (optional) |
| deepL.host      | string   | DeepL API host                     |
| deepL.apiKey    | string   | DeepL API key                      |

## API Reference

### `setLanguage(lang: string)`

Sets the active language. Throws an error if the language doesn't exist.

### Translation Functions

Translation keys are available as functions on the imported `t` object. For example:

```typescript
import * as t from "do-easy-i18n"

// Simple translation
t.greeting() // "Hello"

// Translation with parameters
t.welcome({ name: "John" }) // "Welcome, John!"

// Nested translations
t.dashboard.title() // "Dashboard"
t.dashboard.welcome({ name: "John" }) // "Welcome back, John!"
```

### `getCurrentLanguage()`

Returns the currently active language code.

### `getLocale()`

Alias for `getCurrentLanguage()`.

### `languageExists(lang: string)`

Checks if a language exists in the supported languages list.

### `isLocale(lang: string)`

Alias for `languageExists()`.

### `onChangeLanguage(listenerName: string, callback: (language: string) => void)`

Adds a listener for language changes. Returns an unsubscribe function.

### `languages`

Constant array of supported language codes.

## CLI Commands

- `do-easy-i18n init` - Initialize a new project
- `do-easy-i18n compile` - Compile translation files
  - `-c, --config <path>` - Custom config path
  - `-o, --output <path>` - Custom output path
- `do-easy-i18n translate` - Translate missing messages using DeepL API
  - `-c, --config <path>` - Custom config path

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License
