/** Every failure this package reports, so callers can tell it from a DOMException. */
export class PluginManagerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginManagerError";
  }
}
