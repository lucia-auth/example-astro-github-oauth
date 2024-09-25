import { github } from "@lib/server/oauth";
import { generateState } from "arctic";

import type { APIContext } from "astro";

export function GET(context: APIContext): Response {
	const state = generateState();
	const url = github.createAuthorizationURL(state, ["user:email"]);

	context.cookies.set("github_oauth_state", state, {
		httpOnly: true,
		maxAge: 60 * 10,
		secure: import.meta.env.PROD,
		path: "/",
		sameSite: "lax"
	});

	return context.redirect(url.toString());
}
