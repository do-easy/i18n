declare module '@eslint/js' {
  import { Linter } from 'eslint';
  const configs: {
    recommended: Linter.Config;
    all: Linter.Config;
  };
  export default { configs };
}

declare module 'typescript-eslint' {
  import { Linter } from 'eslint';
  const configs: {
    recommended: Linter.Config[];
    strictTypeChecked: Linter.Config[];
    stylisticTypeChecked: Linter.Config[];
  };
  export { configs };
}

declare module 'eslint-config-prettier' {
  import { Linter } from 'eslint';
  const config: Linter.Config;
  export default config;
} 