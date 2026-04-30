/** Minimal typings: `threads` package default export points at .mjs without types under some TS setups. */
declare module "threads" {
    export function registerSerializer(...args: unknown[]): void;
}

declare module "threads/worker" {
    export interface TransferDescriptor<T = unknown> {
        payload: T;
        transferables?: Transferable[];
    }
    export function Transfer<T>(payload: T, transferables?: Transferable[]): TransferDescriptor<T>;
    export function registerSerializer(...args: unknown[]): void;
    export function expose(exposed: unknown): void;
}
