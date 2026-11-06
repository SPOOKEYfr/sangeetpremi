/**
 * Secret-provider interfaces. Phase B ships NO real secrets: the null provider
 * is the default and throws if any code tries to read a secret, making an
 * accidental credential dependency a loud failure instead of a silent one.
 * Phase C will wire EnvSecretProvider to server-side environment variables.
 */
export interface SecretProvider {
  /** Returns the secret value, or undefined if not configured. Never throws for missing values. */
  get(name: string): string | undefined;
  /** True when the named secret is configured (value itself is never exposed). */
  has(name: string): boolean;
}

export class EnvSecretProvider implements SecretProvider {
  constructor(private env: NodeJS.ProcessEnv = process.env) {}
  get(name: string): string | undefined {
    const v = this.env[name];
    return v && v.length > 0 ? v : undefined;
  }
  has(name: string): boolean {
    return this.get(name) !== undefined;
  }
}

/** Default in Phase B: no secrets exist, so any access is a bug. */
export class NullSecretProvider implements SecretProvider {
  get(name: string): string | undefined {
    throw new Error(`Secret "${name}" requested but no secret provider is configured (Phase B has no real secrets).`);
  }
  has(_name: string): boolean {
    return false;
  }
}
