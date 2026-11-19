const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

const PRIVATE_IPV4 =
  /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;

const URL_PARTS = /^(?<protocol>[a-z][a-z0-9+.-]*:)\/\/(?<host>\[[^\]]+\]|[^/:?#]+)(?::(?<port>\d+))?/i;

export interface DevApiUrlContext {
  platform: string;
  /** Metro's host, e.g. `192.168.1.13:8081` from `Constants.expoConfig.hostUri`. */
  metroHost?: string | null;
}

/**
 * A physical device resolves `127.0.0.1` to itself, so a loopback API URL only
 * works on web and in simulators. When Metro is served over the LAN, the dev
 * machine is the host the device already talks to — reuse it.
 *
 * Tunnel hosts (`*.exp.direct`) and emulator loopback stay untouched: neither can
 * proxy the API port, and rewriting would only produce a more confusing failure.
 */
export function resolveDevApiUrl(rawUrl: string, { platform, metroHost }: DevApiUrlContext): string {
  if (platform === 'web' || !metroHost) {
    return rawUrl;
  }

  const parts = URL_PARTS.exec(rawUrl);
  if (!parts?.groups) {
    return rawUrl;
  }

  const { protocol, host, port } = parts.groups;
  if (!LOOPBACK_HOSTS.has(host.toLowerCase())) {
    return rawUrl;
  }

  const lanHost = metroHost.split(':')[0]?.trim().toLowerCase();
  if (!lanHost || LOOPBACK_HOSTS.has(lanHost)) {
    return rawUrl;
  }
  if (!PRIVATE_IPV4.test(lanHost) && !lanHost.endsWith('.local')) {
    return rawUrl;
  }

  return `${protocol}//${lanHost}${port ? `:${port}` : ''}`;
}
