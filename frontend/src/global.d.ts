/**
 * Global TypeScript Declarations
 * Provides type definitions for CSS module imports and plain CSS
 */

declare module '*.module.css' {
  const content: Record<string, string>;
  export default content;
}

declare module '*.css' {
  // Plain CSS module - allows side-effect imports like: import './index.css'
}