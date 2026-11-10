# Treasury and room-art onboarding contract

This is a developer reference for **approved** additions to Kae's treasury, not authorization to create a gift, purchase it, or change Dawn's inventory. The existing room editor and quantity-tier visuals are shipped and must not be replaced.

## Existing boundaries

- `reward_requests` contains proposed gifts; `reward_shop` defines purchasable gifts; `kae_inventory` records ownership; `reward_ledger` records coin accounting. Only the authenticated `purchase_kae_reward` RPC may purchase a gift.
- The scene source catalog is `assets/room/scene-assets.json`; `npm run assets:build` generates `assets/scene-catalog.json`. **Never hand-edit the generated file.**
- The current catalog describes selectable scene assets, with `id`, `label`, allowed `slots`, `renderer`, optional `treasure`, `source` and `fit`. It is **not** a complete inventory-to-room renderer or a shop metadata catalog. In particular, the jewel catalog entry is a preview image; the owned jewel is rendered through existing room code.
- `scripts/build-scene-catalog.mjs` validates unique IDs, supported slots/renderers, local asset paths, file existence and basic SVG restrictions. It does **not** validate shop item existence or entitlement. A catalog entry must not be treated as evidence that a user owns an item.
- The existing individually adjustable room-object placement and visibility are authoritative. New art must preserve saved coordinates, visibility, ordering and the display-case glass layering. Do not revive the superseded fixed-shelf or chest/table coupling designs.

## Repeatable procedure for an approved gift

1. Confirm Dawn approved the specific gift, its name, price, repeatability and intended appearance. Check existing `reward_requests` and `reward_shop` for a matching item. A request is **not** a purchase.
2. Identify the existing `reward_shop.slug` and whether a matching room display already exists. Reuse existing art and mapping where possible. Do not assume that adding a scene-catalog row alone makes an owned treasure visible.
3. For an approved new art asset, add a local file under `assets/` and, if it belongs in the selectable scene editor, add its metadata to `assets/room/scene-assets.json`. Use the current allowed slot and renderer vocabulary. Do not introduce remote or executable asset URLs.
4. Run `npm run assets:build` and `npm test`; use `npm run test:browser` for any visible scene change. Review generated catalog diffs and test at phone and desktop dimensions. A catalog-only addition must not rewrite room layouts.
5. If a new owned-treasure renderer or quantity-tier mapping is necessary, implement and test that separately against actual ownership and current quantity boundaries. Do not infer ownership from the catalog, fabricate inventory, or change existing reward ledger rows.
6. Merge only after required checks pass and the implementation is reviewed. Confirm the merge and relevant deployment. Record real Android acceptance separately; CI or mocked browser tests are not proof of Dawn's phone experience.

## Explicitly unresolved design choices

See the active [Beehive roadmap](https://app.notion.com/p/40edfa4a1fd081f3a906dfff4c6ae223), especially BUILD-02 and BUILD-03, for whether new art may be deployed without Dawn's aesthetic review and what to show when a quantity-tier illustration is absent. Until resolved, nonvisual onboarding work may proceed, but do not silently change the appearance of existing treasures or invent a new fallback.

## Acceptance for a future generalized pipeline

A future onboarding improvement should make approved additions routine without duplicating bespoke room logic per collectible. It must preserve: owner-scoped shop and inventory records, explicit purchase authorization, ledger/history, quantity-tier display, saved independent placement and visibility, glass-case layering, and backward compatibility for existing treasures. Any migration affecting the installed Bee API or existing data needs a separate impact review.
