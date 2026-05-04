-- ============================================================
-- POLYDIOMS — PostgreSQL Database Schema
-- ============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto"; -- for gen_random_uuid()

-- ============================================================
-- 1. LANGUAGES
-- ============================================================

CREATE TABLE languages (
    id          SERIAL PRIMARY KEY,
    code        CHAR(5)      NOT NULL UNIQUE,  -- e.g. 'en', 'es', 'ja'
    name        VARCHAR(50)  NOT NULL,          -- e.g. 'English', 'Spanish'
    native_name VARCHAR(50)  NOT NULL,          -- e.g. 'Español'
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed initial languages
INSERT INTO languages (code, name, native_name) VALUES
    ('en', 'English', 'English'),
    ('es', 'Spanish', 'Español');


-- ============================================================
-- 2. IDIOMS (Language-neutral core record)
-- ============================================================

CREATE TABLE idioms (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    language_id     INT          NOT NULL REFERENCES languages(id),
    slug            VARCHAR(120) NOT NULL UNIQUE,  -- e.g. 'es-no-hay-mal-que-por-bien-no-venga'
    original_text   TEXT         NOT NULL,          -- idiom in its source language
    transliteration TEXT,                           -- romanization (for non-latin scripts)
    literal_translation TEXT,                       -- word-for-word english gloss
    english_meaning TEXT         NOT NULL,          -- actual meaning in english
    difficulty      SMALLINT     NOT NULL DEFAULT 1 -- 1=easy, 2=medium, 3=hard
        CHECK (difficulty BETWEEN 1 AND 3),
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Index for filtering by language
CREATE INDEX idx_idioms_language ON idioms(language_id);
CREATE INDEX idx_idioms_difficulty ON idioms(difficulty);


-- ============================================================
-- 3. IDIOM EXAMPLES (Sentence usage examples per idiom)
-- ============================================================

CREATE TABLE idiom_examples (
    id              SERIAL  PRIMARY KEY,
    idiom_id        UUID    NOT NULL REFERENCES idioms(id) ON DELETE CASCADE,
    example_text    TEXT    NOT NULL,  -- sentence in source language
    example_translation TEXT NOT NULL, -- english translation of the example
    sort_order      SMALLINT NOT NULL DEFAULT 0
);

CREATE INDEX idx_examples_idiom ON idiom_examples(idiom_id);


-- ============================================================
-- 4. QUIZ QUESTIONS
-- ============================================================

CREATE TYPE question_type AS ENUM (
    'meaning_from_idiom',    -- show idiom → pick correct meaning
    'idiom_from_meaning',    -- show meaning → pick correct idiom
    'fill_in_example'        -- show gapped sentence → pick correct idiom
);

CREATE TABLE questions (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    idiom_id        UUID         NOT NULL REFERENCES idioms(id) ON DELETE CASCADE,
    question_type   question_type NOT NULL DEFAULT 'meaning_from_idiom',
    prompt_text     TEXT         NOT NULL,  -- the displayed question text
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_questions_idiom ON questions(idiom_id);


-- ============================================================
-- 5. ANSWER CHOICES (always 4 per question)
-- ============================================================

CREATE TABLE answer_choices (
    id              SERIAL  PRIMARY KEY,
    question_id     UUID    NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
    choice_text     TEXT    NOT NULL,
    is_correct      BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order      SMALLINT NOT NULL  -- 0-3, for display order
);

CREATE INDEX idx_choices_question ON answer_choices(question_id);

-- Enforce exactly 1 correct answer per question
CREATE UNIQUE INDEX idx_one_correct_answer
    ON answer_choices(question_id)
    WHERE is_correct = TRUE;


-- ============================================================
-- 6. USERS (codename-only, no email)
-- ============================================================

CREATE TABLE users (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    codename        VARCHAR(30)  NOT NULL UNIQUE,  -- unique display name, no email
    password_hash   TEXT         NOT NULL,          -- bcrypt hash
    avatar_emoji    VARCHAR(10)  DEFAULT '🧠',      -- fun avatar
    total_score     INT          NOT NULL DEFAULT 0,
    games_played    INT          NOT NULL DEFAULT 0,
    is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_seen_at    TIMESTAMPTZ
);

-- Case-insensitive unique codename index
CREATE UNIQUE INDEX idx_users_codename_ci
    ON users(LOWER(codename));


-- ============================================================
-- 7. GAME SESSIONS (one per play-through)
-- ============================================================

CREATE TABLE game_sessions (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    language_id     INT          NOT NULL REFERENCES languages(id),
    difficulty      SMALLINT,    -- NULL = mixed, else 1/2/3
    score           INT          NOT NULL DEFAULT 0,
    total_questions SMALLINT     NOT NULL DEFAULT 10,
    correct_answers SMALLINT     NOT NULL DEFAULT 0,
    time_taken_secs INT,         -- total seconds for the session
    completed_at    TIMESTAMPTZ,
    started_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user    ON game_sessions(user_id);
CREATE INDEX idx_sessions_lang    ON game_sessions(language_id);
CREATE INDEX idx_sessions_score   ON game_sessions(score DESC); -- fast leaderboard


-- ============================================================
-- 8. SESSION ANSWERS (per-question answer log)
-- ============================================================

CREATE TABLE session_answers (
    id              SERIAL      PRIMARY KEY,
    session_id      UUID        NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
    question_id     UUID        NOT NULL REFERENCES questions(id),
    chosen_choice_id INT        NOT NULL REFERENCES answer_choices(id),
    is_correct      BOOLEAN     NOT NULL,
    points_awarded  SMALLINT    NOT NULL DEFAULT 0,
    answered_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_answers_session  ON session_answers(session_id);


-- ============================================================
-- 9. LEADERBOARD (materialized view for fast top-score queries)
-- ============================================================

CREATE MATERIALIZED VIEW leaderboard_alltime AS
SELECT
    u.id                         AS user_id,
    u.codename,
    u.avatar_emoji,
    u.total_score,
    u.games_played,
    RANK() OVER (ORDER BY u.total_score DESC) AS rank
FROM users u
WHERE u.is_active = TRUE
ORDER BY u.total_score DESC
LIMIT 100;

-- Refresh this view after each completed game session
CREATE UNIQUE INDEX idx_leaderboard_user ON leaderboard_alltime(user_id);


-- Per-language leaderboard view
CREATE MATERIALIZED VIEW leaderboard_by_language AS
SELECT
    gs.language_id,
    l.name                       AS language_name,
    u.id                         AS user_id,
    u.codename,
    u.avatar_emoji,
    SUM(gs.score)                AS lang_score,
    COUNT(gs.id)                 AS games_in_language,
    RANK() OVER (
        PARTITION BY gs.language_id
        ORDER BY SUM(gs.score) DESC
    )                            AS rank
FROM game_sessions gs
JOIN users u  ON u.id  = gs.user_id
JOIN languages l ON l.id = gs.language_id
WHERE gs.completed_at IS NOT NULL
GROUP BY gs.language_id, l.name, u.id, u.codename, u.avatar_emoji
ORDER BY gs.language_id, lang_score DESC;

CREATE UNIQUE INDEX ON public.leaderboard_by_language (language_id, rank);
CREATE INDEX idx_lb_lang ON leaderboard_by_language(language_id, rank);