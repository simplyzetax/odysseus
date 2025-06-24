import { DmnoWranglerEnvSchema } from '@dmno/cloudflare-platform';
import { DmnoBaseTypes, defineDmnoService, pickFromSchemaObject, switchBy } from 'dmno';


export default defineDmnoService({
  schema: {
    ...pickFromSchemaObject(DmnoWranglerEnvSchema, {
      WRANGLER_DEV_URL: {},
      WRANGLER_DEV_ACTIVE: {}, // true when running `dwrangler dev` or `dwrangler pages dev`
    }),
    DATABASE_URL: DmnoBaseTypes.string,
    BASE_URL: {
      value: switchBy('WRANGLER_DEV_ACTIVE', { // use info from wrangler to affect other config
        _default: 'http://localhost:8787',
        false: 'https://odysseus.fortnite.ac',
      }),
    },
  },
});