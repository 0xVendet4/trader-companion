// All island views, keyed by name. Each lives in its own file:
//   header.ts · watchlist.ts · trending.ts · alerts.ts · positions.ts · wallets.ts ·
//   discipline.ts · event.ts (event card + greeting) · shared.ts

import { buildAlerts } from "./alerts";
import { buildDiscipline } from "./discipline";
import { buildEvent, buildGreeting } from "./event";
import { buildPositions } from "./positions";
import type { ViewActions, ViewHost } from "./shared";
import { buildTrending } from "./trending";
import { buildWallets } from "./wallets";
import { buildWardrobe } from "./wardrobe";
import { buildWatchlist } from "./watchlist";
import type { IslandViewName } from "../core/state";

export { buildHeader } from "./header";
export type { ViewActions, ViewHost } from "./shared";

export function buildViews(actions: ViewActions): Map<IslandViewName, ViewHost> {
  return new Map<IslandViewName, ViewHost>([
    ["watchlist", buildWatchlist(actions)],
    ["trending", buildTrending(actions)],
    ["alerts", buildAlerts(actions)],
    ["positions", buildPositions(actions)],
    ["wallets", buildWallets(actions)],
    ["discipline", buildDiscipline(actions)],
    ["wardrobe", buildWardrobe(actions)],
    ["event", buildEvent(actions)],
    ["greeting", buildGreeting()],
  ]);
}
