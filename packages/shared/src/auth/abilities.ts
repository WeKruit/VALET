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
      can("manage", "JobLead");
      break;
    case "user":
      // Default signup role — waitlisted, no API permissions.
      // AuthGuard redirects to /early-access on the frontend;
      // CASL enforces the same boundary on the backend.
      break;
    case "beta":
      can("read", "Task");
      can("create", "Task");
      can("read", "Resume");
      can("manage", "Resume");
      can("read", "QaBank");
      can("read", "Dashboard");
      can("read", "JobLead");
      can("create", "JobLead");
      break;
    case "waitlist":
      // No permissions — redirected to /early-access
      break;
    default:
      // Unknown roles get no permissions
      break;
  }

  return build();
}
