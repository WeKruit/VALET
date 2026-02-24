import { AbilityBuilder, PureAbility } from "@casl/ability";
import type { Actions, Subjects } from "./actions.js";

export type AppAbility = PureAbility<[Actions, Subjects]>;

export function defineAbilitiesFor(role: string): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(PureAbility);

  switch (role) {
    case "superadmin":
      can("manage", "all");
      break;
    case "admin":
      can("manage", "all");
      break;
    case "developer":
      can("manage", "Task");
      can("manage", "Resume");
      can("manage", "QaBank");
      can("manage", "Dashboard");
      can("manage", "Settings");
      break;
    case "user":
      // No permissions — waitlisted
      break;
    default:
      // Unknown roles get no permissions
      break;
  }

  return build();
}
