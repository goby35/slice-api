import * as hono_types from 'hono/types';
import { Hono } from 'hono';

declare const app: Hono<hono_types.BlankEnv, hono_types.BlankSchema, "/">;

export { app as default };
