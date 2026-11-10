// https://qwik.dev/docs/project-structure/ (root.tsx from the `create-qwik empty` starter,
// trimmed to the benchmark's minimal head: no manifest, favicon, canonical or global CSS)
import { component$ } from "@builder.io/qwik";
import { QwikCityProvider, RouterOutlet } from "@builder.io/qwik-city";

export default component$(() => {
  return (
    <QwikCityProvider>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Items</title>
      </head>
      <body>
        <RouterOutlet />
      </body>
    </QwikCityProvider>
  );
});
