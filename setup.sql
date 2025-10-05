CREATE TABLE user (
    id INTEGER NOT NULL PRIMARY KEY,
    github_id INTEGER NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL
);

CREATE INDEX github_id_index ON user(github_id);

CREATE TABLE session (
	id TEXT NOT NULL PRIMARY KEY,
	secret_hash BLOB NOT NULL, -- blob is a SQLite data type for raw binary
	created_at INTEGER NOT NULL, -- unix time (seconds)
    last_verified_at INTEGER NOT NULL, -- unix (seconds)
    user_id INTEGER NOT NULL REFERENCES user(id)
);