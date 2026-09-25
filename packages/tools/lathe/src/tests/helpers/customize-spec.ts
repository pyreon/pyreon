/**
 * A small multi-tag spec for the customization suites (plugins, filters,
 * patches, per-operation settings, naming, format). Three tags, a shared
 * model, a model only one tag uses, a paged list, a mutation, and an untagged
 * operation — enough for every selector and every rename to have something to
 * miss.
 */
export const CUSTOMIZE_SPEC = JSON.stringify({
  openapi: '3.1.0',
  info: { title: 'Shop', version: '1.0.0' },
  servers: [{ url: 'https://api.shop.test' }],
  paths: {
    '/pets': {
      get: {
        operationId: 'list-pets',
        tags: ['pets'],
        parameters: [{ name: 'cursor', in: 'query', schema: { type: 'string' } }],
        responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/PetPage' } } } } },
      },
      post: {
        operationId: 'createPet',
        tags: ['pets', 'admin'],
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } },
        responses: { 201: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } },
      },
    },
    '/pets/{petId}': {
      get: {
        operationId: 'getPetById',
        tags: ['pets'],
        parameters: [{ name: 'petId', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { content: { 'application/json': { schema: { $ref: '#/components/schemas/Pet' } } } } },
      },
    },
    '/store/orders': {
      get: {
        operationId: 'listOrders',
        tags: ['store'],
        responses: { 200: { content: { 'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Order' } } } } } },
      },
    },
    '/users/{id}': {
      delete: {
        operationId: 'deleteUser',
        tags: ['users'],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 204: { description: 'gone' } },
      },
    },
    '/health': {
      get: {
        responses: { 200: { content: { 'application/json': { schema: { type: 'object', properties: { ok: { type: 'boolean' } } } } } } },
      },
    },
  },
  components: {
    schemas: {
      Pet: {
        type: 'object',
        required: ['id', 'name'],
        properties: { id: { type: 'string' }, name: { type: 'string' } },
      },
      PetPage: {
        type: 'object',
        required: ['data'],
        properties: {
          data: { type: 'array', items: { $ref: '#/components/schemas/Pet' } },
          next: { type: 'string' },
        },
      },
      Order: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' }, pet: { $ref: '#/components/schemas/Pet' } },
      },
      Unused: { type: 'object', properties: { x: { type: 'integer', format: 'int64' } } },
    },
  },
})
