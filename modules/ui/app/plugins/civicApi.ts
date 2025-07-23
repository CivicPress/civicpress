export default defineNuxtPlugin((nuxtApp) => {
  // console.log('Creating civicApi with baseUrl', useRuntimeConfig().public);

  const civicApi = $fetch.create({
    baseURL: useRuntimeConfig().public.civicApiUrl,
    onRequest({ request, options, error }) {
      console.log('civicApi onRequest', request, options, error);
      // const userStore = useAppUser();
      // console.log('sszApi onRequest', userStore.value?.user?.tokens);
      // if (userStore.value?.user?.tokens?.ssz) {
      //   const headers = (options.headers ||= {});
      //   if (Array.isArray(headers)) {
      //     headers.push([
      //       'Authorization',
      //       `Bearer ${userStore.value.user.tokens.ssz}`,
      //     ]);
      //   } else if (headers instanceof Headers) {
      //     headers.set(
      //       'Authorization',
      //       `Bearer ${userStore.value.user.tokens.ssz}`
      //     );
      //   } else {
      //     headers.Authorization = `Bearer ${userStore.value.user.tokens.ssz}`;
      //   }
      // }
    },
    async onResponseError({ response }) {
      if (response.status === 401) {
        // console.log('Unauthorized, redirecting to login');
        // await nuxtApp.runWithContext(() => navigateTo("/login"));
      }
    },
  });

  // Expose to useNuxtApp().$api
  return {
    provide: {
      civicApi,
    },
  };
});
