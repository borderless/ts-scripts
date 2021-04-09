export interface Test {
  name: string | undefined;
  dir: string[] | undefined;
  env: string;
  project: string;
}

/**
 * Configuration object.
 */
export interface Config {
  react: boolean;
  dir: string;
  src: string[];
  dist: string[];
  project: string[];
  test: Test[];
}

/** Prettier supported glob files. */
export const prettierGlob = "*.{js,jsx,ts,tsx,json,css,md,yml,yaml}";

/** ESLint supported glob files. */
export const eslintGlob = "*.{js,jsx,ts,tsx}";
