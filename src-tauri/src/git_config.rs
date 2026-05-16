use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

const GITHUB_CONFIG_FILE: &str = "github-config.json";
const THINKINGKITTY_DIR: &str = ".thinkingkity";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitAuthConfig {
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub token: String,
}

impl Default for GitAuthConfig {
    fn default() -> Self {
        Self {
            username: String::new(),
            token: String::new(),
        }
    }
}


fn config_path(vault_path: &Path) -> PathBuf {
    vault_path.join(THINKINGKITTY_DIR).join(GITHUB_CONFIG_FILE)
}

pub fn read_git_config(vault_path: &Path) -> Result<GitAuthConfig, String> {
    let path = config_path(vault_path);
    if !path.exists() {
        return Ok(GitAuthConfig::default());
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read git config: {}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse git config: {}", e))
}

pub fn write_git_config(vault_path: &Path, config: &GitAuthConfig) -> Result<(), String> {
    let path = config_path(vault_path);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create config dir: {}", e))?;
    }
    let content = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize git config: {}", e))?;
    std::fs::write(&path, content).map_err(|e| format!("Failed to write git config: {}", e))
}
