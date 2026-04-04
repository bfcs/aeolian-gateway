-- Gateway Keys Table: Stores API keys issued to users of this gateway
CREATE TABLE IF NOT EXISTS gateway_keys (
    id TEXT PRIMARY KEY,
    key_hash TEXT NOT NULL UNIQUE, 
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    allowed_models TEXT, 
    is_enabled BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Playground Projects Table: Stores the full state of a playground session/project
CREATE TABLE IF NOT EXISTS playground_projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    state TEXT, -- JSON blob containing the windows/splits configuration
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Request Logs Table: Stores detailed information about each upstream request
CREATE TABLE IF NOT EXISTS request_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    key_name TEXT,
    provider TEXT,
    model TEXT,
    status INTEGER,
    duration INTEGER,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    error_message TEXT,
    is_stream BOOLEAN DEFAULT 0,
    thinking_level TEXT,
    provider_type TEXT,
    request_method TEXT,
    request_path TEXT,
    request_body TEXT,
    response_body TEXT,
    upstream_url TEXT
);

-- Providers Table: Stores AI provider configurations
CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    base_url TEXT NOT NULL,
    is_enabled BOOLEAN DEFAULT 1,
    is_online BOOLEAN DEFAULT 0,
    referral_text TEXT,
    referral_link TEXT,
    homepage_url TEXT, -- Provider's official homepage URL
    icon TEXT,  -- Provider-specific icon URL, sourced from subscription's model_icon field
    description TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Provider Keys Table: Stores API keys for each provider
CREATE TABLE IF NOT EXISTS provider_keys (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL,
    key_value TEXT NOT NULL,
    weight INTEGER DEFAULT 10,
    is_enabled BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
);

-- Model Rules Table: Unified routing for aliases and native model IDs
CREATE TABLE IF NOT EXISTS model_rules (
    id TEXT PRIMARY KEY,
    identifier TEXT NOT NULL,      -- Could be an alias (e.g. 'simple') or a model ID (e.g. 'gpt-4o')
    description TEXT DEFAULT '',
    is_alias BOOLEAN DEFAULT 0,    -- 1 for user-defined aliases, 0 for native models
    provider_id TEXT,              -- Target Provider ID (can be NULL if alias points to another generic identifier)
    target_model TEXT NOT NULL,    -- The real model name on the provider
    type TEXT NOT NULL,            -- 'openai' or 'google'
    weight INTEGER DEFAULT 10,    -- Model-level LB weight
    is_enabled BOOLEAN DEFAULT 1,
    is_auto_synced BOOLEAN DEFAULT 0, -- 1 if auto-generated from provider's model list
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Ensure uniqueness: 
-- 1. For native models (is_alias=0): (identifier, provider_id) must be unique.
-- 2. For aliases (is_alias=1): (identifier, provider_id, target_model) must be unique to allow multiple targets.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rules_unique_mapping ON model_rules(identifier, provider_id, is_alias, target_model);

-- Trigger to prevent an identifier from being used as both an alias and a native model (Global exclusivity of the name's role)
CREATE TRIGGER IF NOT EXISTS validate_model_rule_type_insert
BEFORE INSERT ON model_rules
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM model_rules WHERE identifier = NEW.identifier AND is_alias != NEW.is_alias)
BEGIN
    SELECT RAISE(ABORT, '冲突：该名称已被用作其他用途（模型 ID 或 别名）');
END;

CREATE TRIGGER IF NOT EXISTS validate_model_rule_type_update
BEFORE UPDATE ON model_rules
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM model_rules WHERE identifier = NEW.identifier AND is_alias != NEW.is_alias AND id != OLD.id)
BEGIN
    SELECT RAISE(ABORT, '冲突：该名称已被用作其他用途（模型 ID 或 别名）');
END;

-- Configs Table: Stores flexible configuration key-value pairs
-- Keys:
-- subscription_url: Global providers subscription source URL
-- log_entry_count: Maximum number of recent log entries to keep
-- max_body_chars: Maximum character count for request/response bodies before truncation
CREATE TABLE IF NOT EXISTS configs (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Default system configurations
INSERT OR IGNORE INTO configs (key, value) VALUES ('subscription_url', 'https://gist.githubusercontent.com/bfcs/2bfbee5d48e159ecfc502d3217e931c0/raw/91d3626de9b893ca1cb8885b343f5864f5e16369/providers.json');
INSERT OR IGNORE INTO configs (key, value) VALUES ('log_entry_count', '50');
INSERT OR IGNORE INTO configs (key, value) VALUES ('max_body_chars', '3000');

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_gateway_keys_key ON gateway_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON request_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_logs_key_name ON request_logs(key_name);
CREATE INDEX IF NOT EXISTS idx_rules_identifier ON model_rules(identifier);
CREATE INDEX IF NOT EXISTS idx_rules_type ON model_rules(type);
