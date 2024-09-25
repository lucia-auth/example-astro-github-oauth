/// <reference path="../.astro/types.d.ts" />

declare namespace App {
	interface Locals {
		user: import("./lib/server/user").User | null;
		session: import("./lib/server/session").Session | null;
	}
}
