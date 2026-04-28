// Vite-specific ?url import suffix
declare module '*.wasm?url' {
  const url: string;
  export default url;
}

// SharedWorkerGlobalScope is not in all TypeScript lib configurations
interface SharedWorkerGlobalScope {
  addEventListener(
    type: 'connect',
    listener: (ev: MessageEvent) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
}
