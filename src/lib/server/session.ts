import { db } from "./db";

import type { User } from "./user";
import type { APIContext } from "astro";

export const inactivityTimeoutSeconds = 60 * 60 * 24 * 10; // 10 days
const activityCheckIntervalSeconds = 60 * 60; // 1 hour

export async function validateSessionToken(token: string): Promise<Session | null> {
	const now = new Date();
	const tokenParts = token.split(".");
	if (tokenParts.length !== 2) {
		return null;
	}
	const sessionId = tokenParts[0];
	const sessionSecret = tokenParts[1];

	const session = getSession(sessionId);

	if (!session) {
		return null;
	}

	const tokenSecretHash = await hashSecret(sessionSecret);
	const validSecret = constantTimeEqual(tokenSecretHash, session.secretHash);
	if (!validSecret) {
		return null;
	}

	if (now.getTime() - session.lastVerifiedAt.getTime() >= activityCheckIntervalSeconds * 1000) {
		session.lastVerifiedAt = now;
		db.execute("UPDATE session SET last_verified_at = ? WHERE id = ?", [
			Math.floor(session.lastVerifiedAt.getTime() / 1000),
			sessionId
		]);
	}

	return session;
}

function getSession(sessionId: string): Session | null {
	const now = new Date();

	const row = db.queryOne("SELECT id, user_id, secret_hash, created_at, last_verified_at FROM session WHERE id = ?", [
		sessionId
	]);

	if (!row) {
		return null;
	}

	const session: Session = {
		id: row.string(0),
		userId: row.number(1),
		secretHash: row.bytes(2),
		createdAt: new Date(row.number(3) * 1000),
		lastVerifiedAt: new Date(row.number(4) * 1000)
	};

	// Check expiration
	if (now.getTime() - session.createdAt.getTime() >= inactivityTimeoutSeconds * 1000) {
		invalidateSession(session.id);
		return null;
	}

	return session;
}

function getUser(userId: number): User | null {
	const row = db.queryOne("SELECT id, github_id, username, email FROM user WHERE id = ?", [userId]);
	if (!row) {
		return null;
	}
	return {
		id: row.number(0),
		githubId: row.number(1),
		username: row.string(2),
		email: row.string(3)
	};
}

export async function getSessionWithUser(
	token: string
): Promise<{ session: Session; user: User } | { session: null; user: null }> {
	const session = await validateSessionToken(token);
	if (!session) {
		return { session: null, user: null };
	}

	const user = getUser(session.userId);
	if (!user) {
		return { session: null, user: null };
	}

	return {
		session,
		user
	};
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
	if (a.byteLength !== b.byteLength) {
		return false;
	}
	let c = 0;
	for (let i = 0; i < a.byteLength; i++) {
		c |= a[i] ^ b[i];
	}
	return c === 0;
}

export function invalidateSession(sessionId: string): void {
	db.execute("DELETE FROM session WHERE id = ?", [sessionId]);
}

export function invalidateUserSessions(userId: number): void {
	db.execute("DELETE FROM session WHERE user_id = ?", [userId]);
}

export function setSessionTokenCookie(context: APIContext, token: string, expiresAt: Date): void {
	context.cookies.set("session", token, {
		httpOnly: true,
		path: "/",
		secure: import.meta.env.PROD,
		sameSite: "lax",
		expires: expiresAt
	});
}

export function deleteSessionTokenCookie(context: APIContext): void {
	context.cookies.set("session", "", {
		httpOnly: true,
		path: "/",
		secure: import.meta.env.PROD,
		sameSite: "lax",
		maxAge: 0
	});
}

export interface Session {
	id: string;
	userId: number;
	secretHash: Uint8Array; // Uint8Array is a byte array
	createdAt: Date;
	lastVerifiedAt: Date;
}

export function generateSecureRandomString(): string {
	// Human readable alphabet (a-z, 0-9 without l, o, 0, 1 to avoid confusion)
	const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";

	// Generate 24 bytes = 192 bits of entropy.
	// We're only going to use 5 bits per byte so the total entropy will be 192 * 5 / 8 = 120 bits
	const bytes = new Uint8Array(24);
	crypto.getRandomValues(bytes);

	let id = "";
	for (let i = 0; i < bytes.length; i++) {
		// >> 3 "removes" the right-most 3 bits of the byte
		id += alphabet[bytes[i] >> 3];
	}
	return id;
}

export async function createSession(userId: number): Promise<SessionWithToken> {
	const now = new Date();

	const id = generateSecureRandomString();
	const secret = generateSecureRandomString();
	const secretHash = await hashSecret(secret);

	const token = id + "." + secret;

	const session: SessionWithToken = {
		id,
		userId,
		secretHash,
		createdAt: now,
		lastVerifiedAt: now,
		token
	};

	db.execute("INSERT INTO session (id, user_id, secret_hash, created_at, last_verified_at) VALUES (?, ?, ?, ?, ?)", [
		session.id,
		userId,
		session.secretHash,
		Math.floor(session.createdAt.getTime() / 1000),
		Math.floor(session.lastVerifiedAt.getTime() / 1000)
	]);

	return session;
}

async function hashSecret(secret: string): Promise<Uint8Array> {
	const secretBytes = new TextEncoder().encode(secret);
	const secretHashBuffer = await crypto.subtle.digest("SHA-256", secretBytes);
	return new Uint8Array(secretHashBuffer);
}

interface SessionWithToken extends Session {
	token: string;
}
