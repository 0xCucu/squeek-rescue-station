# Genesis direct submission

## Project name
Squeek Rescue Station

## Live website
https://squeek.littlecao.shop/

## Build method
Built independently; direct submission. This project was not built through IMD and has no IMD job ID.

## Description
An original conveyor-routing rescue game powered by Squeektoshi's real wheel telemetry. Players rotate belts, guide runners to safety, and manage a battery and hand-crank heat during a 120-second shift. Fresh, active wheel telemetry determines power generation; idle or unavailable telemetry does not generate power. The server runs the game rules and calculates scores. No wallet, betting, token, or real-money transaction is required.

## Integration
The server shares one conditional polling loop for the official Squeekchain status API. It uses measurement freshness and core status, displays settled anchor height, and explicitly labels unavailable data. Gameplay remains available in practice mode when live telemetry is unavailable.

## Attribution requirements
Publish the project source to a public GitHub repository, then obtain the account-specific DNS record, page tag, and README line from Genesis. Install the exact issued values and use Verify in Genesis. No attribution values or approval claims are fabricated in this source.

## Publication boundary
Publish only package.json, game.mjs, server.mjs, public/, test/, README.md, SUBMISSION.md, and .gitignore. Do not publish deploy/, data/, runtime/, server backups, credentials, or certificates.
