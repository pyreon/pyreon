# Real-spec corpus (excerpts)

Test fixtures for `src/tests/corpus.test.ts`. The `*.excerpt.json` files are
EXCERPTS of published OpenAPI documents -- selected schemas, operations and
examples plus their `$ref` closure -- cut with `scripts/corpus-excerpt.ts`
(the exact command for each is below). The small public examples are vendored
whole. The full-size specs are exercised on demand with `bun run corpus <dir>`.

| File | Source | License |
| --- | --- | --- |
| `github-3.0.excerpt.json`, `github-3.1.excerpt.json` | github/rest-api-description (`api.github.com`) | MIT |
| `openai.excerpt.json` | openai/openai-openapi | MIT |
| `stripe.excerpt.json` | stripe/openapi (`spec3`) | MIT |
| `digitalocean.excerpt.json` | digitalocean/openapi | Apache-2.0 |
| `twilio.excerpt.json` | twilio/twilio-oai (`twilio_api_v2010`) | Apache-2.0 |
| `box.excerpt.json` | box/box-openapi | Apache-2.0 |
| `k8s-swagger2.excerpt.json` | kubernetes/kubernetes (`api/openapi-spec/swagger.json`, Swagger 2.0) | Apache-2.0 |
| `swagger2-petstore.json` | swagger-api/swagger-petstore (v2, Swagger 2.0) | Apache-2.0 |
| `petstore3.json`, `petstore3.yaml`, `petstore-expanded.yaml`, `webhook-3.1.yaml`, `nonoauth-3.1.yaml` | swagger-api/swagger-petstore, OAI/OpenAPI-Specification examples | Apache-2.0 |

Regenerating (from the full specs):

```sh
bun scripts/corpus-excerpt.ts github.json github-3.0.excerpt.json --example base-gist --example team-full --example installation --example minimal-repository --example simple-user
bun scripts/corpus-excerpt.ts github-3.1.json github-3.1.excerpt.json --example base-gist --example team-full --example pull-request-simple --example minimal-repository --example simple-user
bun scripts/corpus-excerpt.ts openai.json openai.excerpt.json --schema Annotation --schema Tool --schema Item --path /files --success-only
bun scripts/corpus-excerpt.ts digitalocean.json digitalocean.excerpt.json --schema app_domain_spec --path '/v2/droplets/{droplet_id}/destroy_with_associated_resources/dangerous' --success-only
bun scripts/corpus-excerpt.ts stripe.json stripe.excerpt.json --path /v1/apple_pay/domains --success-only
bun scripts/corpus-excerpt.ts twilio.json twilio.excerpt.json --path '/2010-04-01/Accounts/{AccountSid}/Keys.json' --success-only
bun scripts/corpus-excerpt.ts k8s-swagger2.json k8s-swagger2.excerpt.json --path '/api/v1/namespaces/{namespace}/configmaps' --path '/api/v1/namespaces/{namespace}/configmaps/{name}'
bun scripts/corpus-excerpt.ts box.json box.excerpt.json --path '/files/{file_id}/content' --success-only
```
