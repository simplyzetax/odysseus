import { Bindings } from '@otypes/bindings';
import { env } from 'cloudflare:workers';

export const ENV = env as unknown as Bindings;

export const isDev = ENV.ENV === 'development';
