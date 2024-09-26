import { github } from "@lib/server/oauth";
import { ObjectParser } from "@pilcrowjs/object-parser";
import { createUser, getUserFromGitHubId } from "@lib/server/user";
import { createSession, generateSessionToken, setSessionTokenCookie } from "@lib/server/session";

import type { OAuth2Tokens } from "arctic";
import type { APIContext } from "astro";

export async function GET(context: APIContext): Promise<Response> {
	const storedState = context.cookies.get("github_oauth_state")?.value ?? null;
	const code = context.url.searchParams.get("code");
	const state = context.url.searchParams.get("state");

	if (storedState === null || code === null || state === null) {
		return new Response("Please restart the process.", {
			status: 400
		});
	}
	if (storedState !== state) {
		return new Response("Please restart the process.", {
			status: 400
		});
	}

	let tokens: OAuth2Tokens;
	try {
		tokens = await github.validateAuthorizationCode(code);
	} catch (e) {
		return new Response("Please restart the process.", {
			status: 400
		});
	}

	const githubAccessToken = tokens.accessToken();

	const userRequest = new Request("https://api.github.com/user");
	userRequest.headers.set("Authorization", `Bearer ${githubAccessToken}`);
	const userResponse = await fetch(userRequest);
	const userResult: unknown = await userResponse.json();
	const userParser = new ObjectParser(userResult);

	const githubUserId = userParser.getNumber("id");
	const username = userParser.getString("login");

	const existingUser = getUserFromGitHubId(githubUserId);
	if (existingUser !== null) {
		const sessionToken = generateSessionToken();
		const session = createSession(sessionToken, existingUser.id);
		setSessionTokenCookie(context, sessionToken, session.expiresAt);
		return context.redirect("/login");
	}

	const emailListRequest = new Request("https://api.github.com/user/emails");
	emailListRequest.headers.set("Authorization", `Bearer ${githubAccessToken}`);
	const emailListResponse = await fetch(emailListRequest);
	const emailListResult: unknown = await emailListResponse.json();
	if (!Array.isArray(emailListResult) || emailListResult.length < 1) {
		return new Response("Please restart the process.", {
			status: 400
		});
	}
	let email: string | null = null;
	for (const emailRecord of emailListResult) {
		const emailParser = new ObjectParser(emailRecord);
		const primaryEmail = emailParser.getBoolean("primary");
		const verifiedEmail = emailParser.getBoolean("verified");
		if (primaryEmail && verifiedEmail) {
			email = emailParser.getString("email");
		}
	}
	if (email === null) {
		return new Response("Please verify your GitHub email address.", {
			status: 400
		});
	}

	const user = createUser(githubUserId, email, username);
	const sessionToken = generateSessionToken();
	const session = createSession(sessionToken, user.id);
	setSessionTokenCookie(context, sessionToken, session.expiresAt);
	return context.redirect("/login");
}
