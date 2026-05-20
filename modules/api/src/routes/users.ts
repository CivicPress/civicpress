import express from 'express';
import { registerCrudRoutes } from './users/crud-handlers.js';
import { registerPasswordRoutes } from './users/password-handlers.js';
import { registerEmailRoutes } from './users/email-handlers.js';
import { registerSecurityRoutes } from './users/security-handlers.js';
import {
  registerRegistrationRoutes,
  registerAuthenticationRoutes,
  registerPublicEmailChangeRoutes,
  registerEmailVerificationRoutes,
} from './users/auxiliary-handlers.js';

// Main /api/users router (CRUD + password + email + security routes).
const router = express.Router();
registerCrudRoutes(router);
registerPasswordRoutes(router);
registerEmailRoutes(router);
registerSecurityRoutes(router);

// Sibling routers mounted at separate API paths in modules/api/src/index.ts.
const registrationRouter = express.Router();
registerRegistrationRoutes(registrationRouter);

const authenticationRouter = express.Router();
registerAuthenticationRoutes(authenticationRouter);

const publicRouter = express.Router();
registerPublicEmailChangeRoutes(publicRouter);

const emailVerificationRouter = express.Router();
registerEmailVerificationRoutes(emailVerificationRouter);

export {
  router,
  registrationRouter,
  authenticationRouter,
  publicRouter,
  emailVerificationRouter,
};
