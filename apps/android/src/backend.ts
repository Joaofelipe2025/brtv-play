import { FreeTvBackendService, MockBackendService } from '@brtv/core';
import { asyncAdapter } from './platform';

/** Catálogo público de testes; o status de ativação continua vindo do backend existente. */
export const backend = new FreeTvBackendService(new MockBackendService(), asyncAdapter);
