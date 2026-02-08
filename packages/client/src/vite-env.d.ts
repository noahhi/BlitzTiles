/// <reference types="vite/client" />

declare global {
  interface ImportMetaEnv {
    readonly BASE_URL: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  /** True in local dev and Vercel preview builds. Injected by vite.config.ts. */
  const __DEV_MODE__: boolean;
}

export {};
