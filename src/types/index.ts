/**
 * Shared interfaces and type aliases: the shapes data takes as it moves between
 * modules. Types only, never runtime code, so any module can import from here
 * (with `import type`) without creating import cycles.
 *
 * Types used by a single module stay private to that module.
 */
export type * from './audio';
export type * from './characters';
export type * from './game';
export type * from './hud';
export type * from './net';
export type * from './progress';
export type * from './screens';
export type * from './sprites';
export type * from './waves';
