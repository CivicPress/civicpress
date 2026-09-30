import { computed, ref } from 'vue';

/**
 * What the instance offers on its sign-in surface: which OAuth providers are
 * configured, and whether self-registration is open
 * (`auth.registration.enabled`). Read from `GET /api/v1/auth/providers`, which
 * needs no authentication.
 *
 * Registration is assumed OPEN until the answer arrives, so a slow or failed
 * lookup never hides a door that exists; a closed instance still answers 403
 * on the register call itself.
 *
 * Module-level state on purpose (the UI is an SPA): one fetch per page load,
 * shared by the login and register pages, and no reliance on Nuxt auto-imports
 * beyond `$civicApi` — which keeps it usable from the component test harness.
 */
export interface AuthOptions {
  providers: string[];
  registrationEnabled: boolean;
}

const options = ref<AuthOptions>({ providers: [], registrationEnabled: true });
let loaded = false;

export function useAuthOptions() {
  async function load(): Promise<AuthOptions> {
    if (loaded) return options.value;
    try {
      const response = (await useNuxtApp().$civicApi(
        '/api/v1/auth/providers'
      )) as {
        success?: boolean;
        data?: { providers?: string[]; registration?: { enabled?: boolean } };
      };
      if (response?.success && response.data) {
        options.value = {
          providers: response.data.providers ?? [],
          registrationEnabled: response.data.registration?.enabled !== false,
        };
      }
      loaded = true;
    } catch {
      // Leave the open-by-default answer in place; the API is the authority
      // and refuses a registration it does not accept.
    }
    return options.value;
  }

  return {
    options,
    registrationEnabled: computed(() => options.value.registrationEnabled),
    load,
  };
}
