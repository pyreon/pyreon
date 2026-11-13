---
'@pyreon/atlas': minor
'@pyreon/compiler': patch
---

Atlas: the Atlas v2 design parts that needed a data source (#4440).

- **Canvas → Layout**: `centered` (default), `padded` and `fullscreen`, carried in the link as `?layout=`.
- **Permissions** now renders the scenario as every role sees it, side by side, each under its own recording `can()`, with the keys that render consulted and a verdict against the role's policy (`presets.roles` or the shipped roles): an enabled action whose label starts with a known verb, rendered although that role's key for the verb was denied — or with no `can()` behind it while the policy withholds the verb — is flagged. Breaking (0.x): the single-role picker and the consulted-keys list it showed are replaced by the cards; a card's chip still renders the canvas as that role (`?role=`).
- **Schema** lists where every control came from (schema, rocketstyle dimension, prop type, content seed, `defineComponent`, or the catalog) and, under `atlas dev`, marks a prop that appeared on a rescan as new / "added N min ago". New optional fields: `PropControl.source` (`ControlSource`), `WorkbenchControl.source` and `WorkbenchControl.addedAt`. The panel now applies to every component with a control, not only one with a schema.
- **Reactive coverage** shows the recording's percentage as a bar.
- **Lens** prints a "Fix:" line under a footgun (the detector's own rewrite) and under a baked-once read.
- Every panel except Controls, Actions, A11y, Canvas and Addons now loads its body on first open, which takes the workbench's main bundle below its previous size.

Compiler: `analyzeReactivity` findings for a detector footgun carry the detector's suggested rewrite as `fix`.
